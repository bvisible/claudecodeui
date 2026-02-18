/**
 * Claude SDK Integration
 *
 * This module provides SDK-based integration with Claude using the @anthropic-ai/claude-agent-sdk.
 * It mirrors the interface of claude-cli.js but uses the SDK internally for better performance
 * and maintainability.
 *
 * Key features:
 * - Direct SDK integration without child processes
 * - Session management with abort capability
 * - Options mapping between CLI and SDK formats
 * - WebSocket message streaming
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { CLAUDE_MODELS } from '../shared/modelConstants.js';

const activeSessions = new Map();
const pendingToolApprovals = new Map();

const TOOL_APPROVAL_TIMEOUT_MS = parseInt(process.env.CLAUDE_TOOL_APPROVAL_TIMEOUT_MS, 10) || 55000;

const TOOLS_REQUIRING_INTERACTION = new Set(['AskUserQuestion', 'ExitPlanMode']);

function createRequestId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function waitForToolApproval(requestId, options = {}) {
  const { timeoutMs = TOOL_APPROVAL_TIMEOUT_MS, signal, onCancel } = options;

  return new Promise(resolve => {
    let settled = false;

    const finalize = (decision) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(decision);
    };

    let timeout;

    const cleanup = () => {
      pendingToolApprovals.delete(requestId);
      if (timeout) clearTimeout(timeout);
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
      }
    };

    // timeoutMs 0 = wait indefinitely (interactive tools)
    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        onCancel?.('timeout');
        finalize(null);
      }, timeoutMs);
    }

    const abortHandler = () => {
      onCancel?.('cancelled');
      finalize({ cancelled: true });
    };

    if (signal) {
      if (signal.aborted) {
        onCancel?.('cancelled');
        finalize({ cancelled: true });
        return;
      }
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    pendingToolApprovals.set(requestId, (decision) => {
      finalize(decision);
    });
  });
}

function resolveToolApproval(requestId, decision) {
  const resolver = pendingToolApprovals.get(requestId);
  if (resolver) {
    resolver(decision);
  }
}

// Match stored permission entries against a tool + input combo.
// This only supports exact tool names and the Bash(command:*) shorthand
// used by the UI; it intentionally does not implement full glob semantics,
// introduced to stay consistent with the UI's "Allow rule" format.
function matchesToolPermission(entry, toolName, input) {
  if (!entry || !toolName) {
    return false;
  }

  if (entry === toolName) {
    return true;
  }

  const bashMatch = entry.match(/^Bash\((.+):\*\)$/);
  if (toolName === 'Bash' && bashMatch) {
    const allowedPrefix = bashMatch[1];
    let command = '';

    if (typeof input === 'string') {
      command = input.trim();
    } else if (input && typeof input === 'object' && typeof input.command === 'string') {
      command = input.command.trim();
    }

    if (!command) {
      return false;
    }

    return command.startsWith(allowedPrefix);
  }

  return false;
}

/**
 * Maps CLI options to SDK-compatible options format
 * @param {Object} options - CLI options
 * @returns {Object} SDK-compatible options
 */
