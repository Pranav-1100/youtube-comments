import { Router } from 'express';
import { CommentService } from '../services/CommentService.js';
import { asyncHandler } from '../utils/AsyncHandler.js';
import { validateCommentRequest } from '../middleware/requestValidator.js';
import { logger } from '../config/logger.js';

const router = Router();
const commentService = new CommentService();

router.post('/analyze', validateCommentRequest, asyncHandler(async (req, res) => {
  const { url, platform, limit } = req.body;
  logger.api('Analyzing comments request received', { url, platform, limit });
  const comments = await commentService.analyzeComments(url, platform, parseInt(limit));
  logger.api('Analysis completed successfully');
  res.json({ 
    success: true, 
    count: comments.length,
    comments 
  });
}));

router.get('/', validateCommentRequest, asyncHandler(async (req, res) => {
  const { url, platform, limit } = req.query;
  const commentLimit = parseInt(limit) || 200; // Default to 300 if not specified
  
  logger.api('Fetching comments request received', { url, platform, limit: commentLimit });
  
  let comments = await commentService.getComments(url, platform);
  
  // If no comments found, try to analyze them first
  if (comments.length === 0) {
    logger.info('No comments found in database, starting analysis');
    comments = await commentService.analyzeComments(url, platform, commentLimit);
    logger.info(`Analysis completed, stored ${comments.length} comments`);
  } else if (comments.length < commentLimit) {
    // If we have some comments but less than requested, try to get more
    logger.info(`Found ${comments.length} comments, but ${commentLimit} were requested. Fetching more...`);
    const newComments = await commentService.analyzeComments(url, platform, commentLimit);
    comments = newComments;
  }

  logger.api(`Successfully retrieved ${comments.length} comments out of ${commentLimit} requested`);
  res.json({
    success: true,
    requested_limit: commentLimit,
    count: comments.length,
    comments
  });
}));

export default router;