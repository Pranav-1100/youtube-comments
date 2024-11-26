import { Router } from 'express';
import { StatisticsService } from '../services/StatisticsService.js';
import { asyncHandler } from '../utils/AsyncHandler.js';
import { validateCommentRequest, validateDateRange } from '../middleware/requestValidator.js';

const router = Router();
const statisticsService = new StatisticsService();

router.get('/', [validateCommentRequest, validateDateRange], asyncHandler(async (req, res) => {
  const { url, platform, startDate, endDate } = req.query;
  const stats = await statisticsService.getStats(url, platform, startDate, endDate);
  res.json(stats);
}));

router.get('/timeseries', [validateCommentRequest, validateDateRange], asyncHandler(async (req, res) => {
  const { url, platform, startDate, endDate } = req.query;
  const timeseriesData = await statisticsService.getTimeseriesStats(url, platform, startDate, endDate);
  res.json(timeseriesData);
}));

router.get('/platform-overview', asyncHandler(async (req, res) => {
  const platformStats = await statisticsService.getPlatformOverview();
  res.json(platformStats);
}));

router.get('/sentiment-trends', [validateDateRange], asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const trends = await statisticsService.getSentimentTrends(startDate, endDate);
  res.json(trends);
}));

router.get('/engagement-metrics', [validateCommentRequest], asyncHandler(async (req, res) => {
  const { url, platform } = req.query;
  const metrics = await statisticsService.getEngagementMetrics(url, platform);
  res.json(metrics);
}));

router.get('/activity-patterns', validateCommentRequest, asyncHandler(async (req, res) => {
    const { url, platform } = req.query;
    const patterns = await statisticsService.getActivityPatterns(url, platform);
    res.json(patterns);
  }));
  
  router.get('/keyword-analysis', validateCommentRequest, asyncHandler(async (req, res) => {
    const { url, platform } = req.query;
    const analysis = await statisticsService.getKeywordAnalysis(url, platform);
    res.json(analysis);
  }));

export default router;
