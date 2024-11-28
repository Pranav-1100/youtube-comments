import puppeteer from 'puppeteer';
import { CustomError } from '../utils/CustomError.js';
import { logger } from '../config/logger.js';
import { retryOperation, processComments } from '../utils/scraperUtils.js';
import fs from 'fs/promises';

const SELECTORS = {
  // Login related selectors
  LOGIN_BUTTON: '.r-13awgt0 a[href="/login"]',
  USERNAME_FIELD: 'input[autocomplete="username"], input[name="text"], input[data-testid="text-input-username"]',
  PASSWORD_FIELD: 'input[name="password"], input[type="password"]',
  LOGIN_SUBMIT: '[data-testid="LoginForm_Login_Button"]',
  NEXT_BUTTON: '[data-testid="next_button"], [data-testid="NextButton"], button[type="submit"]',
  CONFIRM_BUTTON: '[data-testid="confirmationSheetConfirm"]',
  
  // Tweet and comments selectors
  COMMENTS_SECTION: 'div[data-testid="cellInnerDiv"]',
  COMMENT: 'article[data-testid="tweet"]:not([role="article"])', // Exclude original tweet
  COMMENT_TEXT: 'div[data-testid="tweetText"]',
  USERNAME: 'div[data-testid="User-Name"] div:first-child a',
  METRICS: {
    REPLIES: 'div[data-testid="reply"] span',
    RETWEETS: 'div[data-testid="retweet"] span',
    LIKES: 'div[data-testid="like"] span'
  },
  
  // Load more
  SHOW_MORE: 'div[role="button"]:has-text("Show more replies")'
};

