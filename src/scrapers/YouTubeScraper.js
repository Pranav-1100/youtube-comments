import puppeteer from 'puppeteer';
import { CustomError } from '../utils/CustomError.js';
import { logger } from '../config/logger.js';
import { validateScrapedComments } from '../utils/commentValidator.js';
import { retryOperation, processComments } from '../utils/scraperUtils.js';

const SELECTORS = {
  COMMENTS_SECTION: '#comments',
  COMMENT_THREAD: 'ytd-comment-thread-renderer',
  AUTHOR: '#author-text',
  CONTENT: '#content-text',
  TIMESTAMP: 'yt-formatted-string.published-time-text',
  LIKES: '#vote-count-middle',
  REPLIES_CONTAINER: '#replies',
  REPLY: 'ytd-comment-renderer',
  SHOW_MORE_BUTTON: 'ytd-button-renderer.ytd-comment-replies-renderer',
  SHOW_MORE_REPLIES: 'ytd-button-renderer.ytd-comment-replies-renderer > #button > #text',
  AVATAR: '#img',
  PINNED_BADGE: '#pinned-comment-badge',
  HEART_BUTTON: '#creator-heart-button'
};

export class YouTubeScraper {
  constructor() {
    this.currentCommentCount = 0;
    this.hasMoreComments = true;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.random() * ms + ms/2));
  }

  async scrape(url, limit = 300) {
    logger.scraper('Starting YouTube scraping', { url, limit });
    let browser = null;

    try {
      browser = await puppeteer.launch({
        headless: "new",
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
        ]
      });

      const page = await browser.newPage();
      logger.scraper('Browser page created');

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });

      await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
      logger.scraper('Page loaded');

      await this.delay(2000);

      logger.scraper('Scrolling to comments section');
      await this.scrollToComments(page);

      logger.scraper('Starting comment loading process');
      await this.loadComments(page, limit);

      logger.scraper('Extracting comments');
      const comments = await this.extractComments(page, limit);

      logger.scraper(`Successfully scraped ${comments.length} comments`);
      await browser.close();
      return comments;

    } catch (error) {
      logger.error('Error during YouTube scraping:', error);
      if (browser) await browser.close();
      throw new CustomError(`Failed to scrape YouTube comments: ${error.message}`, 500);
    }
  }

  async scrollToComments(page) {
    try {
      await page.waitForSelector(SELECTORS.COMMENTS_SECTION, { timeout: 10000 });
      
      await page.evaluate((selector) => {
        const commentsSection = document.querySelector(selector);
        commentsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, SELECTORS.COMMENTS_SECTION);

      await this.delay(2000);
      logger.scraper('Successfully scrolled to comments section');
    } catch (error) {
      logger.error('Error scrolling to comments:', error);
      throw new CustomError('Could not find comments section', 500);
    }
  }

  async loadComments(page, limit) {
    try {
      let previousHeight = 0;
      let noNewContentCount = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = Math.max(50, Math.ceil(limit / 10)); // Increased scroll attempts

      while (scrollAttempts < maxScrollAttempts) {
        // Get current comment count
        const currentCommentCount = await page.evaluate((selector) => {
          return document.querySelectorAll(selector).length;
        }, SELECTORS.COMMENT_THREAD);

        logger.scraper(`Loading comments: ${currentCommentCount}/${limit}`);

        if (currentCommentCount >= limit) {
          logger.scraper('Reached desired comment limit');
          break;
        }

        // Scroll multiple times in each iteration
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight * 2);
          });
          await this.delay(500);
        }

        const currentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        if (currentHeight === previousHeight) {
          noNewContentCount++;
          if (noNewContentCount >= 5) {
            logger.scraper('No new comments loaded after multiple attempts');
            break;
          }
        } else {
          noNewContentCount = 0;
          previousHeight = currentHeight;
        }

        await this.expandReplies(page);
        scrollAttempts++;

        // Add random longer delay occasionally to avoid detection
        if (Math.random() < 0.1) {
          await this.delay(2000);
        }
      }
    } catch (error) {
      logger.error('Error loading comments:', error);
      throw new CustomError('Failed to load comments: ' + error.message, 500);
    }
  }

  async expandReplies(page) {
    try {
      const expanded = await page.evaluate((SELECTORS) => {
        const buttons = Array.from(document.querySelectorAll(SELECTORS.SHOW_MORE_BUTTON));
        let clickCount = 0;
        buttons.forEach(button => {
          if (button.textContent.includes('Show more replies')) {
            button.click();
            clickCount++;
          }
        });
        return clickCount;
      }, SELECTORS);

      if (expanded > 0) {
        logger.scraper(`Expanded ${expanded} "Show more replies" buttons`);
        await this.delay(500);
      }
    } catch (error) {
      logger.debug('Error expanding replies:', error);
    }
  }

  async extractComments(page, limit) {
    try {
      const rawComments = await page.evaluate((SELECTORS, limit) => {
        const commentElements = Array.from(
          document.querySelectorAll(SELECTORS.COMMENT_THREAD)
        ).slice(0, limit);
        
        return commentElements.map(comment => {
          try {
            const authorElement = comment.querySelector(SELECTORS.AUTHOR);
            const contentElement = comment.querySelector(SELECTORS.CONTENT);
            const timestampElement = comment.querySelector(SELECTORS.TIMESTAMP);
            const likesElement = comment.querySelector(SELECTORS.LIKES);
            const repliesContainer = comment.querySelector(SELECTORS.REPLIES_CONTAINER);
            const avatarElement = comment.querySelector(SELECTORS.AVATAR);
            const isPinned = !!comment.querySelector(SELECTORS.PINNED_BADGE);
            const hasCreatorHeart = !!comment.querySelector(SELECTORS.HEART_BUTTON + '[aria-pressed="true"]');

            const replies = repliesContainer ? Array.from(
              repliesContainer.querySelectorAll(SELECTORS.REPLY)
            ).map(reply => ({
              username: reply.querySelector(SELECTORS.AUTHOR)?.textContent?.trim() || 'Anonymous',
              comment_text: reply.querySelector(SELECTORS.CONTENT)?.textContent?.trim() || '',
              timestamp: reply.querySelector(SELECTORS.TIMESTAMP)?.textContent?.trim() || 'Unknown',
              likes: parseInt(reply.querySelector(SELECTORS.LIKES)?.textContent?.trim() || '0'),
              avatar_url: reply.querySelector(SELECTORS.AVATAR)?.src || null
            })).filter(reply => reply.comment_text) : [];

            return {
              username: authorElement?.textContent?.trim() || 'Anonymous',
              comment_text: contentElement?.textContent?.trim() || '',
              timestamp: timestampElement?.textContent?.trim() || 'Unknown',
              likes: likesElement ? parseInt(likesElement.textContent.trim()) || 0 : 0,
              avatar_url: avatarElement?.src || null,
              is_pinned: isPinned,
              has_creator_heart: hasCreatorHeart,
              replies
            };
          } catch (err) {
            return null;
          }
        }).filter(comment => comment && comment.comment_text);
      }, SELECTORS, limit);

      const processedComments = processComments(rawComments);
      logger.scraper(`Successfully processed ${processedComments.length} comments`);

      return processedComments;
    } catch (error) {
      logger.error('Error extracting comments:', error);
      throw new CustomError(`Failed to extract comments: ${error.message}`, 500);
    }
  }
} 