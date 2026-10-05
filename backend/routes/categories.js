import express from 'express';
import { listPublicCategories } from '../services/categories.js';

const router = express.Router();

/**
 * Public category list — drives the storefront's collection tiles, the shop's
 * filter checkboxes and the header navigation. Includes a live count of
 * published products so the UI can label empty collections honestly.
 */
router.get('/', (req, res) => {
  res.json(listPublicCategories());
});

export default router;
