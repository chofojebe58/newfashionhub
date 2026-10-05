import express from 'express';
import { getSettings } from '../services/settings.js';

const router = express.Router();

/**
 * Public, read-only copy for the storefront.
 *
 * The homepage applies these to any element carrying `data-setting="key"`
 * (see frontend/src/features/content/siteSettings.ts). Writing requires the
 * admin API.
 */
router.get('/', (req, res) => {
  res.json({ settings: getSettings() });
});

export default router;
