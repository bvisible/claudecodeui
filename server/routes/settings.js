import express from 'express';

const router = express.Router();

// Frappe integration: API keys and credentials managed externally (env vars)
// These endpoints return empty stubs — the API key is provided via ANTHROPIC_API_KEY env var

// ===============================
// API Keys Management (stub)
// ===============================

router.get('/api-keys', async (req, res) => {
  res.json({ apiKeys: [] });
});

router.post('/api-keys', async (req, res) => {
  res.status(501).json({ error: 'API keys are managed via environment variables' });
});

router.delete('/api-keys/:keyId', async (req, res) => {
  res.status(501).json({ error: 'API keys are managed via environment variables' });
});

router.patch('/api-keys/:keyId/toggle', async (req, res) => {
  res.status(501).json({ error: 'API keys are managed via environment variables' });
});

// ===============================
// Generic Credentials Management (stub)
// ===============================

router.get('/credentials', async (req, res) => {
  res.json({ credentials: [] });
});

router.post('/credentials', async (req, res) => {
  res.status(501).json({ error: 'Credentials are managed via environment variables' });
});

router.delete('/credentials/:credentialId', async (req, res) => {
  res.status(501).json({ error: 'Credentials are managed via environment variables' });
});

router.patch('/credentials/:credentialId/toggle', async (req, res) => {
  res.status(501).json({ error: 'Credentials are managed via environment variables' });
});

export default router;
