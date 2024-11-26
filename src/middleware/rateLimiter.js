import { rateLimiter } from '../utils/rateLimiter.js';
import { CustomError } from '../utils/CustomError.js';

export const rateLimiterMiddleware = (req, res, next) => {
  const key = req.ip;
  
  if (rateLimiter.isRateLimited(key)) {
    throw new CustomError('Too many requests. Please try again later.', 429);
  }
  
  next();
};