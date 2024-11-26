import { Comment } from '../models/Comment.js';
import { ScraperService } from './ScraperService.js';
import { SentimentService } from './SentimentService.js';
import { PLATFORMS } from '../config/constants.js';
import { CustomError } from '../utils/CustomError.js';
import { logger } from '../config/logger.js';

export class CommentService {
  constructor() {
    this.scraperService = new ScraperService();
    this.sentimentService = new SentimentService();
  }

  async analyzeComments(url, platform, limit = 300) {
    try {
      logger.info('Starting comment analysis', { url, platform, limit });

      // Scrape comments with limit
      logger.debug('Initiating comment scraping');
      const comments = await this.scraperService.scrapeComments(url, platform, limit);
      logger.info(`Successfully scraped ${comments.length} comments out of ${limit} requested`);

      // Analyze sentiment and prepare for storage
      logger.debug('Processing comments and analyzing sentiment');
      const processedComments = comments.map(comment => ({
        ...comment,
        platform,
        content_url: url,
        ...this.sentimentService.analyzeSentiment(comment.comment_text)
      }));

      // Store in database
      logger.debug('Storing processed comments in database');
      
      // Clear existing comments for this URL if any
      await this.clearExistingComments(url, platform);
      
      // Store new comments
      const results = await Comment.createMany(processedComments);
      logger.info(`Successfully stored ${results.length} comments in database`);

      return processedComments;
    } catch (error) {
      logger.error('Error in analyzeComments:', { error: error.message, stack: error.stack });
      throw new CustomError(`Failed to analyze comments: ${error.message}`, 500);
    }
  }

  async getComments(url, platform) {
    try {
      logger.info('Fetching comments', { url, platform });
      const comments = await Comment.findByUrl(url, platform);
      logger.info(`Retrieved ${comments.length} comments from database`);
      return comments;
    } catch (error) {
      logger.error('Error in getComments:', { error: error.message, stack: error.stack });
      throw new CustomError(`Failed to fetch comments: ${error.message}`, 500);
    }
  }

  async clearExistingComments(url, platform) {
    try {
      await Comment.deleteByUrl(url, platform);
      logger.info(`Cleared existing comments for ${url}`);
    } catch (error) {
      logger.error('Error clearing existing comments:', error);
    }
  }
}