function mapCliOptionsToSDK(options = {}) {
  const { sessionId, cwd, toolsSettings, permissionMode, images } = options;

  const sdkOptions = {};

  // Map working directory
  if (cwd) {
    sdkOptions.cwd = cwd;
  }

  // Map permission mode
  console.log(`[SDK] Permission mode from frontend: '${permissionMode}'`);
  if (permissionMode && permissionMode !== 'default') {
    sdkOptions.permissionMode = permissionMode;
  }

  // Map tool settings
  const settings = toolsSettings || {
    allowedTools: [],
    disallowedTools: [],
    skipPermissions: false
  };

  // Handle tool permissions — skip override when in plan mode so SDK keeps plan workflow
  if (settings.skipPermissions && permissionMode !== 'plan') {
    sdkOptions.permissionMode = 'bypassPermissions';
  }
  // Carry skipPermissions flag so canUseTool can auto-allow in plan mode too
  sdkOptions.skipPermissions = Boolean(settings.skipPermissions);

  let allowedTools = [...(settings.allowedTools || [])];

  // Add plan mode default tools
  if (permissionMode === 'plan') {
    const planModeTools = ['Read', 'Task', 'exit_plan_mode', 'TodoRead', 'TodoWrite', 'WebFetch', 'WebSearch'];
    for (const tool of planModeTools) {
      if (!allowedTools.includes(tool)) {
        allowedTools.push(tool);
      }
    }
  }

  sdkOptions.allowedTools = allowedTools;

  // Use the tools preset to make all default built-in tools available (including AskUserQuestion).
  // This was introduced in SDK 0.1.57. Omitting this preserves existing behavior (all tools available),
  // but being explicit ensures forward compatibility and clarity.
  sdkOptions.tools = { type: 'preset', preset: 'claude_code' };

  sdkOptions.disallowedTools = settings.disallowedTools || [];

  // Map model (default to sonnet)
  // Valid models: sonnet, opus, haiku, opusplan, sonnet[1m]
  sdkOptions.model = options.model || CLAUDE_MODELS.DEFAULT;
  console.log(`Using model: ${sdkOptions.model}`);

  // Map system prompt configuration
  sdkOptions.systemPrompt = {
    type: 'preset',
    preset: 'claude_code'  // Required to use CLAUDE.md
  };

  // Map setting sources for CLAUDE.md loading
  // This loads CLAUDE.md from project, user (~/.config/claude/CLAUDE.md), and local directories
  sdkOptions.settingSources = ['project', 'user', 'local'];

  // Enable partial streaming — sends raw API events (content_block_delta etc.)
  // for real-time text display instead of waiting for the full message.
  sdkOptions.includePartialMessages = true;

  // Agent loop: maxTurns controls how many API round-trips the agent can do.
  // Each turn = one API call. Tool use needs at least 2 turns (call + result).
  // We break out of the generator on `type=result` anyway, but this is a safety net.
  // Default 200 — the result break and budget cap are the real guards.
  sdkOptions.maxTurns = parseInt(process.env.MAX_TURNS, 10) || 200;

  // Budget cap per session (USD). Prevents runaway costs from looping agents.
  const maxBudget = parseFloat(process.env.MAX_BUDGET_USD);
  if (!isNaN(maxBudget) && maxBudget > 0) {
    sdkOptions.maxBudgetUsd = maxBudget;
  }

  // Extended thinking budget. Higher = better quality responses (more reasoning).
  // On subscription plans there's no per-token cost, so default high for best results.
  // Set MAX_THINKING_TOKENS=0 to let the SDK use its own default.
  const maxThinking = parseInt(process.env.MAX_THINKING_TOKENS, 10);
  if (!isNaN(maxThinking) && maxThinking > 0) {
    sdkOptions.maxThinkingTokens = maxThinking;
  }

  // Map resume session
  if (sessionId) {
    sdkOptions.resume = sessionId;
  }

  return sdkOptions;
}

/**
 * Adds a session to the active sessions map
 * @param {string} sessionId - Session identifier
 * @param {Object} queryInstance - SDK query instance
 * @param {Array<string>} tempImagePaths - Temp image file paths for cleanup
 * @param {string} tempDir - Temp directory for cleanup
 */
function addSession(sessionId, queryInstance, abortController, tempImagePaths = [], tempDir = null) {
  activeSessions.set(sessionId, {
    instance: queryInstance,
    abortController,
    startTime: Date.now(),
    status: 'active',
    tempImagePaths,
    tempDir
  });
}

/**
 * Removes a session from the active sessions map
 * @param {string} sessionId - Session identifier
 */
function removeSession(sessionId) {
  activeSessions.delete(sessionId);
}

/**
 * Gets a session from the active sessions map
 * @param {string} sessionId - Session identifier
 * @returns {Object|undefined} Session data or undefined
 */
