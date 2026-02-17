/**
 * Frappe Authentication Middleware
 *
 * Validates the Frappe session cookie (sid) against the Frappe API
 * and ensures the user has the System Manager role.
 *
 * Used to protect all ClaudeCodeUI routes — only authenticated
 * Frappe System Managers can access the service.
 */

import fetch from 'node-fetch';

const FRAPPE_URL = process.env.FRAPPE_URL || 'http://127.0.0.1:8000';
const FRAPPE_SITE = process.env.FRAPPE_SITE || 'prod.local';

// Cache validated sessions to avoid hitting Frappe on every request
// Key: sid, Value: { user, validatedAt }
const sessionCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Validate a Frappe session cookie and check System Manager role
 * @param {string} sid - The Frappe session ID cookie
 * @returns {Promise<{valid: boolean, user?: string, error?: string}>}
 */
async function validateFrappeSession(sid) {
  if (!sid || sid === 'Guest') {
    return { valid: false, error: 'No session' };
  }

  // Check cache first
  const cached = sessionCache.get(sid);
  if (cached && (Date.now() - cached.validatedAt) < CACHE_TTL_MS) {
    return { valid: true, user: cached.user };
  }

  try {
    // Step 1: Get logged user from Frappe
    const userRes = await fetch(`${FRAPPE_URL}/api/method/frappe.auth.get_logged_user`, {
      headers: {
        'Cookie': `sid=${sid}`,
        'Host': FRAPPE_SITE,
        'Accept': 'application/json',
      },
    });

    if (!userRes.ok) {
      return { valid: false, error: 'Invalid session' };
    }

    const userData = await userRes.json();
    const user = userData?.message;

    if (!user || user === 'Guest') {
      return { valid: false, error: 'Not authenticated' };
    }

    // Step 2: Check System Manager role via user roles API
    const roleRes = await fetch(
      `${FRAPPE_URL}/api/method/frappe.core.doctype.user.user.get_roles?uid=${encodeURIComponent(user)}`,
      {
        headers: {
          'Cookie': `sid=${sid}`,
          'Host': FRAPPE_SITE,
          'Accept': 'application/json',
        },
      }
    );

    if (!roleRes.ok) {
      return { valid: false, error: 'Role check failed' };
    }

    const roleData = await roleRes.json();
    const roles = roleData?.message || [];
    const hasRole = roles.includes('System Manager');

    if (!hasRole) {
      return { valid: false, error: 'Not a System Manager' };
    }

    // Cache the validated session
    sessionCache.set(sid, { user, validatedAt: Date.now() });

    return { valid: true, user };
  } catch (err) {
    console.error('[frappe-auth] Validation error:', err.message);
    return { valid: false, error: 'Frappe unreachable' };
  }
}

/**
 * Extract sid cookie from request
 * @param {import('express').Request|import('http').IncomingMessage} req
 * @returns {string|null}
 */
function extractSid(req) {
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return null;

  const match = cookieHeader.match(/(?:^|;\s*)sid=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Express middleware: validates Frappe session on all protected routes
 */
export async function frappeAuth(req, res, next) {
  const sid = extractSid(req);
  const result = await validateFrappeSession(sid);

  if (!result.valid) {
    return res.status(401).json({
      error: 'Unauthorized',
      detail: result.error,
    });
  }

  // Attach user info to request for downstream use
  req.frappeUser = result.user;
  next();
}

/**
 * WebSocket verifyClient: validates Frappe session for WS connections
 * @param {Object} info - WebSocket upgrade info
 * @param {Function} cb - Callback(result, code, message)
 */
export async function frappeVerifyClient(info, cb) {
  const sid = extractSid(info.req);
  const result = await validateFrappeSession(sid);

  if (!result.valid) {
    cb(false, 401, result.error || 'Unauthorized');
    return;
  }

  // Attach user info for WebSocket handlers
  info.req.user = { username: result.user };
  cb(true);
}

/**
 * Clear the session cache (useful for testing or forced re-auth)
 */
export function clearSessionCache() {
  sessionCache.clear();
}

export default frappeAuth;
