import { logger } from '../config/logger.js';

export const validateScrapedComments = (comments) => {
    logger.debug(`Validating ${comments.length} scraped comments`);
    
    const validationResults = {
      totalComments: comments.length,
      validComments: 0,
      invalidComments: 0,
      totalReplies: 0,
      issues: []
    };
  
    comments.forEach((comment, index) => {
      const issues = [];
  
      // Only check for essential fields
      if (!comment.comment_text) issues.push('Missing comment text');
      
      // Optional fields warnings
      if (!comment.username) {
        logger.warn(`Comment ${index} has no username, using default`);
        comment.username = 'Anonymous';
      }
      if (!comment.timestamp) {
        logger.warn(`Comment ${index} has no timestamp, using default`);
        comment.timestamp = 'Unknown';
      }
  
      if (comment.replies && Array.isArray(comment.replies)) {
        validationResults.totalReplies += comment.replies.length;
      }
  
      // Consider a comment valid if it has text content
      if (comment.comment_text) {
        validationResults.validComments++;
      } else {
        validationResults.invalidComments++;
        validationResults.issues.push({
          commentIndex: index,
          issues
        });
      }
    });
  
    logger.debug('Comment validation results:', validationResults);
    return validationResults;
  };
  