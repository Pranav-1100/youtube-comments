import puppeteer from 'puppeteer';
import { CustomError } from '../utils/CustomError.js';
import { logger } from '../config/logger.js';
import { validateScrapedComments } from '../utils/commentValidator.js';
import { retryOperation, processComments } from '../utils/scraperUtils.js';
import fs from 'fs/promises';

const SELECTORS = {
  // Thread content selectors
  THREAD_CONTAINER: 'div[role="main"]',
  COMMENTS_SECTION: 'div[data-pressable-container="true"]',
  COMMENT: 'div[data-pressable-container="true"]',
  COMMENT_TEXT: 'div[style*="white-space"] span',
  USERNAME: 'a[role="link"] span',
  TIMESTAMP: 'time',
  LIKES: 'div[role="button"] span',
  
  // Comment components
  COMMENT_USERNAME: 'a[role="link"] span',
  COMMENT_TEXT: 'div[dir="auto"] span',
  TIMESTAMP: 'time',
  LIKES_BUTTON: 'div[role="button"]',
  LIKES_COUNT: 'span[dir="auto"]',
  
  // Replies
  REPLIES_BUTTON: 'button:has-text("replies")',
  REPLIES_CONTAINER: 'div[role="dialog"]',
  REPLY: 'article[role="article"]',
  
  // Load more
  LOAD_MORE_BUTTON: 'button:has-text("Show more replies")',
  
  // Error states
  ERROR_MESSAGE: 'span[data-error="true"]'
};

