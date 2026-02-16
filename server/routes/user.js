import express from 'express';
import { getSystemGitConfig } from '../utils/gitConfig.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = express.Router();

// Frappe integration: git config from system only (no database)
router.get('/git-config', async (req, res) => {
  try {
    const gitConfig = await getSystemGitConfig();

    res.json({
      success: true,
      gitName: gitConfig?.git_name || null,
      gitEmail: gitConfig?.git_email || null
    });
  } catch (error) {
    console.error('Error getting git config:', error);
    res.status(500).json({ error: 'Failed to get git configuration' });
  }
});

// Apply git config globally via git config --global
router.post('/git-config', async (req, res) => {
  try {
    const { gitName, gitEmail } = req.body;

    if (!gitName || !gitEmail) {
      return res.status(400).json({ error: 'Git name and email are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(gitEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    try {
      await execAsync(`git config --global user.name "${gitName.replace(/"/g, '\\"')}"`);
      await execAsync(`git config --global user.email "${gitEmail.replace(/"/g, '\\"')}"`);
      console.log(`Applied git config globally: ${gitName} <${gitEmail}>`);
    } catch (gitError) {
      console.error('Error applying git config:', gitError);
    }

    res.json({
      success: true,
      gitName,
      gitEmail
    });
  } catch (error) {
    console.error('Error updating git config:', error);
    res.status(500).json({ error: 'Failed to update git configuration' });
  }
});

// Frappe integration: onboarding always considered complete
router.post('/complete-onboarding', async (req, res) => {
  res.json({
    success: true,
    message: 'Onboarding completed successfully'
  });
});

router.get('/onboarding-status', async (req, res) => {
  res.json({
    success: true,
    hasCompletedOnboarding: true
  });
});

export default router;
