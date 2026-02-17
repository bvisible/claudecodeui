// Frappe integration: no JWT auth, platform mode always
// Base path from Vite config (e.g., '/ccui/' when behind nginx proxy)
const API_BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

export const authenticatedFetch = (url, options = {}) => {
  const defaultHeaders = {};

  // Only set Content-Type for non-FormData requests
  if (!(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  // Prefix relative API paths with the base path
  const fullUrl = url.startsWith('/') ? `${API_BASE}${url}` : url;

  return fetch(fullUrl, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });
};

// API endpoints
export const api = {
  // Protected endpoints
  projects: () => authenticatedFetch('/api/projects'),
  sessions: (projectName, limit = 5, offset = 0) =>
    authenticatedFetch(`/api/projects/${projectName}/sessions?limit=${limit}&offset=${offset}`),
  sessionMessages: (projectName, sessionId, limit = null, offset = 0) => {
    const params = new URLSearchParams();
    if (limit !== null) {
      params.append('limit', limit);
      params.append('offset', offset);
    }
    const queryString = params.toString();
    const url = `/api/projects/${projectName}/sessions/${sessionId}/messages${queryString ? `?${queryString}` : ''}`;
    return authenticatedFetch(url);
  },
  renameProject: (projectName, displayName) =>
    authenticatedFetch(`/api/projects/${projectName}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ displayName }),
    }),
  renameSession: (projectName, sessionId, name) =>
    authenticatedFetch(`/api/projects/${projectName}/sessions/${sessionId}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    }),
  deleteSession: (projectName, sessionId) =>
    authenticatedFetch(`/api/projects/${projectName}/sessions/${sessionId}`, {
      method: 'DELETE',
    }),
  deleteProject: (projectName, force = false) =>
    authenticatedFetch(`/api/projects/${projectName}${force ? '?force=true' : ''}`, {
      method: 'DELETE',
    }),
  createProject: (path) =>
    authenticatedFetch('/api/projects/create', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  createWorkspace: (workspaceData) =>
    authenticatedFetch('/api/projects/create-workspace', {
      method: 'POST',
      body: JSON.stringify(workspaceData),
    }),
  readFile: (projectName, filePath) =>
    authenticatedFetch(`/api/projects/${projectName}/file?filePath=${encodeURIComponent(filePath)}`),
  saveFile: (projectName, filePath, content) =>
    authenticatedFetch(`/api/projects/${projectName}/file`, {
      method: 'PUT',
      body: JSON.stringify({ filePath, content }),
    }),
  getFiles: (projectName, options = {}) =>
    authenticatedFetch(`/api/projects/${projectName}/files`, options),
  transcribe: (formData) =>
    authenticatedFetch('/api/transcribe', {
      method: 'POST',
      body: formData,
      headers: {},
    }),

  // TaskMaster endpoints
  taskmaster: {
    init: (projectName) =>
      authenticatedFetch(`/api/taskmaster/init/${projectName}`, {
        method: 'POST',
      }),
    addTask: (projectName, { prompt, title, description, priority, dependencies }) =>
      authenticatedFetch(`/api/taskmaster/add-task/${projectName}`, {
        method: 'POST',
        body: JSON.stringify({ prompt, title, description, priority, dependencies }),
      }),
    parsePRD: (projectName, { fileName, numTasks, append }) =>
      authenticatedFetch(`/api/taskmaster/parse-prd/${projectName}`, {
        method: 'POST',
        body: JSON.stringify({ fileName, numTasks, append }),
      }),
    getTemplates: () =>
      authenticatedFetch('/api/taskmaster/prd-templates'),
    applyTemplate: (projectName, { templateId, fileName, customizations }) =>
      authenticatedFetch(`/api/taskmaster/apply-template/${projectName}`, {
        method: 'POST',
        body: JSON.stringify({ templateId, fileName, customizations }),
      }),
    updateTask: (projectName, taskId, updates) =>
      authenticatedFetch(`/api/taskmaster/update-task/${projectName}/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
  },

  browseFilesystem: (dirPath = null) => {
    const params = new URLSearchParams();
    if (dirPath) params.append('path', dirPath);
    return authenticatedFetch(`/api/browse-filesystem?${params}`);
  },

  createFolder: (folderPath) =>
    authenticatedFetch('/api/create-folder', {
      method: 'POST',
      body: JSON.stringify({ path: folderPath }),
    }),

  // User endpoints
  user: {
    gitConfig: () => authenticatedFetch('/api/user/git-config'),
    updateGitConfig: (gitName, gitEmail) =>
      authenticatedFetch('/api/user/git-config', {
        method: 'POST',
        body: JSON.stringify({ gitName, gitEmail }),
      }),
    onboardingStatus: () => authenticatedFetch('/api/user/onboarding-status'),
    completeOnboarding: () =>
      authenticatedFetch('/api/user/complete-onboarding', {
        method: 'POST',
      }),
  },

  // Generic GET method for any endpoint
  get: (endpoint) => authenticatedFetch(`/api${endpoint}`),
};