export class ThreadsScraper {
  constructor() {
    this.debugDir = './debug/threads';
    this.currentRetry = 0;
    this.maxRetries = 3;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.random() * ms + ms/2));
  }

  async scrape(url, limit = 50) {
    logger.scraper('Starting Threads scraping', { url, limit });
    let browser = null;
    let page = null;

    try {
      browser = await puppeteer.launch({
        headless: "new",
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--window-size=1920,1080',
          '--disable-web-security',
        ]
      });

      page = await browser.newPage();
      await this.setupPage(page);
      
      // Log before navigation
      logger.scraper('Browser launched, attempting navigation...');
      
      await this.navigateToThread(page, url);
      
      // Debug: Log the current page content
      const pageContent = await page.content();
      logger.scraper('Initial page content available:', !!pageContent);

      // Skip login check for now as we're accessing public content
      logger.scraper('Proceeding with public access...');

      // Wait for thread content to load
      await this.waitForThreadContent(page);
      
      // Extract comments
      const comments = await this.extractComments(page, limit);
      
      await browser.close();
      return comments;

    } catch (error) {
      await this.handleError(error, page);
      if (browser) await browser.close();
      
      if (this.currentRetry < this.maxRetries) {
        this.currentRetry++;
        logger.scraper(`Retrying scrape attempt ${this.currentRetry}/${this.maxRetries}`);
        await this.delay(5000 * this.currentRetry);
        return this.scrape(url, limit);
      }
      
      throw error;
    }
  }

  async setupPage(page) {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Add error handlers
    page.on('console', msg => logger.debug('Browser console:', msg.text()));
    page.on('pageerror', error => logger.error('Page error:', error.message));

    // Optimize resource loading
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });
  }

  async navigateToThread(page, url) {
    try {
      logger.scraper('Navigating to thread...');
      await page.goto(url, {
        waitUntil: 'domcontentloaded',  // Changed from networkidle0 to faster loading
        timeout: 30000
      });
      
      // Log the current URL to verify redirect behavior
      const currentUrl = page.url();
      logger.scraper(`Current page URL: ${currentUrl}`);

      await this.delay(3000);
      
      // Get page content for debugging
      const content = await page.content();
      logger.scraper(`Page content length: ${content.length}`);
      
      // Disable screenshots for now to avoid "page too large" error
      // await this.saveDebugInfo(page, 'thread-navigation');
    } catch (error) {
      throw new CustomError(`Failed to navigate to thread: ${error.message}`, 404);
    }
  }

  async checkIfLoginRequired(page) {
    const loginForm = await page.$(SELECTORS.LOGIN_FORM);
    return !!loginForm;
  }

  async handleLogin(page) {
    try {
      logger.scraper('Login required, attempting login');
      await this.saveDebugInfo(page, 'pre-login');

      const username = process.env.INSTAGRAM_USERNAME;
      const password = process.env.INSTAGRAM_PASSWORD;

      if (!username || !password) {
        throw new CustomError('Instagram credentials not configured', 500);
      }

      // Fill login form
      await page.type(SELECTORS.USERNAME_FIELD, username, { delay: 50 });
      await page.type(SELECTORS.PASSWORD_FIELD, password, { delay: 50 });
      
      // Click login and wait for navigation
      await Promise.all([
        page.click(SELECTORS.LOGIN_BUTTON),
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 })
      ]);

      await this.delay(5000);
      await this.saveDebugInfo(page, 'post-login');
      logger.scraper('Login successful');

    } catch (error) {
      await this.saveDebugInfo(page, 'login-error');
      throw new CustomError(`Login failed: ${error.message}`, 401);
    }
  }

  async waitForThreadContent(page) {
    try {
      logger.scraper('Waiting for thread content...');
      
      // Debug: Log all available selectors first
      const initialElements = await page.evaluate(() => {
        const all = {
          articles: document.querySelectorAll('article').length,
          divWithRole: document.querySelectorAll('div[role]').length,
          mainContent: document.querySelectorAll('div[role="main"]').length,
          comments: document.querySelectorAll('div[data-pressable-container="true"]').length
        };
        logger.scraper('Initial element counts:', all);
        return all;
      });
      
      logger.scraper('Element counts:', initialElements);
      
      // First wait for any content to load
      await page.waitForSelector('div[role="main"]', { timeout: 15000 });
      logger.scraper('Main content container found');
      
      // Wait a bit for dynamic content
      await this.delay(2000);

      await this.delay(2000);
    } catch (error) {
      logger.error('Error in waitForThreadContent:', error);
      throw new CustomError(`Thread content not found: ${error.message}`, 404);
    }
  }

  async extractComments(page, limit) {
    let comments = [];
    let previousCommentsLength = 0;
    let attempts = 0;
    const maxAttempts = 5;

    try {
      while (comments.length < limit && attempts < maxAttempts) {
        // Extract current visible comments
        const newComments = await page.evaluate((SELECTORS) => {
          const commentElements = document.querySelectorAll(SELECTORS.COMMENT);
          
          return Array.from(commentElements).map(comment => {
            try {
              const usernameElement = comment.querySelector(SELECTORS.COMMENT_USERNAME);
              const textElement = comment.querySelector(SELECTORS.COMMENT_TEXT);
              const timeElement = comment.querySelector(SELECTORS.TIMESTAMP);
              const likesElement = comment.querySelector(SELECTORS.LIKES_COUNT);
              
              // Get replies if any
              const repliesContainer = comment.nextElementSibling;
              let replies = [];
              
              if (repliesContainer && repliesContainer.querySelectorAll(SELECTORS.REPLY)) {
                replies = Array.from(repliesContainer.querySelectorAll(SELECTORS.REPLY))
                  .map(reply => {
                    const replyUsername = reply.querySelector(SELECTORS.COMMENT_USERNAME);
                    const replyText = reply.querySelector(SELECTORS.COMMENT_TEXT);
                    const replyTime = reply.querySelector(SELECTORS.TIMESTAMP);
                    const replyLikes = reply.querySelector(SELECTORS.LIKES_COUNT);

                    return {
                      username: replyUsername ? replyUsername.textContent.trim() : 'Anonymous',
                      comment_text: replyText ? replyText.textContent.trim() : '',
                      timestamp: replyTime ? replyTime.getAttribute('datetime') : 'Unknown',
                      likes: replyLikes ? parseInt(replyLikes.textContent) || 0 : 0
                    };
                  })
                  .filter(reply => reply.comment_text);
              }

              if (!textElement || !usernameElement) return null;

              return {
                username: usernameElement.textContent.trim(),
                comment_text: textElement.textContent.trim(),
                timestamp: timeElement ? timeElement.getAttribute('datetime') : 'Unknown',
                likes: likesElement ? parseInt(likesElement.textContent) || 0 : 0,
                replies: replies
              };
            } catch (err) {
              console.error('Error processing comment:', err);
              return null;
            }
          }).filter(c => c !== null);
        }, SELECTORS);

        comments = [...new Set([...comments, ...newComments])];
        logger.scraper(`Extracted ${comments.length} comments so far`);

        if (comments.length === previousCommentsLength) {
          attempts++;
        } else {
          previousCommentsLength = comments.length;
          attempts = 0;
        }

        // Expand replies if available
        await this.expandReplies(page);

        // Try to load more comments if needed
        if (comments.length < limit) {
          const loadedMore = await this.loadMoreComments(page);
          if (!loadedMore) break;
        }

        await this.delay(2000);
      }

      if (comments.length === 0) {
        throw new CustomError('No comments found on the thread', 404);
      }

      return comments.slice(0, limit);
    } catch (error) {
      await this.saveDebugInfo(page, 'comment-extraction-error');
      throw new CustomError(`Failed to extract comments: ${error.message}`, 500);
    }
  }

  async expandReplies(page) {
    try {
      const repliesButtons = await page.$$(SELECTORS.REPLIES_BUTTON);
      for (const button of repliesButtons) {
        await button.click();
        await this.delay(1000);
      }
    } catch (error) {
      logger.debug('Error expanding replies:', error);
    }
  }

  async loadMoreComments(page) {
    try {
      const loadMoreButton = await page.$(SELECTORS.LOAD_MORE_BUTTON);
      if (loadMoreButton) {
        await loadMoreButton.click();
        await this.delay(2000);
        return true;
      }

      // Try scrolling as fallback
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await this.delay(1000);

      return false;
    } catch (error) {
      return false;
    }
  }

  async saveDebugInfo(page, stage) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const debugPath = `${this.debugDir}/${stage}-${timestamp}`;
      
      await fs.mkdir(this.debugDir, { recursive: true });
      await page.screenshot({ path: `${debugPath}.png`, fullPage: true });
      
      const html = await page.content();
      await fs.writeFile(`${debugPath}.html`, html);
      
      logger.debug(`Saved debug info for stage: ${stage}`);
    } catch (error) {
      logger.error('Error saving debug info:', error);
    }
  }

  async handleError(error, page) {
    if (page) {
      await this.saveDebugInfo(page, 'error-state');
    }
    
    logger.error('Scraping error:', {
      message: error.message,
      stack: error.stack,
      retry: this.currentRetry
    });
  }
}
