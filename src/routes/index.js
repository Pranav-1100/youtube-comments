import { Router } from 'express';
import commentRoutes from './commentRoutes.js';
import statsRoutes from './statsRoutes.js';

const router = Router();

router.use('/comments', commentRoutes);
router.use('/stats', statsRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
