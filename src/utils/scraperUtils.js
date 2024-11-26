import { logger } from '../config/logger.js';

export const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      logger.warn(`Operation failed, attempt ${i + 1}/${maxRetries}`, { error: error.message });
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError;
};

export const sanitizeComment = (comment) => {
  return {
    ...comment,
    comment_text: comment.comment_text
      ?.replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
      ?.trim() || '',
    username: comment.username
      ?.replace(/[^\w\s-]/g, '') // Remove special characters from username
      ?.trim() || 'Anonymous',
    timestamp: comment.timestamp?.trim() || '',
    likes: typeof comment.likes === 'number' ? comment.likes : 0,
    replies: Array.isArray(comment.replies) 
      ? comment.replies.map(sanitizeComment).filter(reply => reply.comment_text)
      : []
  };
};

export const processComments = (comments) => {
  return comments
    .map(sanitizeComment)
    .filter(comment => comment.comment_text && comment.comment_text.length > 0);
};