export class TwitterScraper {
  constructor() {
    this.debugDir = './debug';
    this.currentRetry = 0;
    this.maxRetries = 3;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.random() * ms + ms/2));
  }

  async scrape(url, limit = 50) {
    logger.scraper('Starting Twitter scraping', { url, limit });
    let browser = null;
    let page = null;

    try {
      browser = await puppeteer.launch({
        headless: "new",
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--window-size=1920,1080'
        ]
      });

      page = await browser.newPage();
      await this.setupPage(page);
      
      await this.navigateToTweet(page, url);
      await this.handleLogin(page);
      await this.navigateToTweet(page, url);
      
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

    page.on('console', msg => logger.debug('Browser console:', msg.text()));
    page.on('pageerror', error => logger.error('Page error:', error.message));

    await page.setRequestInterception(true);
    page.on('request', request => {
      if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });
  }

  async navigateToTweet(page, url) {
    try {
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });
      await this.delay(3000);
      await this.saveDebugInfo(page, 'tweet-navigation');
    } catch (error) {
      throw new CustomError(`Failed to navigate to tweet: ${error.message}`, 404);
    }
  }

  async handleLogin(page) {
    try {
      logger.scraper('Looking for login button...');
      
      await page.waitForSelector('.r-13awgt0', { timeout: 10000 });
      await this.delay(2000);
      
      const loginButton = await page.$('[href="/login"]');
      if (!loginButton) {
        logger.scraper('Already logged in');
        return;
      }

      logger.scraper('Starting login process');
      await this.saveDebugInfo(page, 'pre-login');

      const username = process.env.TWITTER_USERNAME;
      const password = process.env.TWITTER_PASSWORD;

      if (!username || !password) {
        throw new CustomError('Twitter credentials not configured', 500);
      }

      // Click login and wait for overlay
      logger.scraper('Clicking login button and waiting for overlay...');
      await loginButton.click();
      await this.delay(10000);

      // Wait for any loading spinners to disappear
      try {
        await page.waitForFunction(() => {
          const spinners = document.querySelectorAll('[role="progressbar"]');
          return spinners.length === 0;
        }, { timeout: 5000 });
      } catch (error) {
        logger.debug('Timeout waiting for spinner to disappear');
      }

      // Username step
      logger.scraper('Looking for username field...');
      await page.waitForSelector(SELECTORS.USERNAME_FIELD, { timeout: 15000 });
      await this.delay(2000);
      
      logger.scraper('Entering username...');
      await page.type(SELECTORS.USERNAME_FIELD, username, { delay: 100 });
      await this.delay(2000);

      // Click next
      logger.scraper('Clicking next button...');
      const nextButton = await page.$(SELECTORS.NEXT_BUTTON);
      if (!nextButton) {
        throw new CustomError('Could not find next button', 500);
      }
      await nextButton.click();
      await this.delay(5000);

      // Password step
      logger.scraper('Waiting for password field...');
      await page.waitForSelector(SELECTORS.PASSWORD_FIELD, { timeout: 10000 });
      await this.delay(1000);
      
      logger.scraper('Entering password...');
      await page.type(SELECTORS.PASSWORD_FIELD, password, { delay: 100 });
      await this.delay(2000);

      // Submit login
      logger.scraper('Submitting login...');
      const loginSubmitButton = await page.$(SELECTORS.LOGIN_SUBMIT);
      if (!loginSubmitButton) {
        throw new CustomError('Could not find login submit button', 500);
      }

      await loginSubmitButton.click();
      await this.delay(10000);

      // Wait for navigation to complete
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
      
      logger.scraper('Login sequence completed');
      await this.saveDebugInfo(page, 'post-login');

    } catch (error) {
      await this.saveDebugInfo(page, 'login-error');
      throw new CustomError(`Login failed: ${error.message}`, 401);
    }
  }

  async extractComments(page, limit) {
    let comments = [];
    let previousCommentsLength = 0;
    let attempts = 0;
    const maxAttempts = 5;

    try {
      await page.waitForSelector(SELECTORS.COMMENTS_SECTION, { timeout: 10000 });
      await this.delay(2000);

      while (comments.length < limit && attempts < maxAttempts) {
        const newComments = await page.evaluate((SELECTORS) => {
          const commentElements = document.querySelectorAll(SELECTORS.COMMENT);
          
          return Array.from(commentElements).map(comment => {
            try {
              const textElement = comment.querySelector(SELECTORS.COMMENT_TEXT);
              const likesElement = comment.querySelector(SELECTORS.METRICS.LIKES);
              const retweetsElement = comment.querySelector(SELECTORS.METRICS.RETWEETS);
              const repliesElement = comment.querySelector(SELECTORS.METRICS.REPLIES);

              if (!textElement) return null;

              return {
                comment_text: textElement.textContent.trim(),
                metrics: {
                  likes: likesElement ? parseInt(likesElement.textContent) || 0 : 0,
                  retweets: retweetsElement ? parseInt(retweetsElement.textContent) || 0 : 0,
                  replies: repliesElement ? parseInt(repliesElement.textContent) || 0 : 0
                }
              };
            } catch (err) {
              console.error('Error processing comment:', err);
              return null;
            }
          }).filter(c => c !== null && c.comment_text.length > 0);
        }, SELECTORS);

        const uniqueNewComments = newComments.filter(newComment => 
          !comments.some(existingComment => 
            existingComment.comment_text === newComment.comment_text
          )
        );

        comments = [...comments, ...uniqueNewComments];
        logger.scraper(`Extracted ${comments.length} unique comments so far`);

        if (comments.length === previousCommentsLength) {
          attempts++;
        } else {
          previousCommentsLength = comments.length;
          attempts = 0;
        }

        if (comments.length < limit) {
          const loadedMore = await this.loadMoreComments(page);
          if (!loadedMore) break;
        }

        await this.delay(2000);
      }

      return comments.slice(0, limit);
    } catch (error) {
      await this.saveDebugInfo(page, 'comment-extraction-error');
      throw new CustomError(`Failed to extract comments: ${error.message}`, 500);
    }
  }

  async loadMoreComments(page) {
    try {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await this.delay(1000);

      const showMoreButton = await page.$(SELECTORS.SHOW_MORE);
      if (showMoreButton) {
        await showMoreButton.click();
        await this.delay(2000);
        return true;
      }

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
