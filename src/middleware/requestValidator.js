import { validationResult, check } from 'express-validator';
import { PLATFORMS } from '../config/constants.js';
import { CustomError } from '../utils/CustomError.js';
import { validateUrl, validatePlatform } from '../utils/validators.js';
import { logger } from '../config/logger.js';



export const validateCommentRequest = (req, res, next) => {
    try {
      logger.debug('Validating comment request', { 
        method: req.method, 
        query: req.query, 
        body: req.body 
      });
  
      const url = req.method === 'GET' ? req.query.url : req.body.url;
      const platform = req.method === 'GET' ? req.query.platform : req.body.platform;
  
      logger.debug('Request parameters', { url, platform });
      
      validateUrl(url);
      validatePlatform(platform);
      
      logger.debug('Request validation successful');
      next();
    } catch (error) {
      logger.error('Request validation failed:', error);
      next(error);
    }
  };
  

export const validatePaginationParams = [
  check('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  check('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError(
        errors.array().map(err => err.msg).join(', '),
        400
      );
    }
    next();
  }
];

export const validateDateRange = [
  check('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  
  check('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
    .custom((endDate, { req }) => {
      if (req.query.startDate && endDate < req.query.startDate) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError(
        errors.array().map(err => err.msg).join(', '),
        400
      );
    }
    next();
  }
];