function getSession(sessionId) {
  return activeSessions.get(sessionId);
}

/**
 * Gets all active session IDs
 * @returns {Array<string>} Array of active session IDs
 */
function getAllSessions() {
  return Array.from(activeSessions.keys());
}

/**
 * Extracts token usage from SDK result messages
 * @param {Object} resultMessage - SDK result message
 * @returns {Object|null} Token budget object or null
 */
function extractTokenBudget(resultMessage) {
  if (resultMessage.type !== 'result' || !resultMessage.modelUsage) {
    return null;
  }

  // Get the first model's usage data
  const modelKey = Object.keys(resultMessage.modelUsage)[0];
  const modelData = resultMessage.modelUsage[modelKey];

  if (!modelData) {
    return null;
  }

  // Use cumulative tokens if available (tracks total for the session)
  // Otherwise fall back to per-request tokens
  const inputTokens = modelData.cumulativeInputTokens || modelData.inputTokens || 0;
  const outputTokens = modelData.cumulativeOutputTokens || modelData.outputTokens || 0;
  const cacheReadTokens = modelData.cumulativeCacheReadInputTokens || modelData.cacheReadInputTokens || 0;
  const cacheCreationTokens = modelData.cumulativeCacheCreationInputTokens || modelData.cacheCreationInputTokens || 0;

  // Total used = input + output + cache tokens
  const totalUsed = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;

  // Use configured context window budget from environment (default 160000)
  // This is the user's budget limit, not the model's context window
  const contextWindow = parseInt(process.env.CONTEXT_WINDOW) || 160000;

  console.log(`Token calculation: input=${inputTokens}, output=${outputTokens}, cache=${cacheReadTokens + cacheCreationTokens}, total=${totalUsed}/${contextWindow}`);

  return {
    used: totalUsed,
    total: contextWindow
  };
}

/**
 * Handles image processing for SDK queries
 * Saves base64 images to temporary files and returns modified prompt with file paths
 * @param {string} command - Original user prompt
 * @param {Array} images - Array of image objects with base64 data
 * @param {string} cwd - Working directory for temp file creation
 * @returns {Promise<Object>} {modifiedCommand, tempImagePaths, tempDir}
 */
async function handleImages(command, images, cwd) {
  const tempImagePaths = [];
  let tempDir = null;

  if (!images || images.length === 0) {
    return { modifiedCommand: command, tempImagePaths, tempDir };
  }

  try {
    // Create temp directory in the project directory
    const workingDir = cwd || process.cwd();
    tempDir = path.join(workingDir, '.tmp', 'images', Date.now().toString());
    await fs.mkdir(tempDir, { recursive: true });

    // Save each image to a temp file
    for (const [index, image] of images.entries()) {
      // Extract base64 data and mime type
      const matches = image.data.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        console.error('Invalid image data format');
        continue;
      }

      const [, mimeType, base64Data] = matches;
      const extension = mimeType.split('/')[1] || 'png';
      const filename = `image_${index}.${extension}`;
      const filepath = path.join(tempDir, filename);

      // Write base64 data to file
      await fs.writeFile(filepath, Buffer.from(base64Data, 'base64'));
      tempImagePaths.push(filepath);
    }

    // Include the full image paths in the prompt
    let modifiedCommand = command;
    if (tempImagePaths.length > 0 && command && command.trim()) {
      const imageNote = `\n\n[Images provided at the following paths:]\n${tempImagePaths.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
      modifiedCommand = command + imageNote;
    }

    console.log(`Processed ${tempImagePaths.length} images to temp directory: ${tempDir}`);
    return { modifiedCommand, tempImagePaths, tempDir };
  } catch (error) {
    console.error('Error processing images for SDK:', error);
    return { modifiedCommand: command, tempImagePaths, tempDir };
  }
}

/**
 * Cleans up temporary image files
 * @param {Array<string>} tempImagePaths - Array of temp file paths to delete
 * @param {string} tempDir - Temp directory to remove
 */
async function cleanupTempFiles(tempImagePaths, tempDir) {
  if (!tempImagePaths || tempImagePaths.length === 0) {
    return;
  }

  try {
    // Delete individual temp files
    for (const imagePath of tempImagePaths) {
      await fs.unlink(imagePath).catch(err =>
        console.error(`Failed to delete temp image ${imagePath}:`, err)
      );
    }

    // Delete temp directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(err =>
        console.error(`Failed to delete temp directory ${tempDir}:`, err)
      );
    }

    console.log(`Cleaned up ${tempImagePaths.length} temp image files`);
  } catch (error) {
    console.error('Error during temp file cleanup:', error);
  }
}

/**
 * Loads MCP server configurations from multiple sources:
 * 1. ~/.claude.json (global + project-specific mcpServers)
 * 2. ~/.claude/*.json files containing mcpServers objects (e.g. mcp-knowledge.json)
 * 3. Project-specific configs from ~/.claude.json projects key
 * @param {string} cwd - Current working directory for project-specific configs
 * @returns {Object|null} MCP servers object or null if none found
 */
async function loadMcpConfig(cwd) {
  try {
    let mcpServers = {};

    // Source 1: ~/.claude.json (global + project-specific)
    const claudeConfigPath = path.join(os.homedir(), '.claude.json');
    try {
      const configContent = await fs.readFile(claudeConfigPath, 'utf8');
      const claudeConfig = JSON.parse(configContent);

      // Global MCP servers
      if (claudeConfig.mcpServers && typeof claudeConfig.mcpServers === 'object') {
        Object.assign(mcpServers, claudeConfig.mcpServers);
        console.log(`Loaded ${Object.keys(claudeConfig.mcpServers).length} global MCP servers from ~/.claude.json`);
      }

      // Project-specific MCP servers (from "projects" key)
      if (claudeConfig.projects && cwd) {
        const projectConfig = claudeConfig.projects[cwd];
        if (projectConfig?.mcpServers && typeof projectConfig.mcpServers === 'object' && Object.keys(projectConfig.mcpServers).length > 0) {
          Object.assign(mcpServers, projectConfig.mcpServers);
          console.log(`Loaded ${Object.keys(projectConfig.mcpServers).length} project MCP servers for ${cwd}`);
        }
      }
    } catch {
      // ~/.claude.json doesn't exist or can't be parsed — not an error
    }

    // Source 2: ~/.claude/*.json files containing mcpServers
    const claudeDir = path.join(os.homedir(), '.claude');
    try {
      const entries = await fs.readdir(claudeDir);
      for (const entry of entries) {
        if (!entry.endsWith('.json') || entry === 'settings.json' || entry === 'stats-cache.json' || entry === '.credentials.json') {
          continue;
        }
        try {
          const filePath = path.join(claudeDir, entry);
          const content = await fs.readFile(filePath, 'utf8');
          const parsed = JSON.parse(content);
          if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
            const serverCount = Object.keys(parsed.mcpServers).length;
            if (serverCount > 0) {
              Object.assign(mcpServers, parsed.mcpServers);
              console.log(`Loaded ${serverCount} MCP servers from ~/.claude/${entry}`);
            }
          }
        } catch {
          // Skip files that can't be parsed
        }
      }
    } catch {
      // ~/.claude/ directory doesn't exist — not an error
    }

    if (Object.keys(mcpServers).length === 0) {
      console.log('No MCP servers configured');
      return null;
    }

    console.log(`Total MCP servers loaded: ${Object.keys(mcpServers).length} (${Object.keys(mcpServers).join(', ')})`);
    return mcpServers;
  } catch (error) {
    console.error('Error loading MCP config:', error.message);
    return null;
  }
}

/**
 * Executes a Claude query using the SDK
 * @param {string} command - User prompt/command
 * @param {Object} options - Query options
 * @param {Object} ws - WebSocket connection
 * @returns {Promise<void>}
 */
async function queryClaudeSDK(command, options = {}, ws) {
  const { sessionId } = options;
  let capturedSessionId = sessionId;
  let sessionCreatedSent = false;
  let tempImagePaths = [];
  let tempDir = null;

  // Create AbortController for this session — passed to SDK for native cancellation
  const sessionAbortController = new AbortController();

  try {
    // Map CLI options to SDK format
    const sdkOptions = mapCliOptionsToSDK(options);

    // Pass abort controller to SDK for native request cancellation
    sdkOptions.abortController = sessionAbortController;

    // Load MCP configuration
    const mcpServers = await loadMcpConfig(options.cwd);
    if (mcpServers) {
      sdkOptions.mcpServers = mcpServers;
    }

    // Handle images - save to temp files and modify prompt
    const imageResult = await handleImages(command, options.images, options.cwd);
    const finalCommand = imageResult.modifiedCommand;
    tempImagePaths = imageResult.tempImagePaths;
    tempDir = imageResult.tempDir;

    sdkOptions.canUseTool = async (toolName, input, context) => {
      console.log(`[canUseTool] tool=${toolName} permissionMode=${sdkOptions.permissionMode}`);

      // Bypass, skipPermissions, or plan mode: auto-allow everything except interactive tools
      // Plan mode = exploration phase, SDK already restricts to read-only — no need for permission prompts
      // AskUserQuestion and ExitPlanMode require user interaction (answers / plan approval)
      if (!TOOLS_REQUIRING_INTERACTION.has(toolName) && (sdkOptions.permissionMode === 'bypassPermissions' || sdkOptions.permissionMode === 'plan' || sdkOptions.skipPermissions)) {
        console.log(`[canUseTool] Auto-allowing ${toolName} (bypass/plan/skipPermissions)`);
        return { behavior: 'allow', updatedInput: input };
      }

      const requiresInteraction = TOOLS_REQUIRING_INTERACTION.has(toolName);

      if (!requiresInteraction) {

        const isDisallowed = (sdkOptions.disallowedTools || []).some(entry =>
          matchesToolPermission(entry, toolName, input)
        );
        if (isDisallowed) {
          return { behavior: 'deny', message: 'Tool disallowed by settings' };
        }

        const isAllowed = (sdkOptions.allowedTools || []).some(entry =>
          matchesToolPermission(entry, toolName, input)
        );
        if (isAllowed) {
          return { behavior: 'allow', updatedInput: input };
        }
      }

      const requestId = createRequestId();
      ws.send({
        type: 'claude-permission-request',
        requestId,
        toolName,
        input,
        sessionId: capturedSessionId || sessionId || null
      });

      const decision = await waitForToolApproval(requestId, {
        timeoutMs: requiresInteraction ? 0 : undefined,
        signal: context?.signal,
        onCancel: (reason) => {
          ws.send({
            type: 'claude-permission-cancelled',
            requestId,
            reason,
            sessionId: capturedSessionId || sessionId || null
          });
        }
      });
      if (!decision) {
        return { behavior: 'deny', message: 'Permission request timed out' };
      }

      if (decision.cancelled) {
        return { behavior: 'deny', message: 'Permission request cancelled' };
      }

      if (decision.allow) {
        if (decision.rememberEntry && typeof decision.rememberEntry === 'string') {
          if (!sdkOptions.allowedTools.includes(decision.rememberEntry)) {
            sdkOptions.allowedTools.push(decision.rememberEntry);
          }
          if (Array.isArray(sdkOptions.disallowedTools)) {
            sdkOptions.disallowedTools = sdkOptions.disallowedTools.filter(entry => entry !== decision.rememberEntry);
          }
        }

        // After ExitPlanMode approval, switch permission mode if user requested it
        if (toolName === 'ExitPlanMode' && decision.permissionMode) {
          const sid = capturedSessionId || sessionId;
          const session = sid ? activeSessions.get(sid) : null;
          if (session?.queryInstance?.setPermissionMode) {
            session.queryInstance.setPermissionMode(decision.permissionMode);
            sdkOptions.permissionMode = decision.permissionMode;
            console.log(`[canUseTool] ExitPlanMode approved — switched to permissionMode=${decision.permissionMode}`);
          }
        }

        return { behavior: 'allow', updatedInput: decision.updatedInput ?? input };
      }

      return { behavior: 'deny', message: decision.message ?? 'User denied tool use' };
    };

    // Set stream-close timeout high enough for interactive tools (ExitPlanMode, AskUserQuestion).
    // SDK default is 5s — we need much more since users may take minutes to review plans.
    const prevStreamTimeout = process.env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT;
    process.env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT = '3600000';

    const queryInstance = query({
      prompt: finalCommand,
      options: sdkOptions
    });

    // Apply thinking budget on the query instance if explicitly configured
    const envThinking = parseInt(process.env.MAX_THINKING_TOKENS, 10);
    if (!isNaN(envThinking) && envThinking > 0 && typeof queryInstance.setMaxThinkingTokens === 'function') {
      queryInstance.setMaxThinkingTokens(envThinking);
      console.log(`[SDK] setMaxThinkingTokens(${envThinking}) called on query instance`);
    }

    // Restore immediately — Query constructor already captured the value
    if (prevStreamTimeout !== undefined) {
      process.env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT = prevStreamTimeout;
    } else {
      delete process.env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT;
    }

    // Track the query instance for abort capability
    if (capturedSessionId) {
      addSession(capturedSessionId, queryInstance, sessionAbortController, tempImagePaths, tempDir);
    }

    // Process streaming messages
    console.log('Starting async generator loop for session:', capturedSessionId || 'NEW');
    let aborted = false;
    for await (const message of queryInstance) {
      // Check if session was aborted (via AbortController signal)
      if (sessionAbortController.signal.aborted) {
        console.log(`[SDK] Session ${capturedSessionId} aborted, breaking generator loop`);
        aborted = true;
        break;
      }

      // Log message type for debugging agent loop behavior
      console.log(`[SDK msg] type=${message.type}${message.subtype ? ' subtype=' + message.subtype : ''}${message.tool ? ' tool=' + message.tool : ''}`);

      // Capture session ID from first message
      if (message.session_id && !capturedSessionId) {

        capturedSessionId = message.session_id;
        addSession(capturedSessionId, queryInstance, sessionAbortController, tempImagePaths, tempDir);

        // Set session ID on writer
        if (ws.setSessionId && typeof ws.setSessionId === 'function') {
          ws.setSessionId(capturedSessionId);
        }

        // Send session-created event only once for new sessions
        if (!sessionId && !sessionCreatedSent) {
          sessionCreatedSent = true;
          ws.send({
            type: 'session-created',
            sessionId: capturedSessionId
          });
        }
      }

      // Handle stream events — unwrap SDK wrapper so frontend gets raw API events
      // (content_block_delta, content_block_stop, etc.) for real-time text display
      if (message.type === 'stream_event') {
        ws.send({
          type: 'claude-response',
          data: message.event,
          sessionId: capturedSessionId || sessionId || null
        });
        continue;
      }

      // For complete assistant messages: filter out text blocks since they were
      // already streamed via content_block_delta events above. Keep tool_use
      // and thinking blocks which the frontend handles from complete messages.
      if (message.type === 'assistant' && message.message?.content) {
        const nonTextContent = message.message.content.filter(b => b.type !== 'text');
        if (nonTextContent.length === 0) {
          // Only text blocks — already streamed, skip this message
          continue;
        }
        // Forward with only non-text blocks (tool_use, thinking)
        ws.send({
          type: 'claude-response',
          data: { ...message, message: { ...message.message, content: nonTextContent } },
          sessionId: capturedSessionId || sessionId || null
        });
        continue;
      }

      // All other messages (system, user, result) — forward as-is
      ws.send({
        type: 'claude-response',
        data: message,
        sessionId: capturedSessionId || sessionId || null
      });

      // Extract and send token budget updates from result messages
      if (message.type === 'result') {
        const tokenBudget = extractTokenBudget(message);
        if (tokenBudget) {
          console.log('Token budget from modelUsage:', tokenBudget);
          ws.send({
            type: 'token-budget',
            data: tokenBudget,
            sessionId: capturedSessionId || sessionId || null
          });
        }

        // Send cost tracking data if available
        if (message.subtype === 'success' && message.total_cost_usd !== undefined) {
          console.log(`Session cost: $${message.total_cost_usd.toFixed(4)}, duration: ${message.duration_ms}ms`);
          ws.send({
            type: 'cost-update',
            cost: message.total_cost_usd,
            duration: message.duration_ms,
            sessionId: capturedSessionId || sessionId || null
          });
        }

        // Break the loop after the result message. The SDK async generator
        // may not close itself even after maxTurns is reached, which would
        // leave the for-await hanging indefinitely and prevent claude-complete
        // from ever being sent to the frontend.
        console.log('[SDK] Result received, breaking out of generator loop');
        break;
      }
    }

    // Clean up session on completion
    if (capturedSessionId) {
      removeSession(capturedSessionId);
    }

    // Clean up temporary image files
    await cleanupTempFiles(tempImagePaths, tempDir);

    // Send completion event
    const exitCode = aborted ? 1 : 0;
    console.log(`Streaming ${aborted ? 'aborted' : 'complete'}, sending claude-complete event`);
    ws.send({
      type: 'claude-complete',
      sessionId: capturedSessionId,
      exitCode,
      isNewSession: !sessionId && !!command
    });
    console.log('claude-complete event sent');

  } catch (error) {
    console.error('SDK query error:', error);

    // Clean up session on error
    if (capturedSessionId) {
      removeSession(capturedSessionId);
    }

    // Clean up temporary image files on error
    await cleanupTempFiles(tempImagePaths, tempDir);

    // Send error to WebSocket
    ws.send({
      type: 'claude-error',
      error: error.message,
      sessionId: capturedSessionId || sessionId || null
    });

    throw error;
  }
}

/**
 * Aborts an active SDK session
 * @param {string} sessionId - Session identifier
 * @returns {boolean} True if session was aborted, false if not found
 */
async function abortClaudeSDKSession(sessionId) {
  const session = getSession(sessionId);

  if (!session) {
    // Session already gone (e.g. server restart) — treat as successfully stopped
    console.log(`Session ${sessionId} not found (already stopped)`);
    return true;
  }

  // Already aborting — don't re-trigger
  if (session.status === 'aborted') {
    console.log(`Session ${sessionId} already aborting`);
    return true;
  }

  try {
    console.log(`Aborting SDK session: ${sessionId}`);

    // Signal abort to the generator loop
    session.status = 'aborted';
    session.abortController.abort();

    // Call interrupt() on the query instance
    await session.instance.interrupt();

    return true;
  } catch (error) {
    console.error(`Error aborting session ${sessionId}:`, error);
    // Still try to force-clean even on error
    removeSession(sessionId);
    return false;
  }
}

/**
 * Checks if an SDK session is currently active
 * @param {string} sessionId - Session identifier
 * @returns {boolean} True if session is active
 */
function isClaudeSDKSessionActive(sessionId) {
  const session = getSession(sessionId);
  return session && session.status === 'active';
}

/**
 * Gets all active SDK session IDs
 * @returns {Array<string>} Array of active session IDs
 */
function getActiveClaudeSDKSessions() {
  return getAllSessions();
}

// Export public API
export {
  queryClaudeSDK,
  abortClaudeSDKSession,
  isClaudeSDKSessionActive,
  getActiveClaudeSDKSessions,
  resolveToolApproval
};
