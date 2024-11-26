import puppeteer from 'puppeteer';
import { CustomError } from '../utils/CustomError.js';
import { logger } from '../config/logger.js';
import { validateScrapedComments } from '../utils/commentValidator.js';
import { retryOperation, processComments } from '../utils/scraperUtils.js';
import fs from 'fs/promises';

const SELECTORS = {
  // Login related selectors
  LOGIN_FORM: 'form[id="loginForm"]',
  USERNAME_FIELD: 'input[name="username"]',
  PASSWORD_FIELD: 'input[name="password"]',
  LOGIN_BUTTON: 'button[type="submit"]',
  
  // New Instagram UI selectors
  COMMENTS_CONTAINER: 'div[style*="height"]  div > ul',
  COMMENT: 'ul > div > li',
  COMMENT_USERNAME: 'span a.x1i10hfl',
  COMMENT_TEXT: 'span[dir="auto"]',
  TIMESTAMP: 'time._aaqe',
  LIKES_COUNT: 'button span[dir="auto"]',

  // Comment load more button
  LOAD_MORE_BUTTON: 'svg[aria-label="Load more comments"]',

  // Post verification
  POST_IMAGE: 'img[style*="object-fit"]',
  POST_CONTAINER: 'article[role="presentation"]',

  REEL: {
    CONTAINER: 'div[role="dialog"]',
    COMMENT_ICON: 'button[data-visualcompletion="loading-state"]',
    COMMENTS_SECTION: 'div._a9-z',
    COMMENTS_LIST: 'ul._a9ym',
    COMMENT_ITEM: 'ul._a9ym > li',
    USERNAME: 'a._a9zc',
    TEXT: 'div._a9zs',
    TIMESTAMP: 'time._aaqe',
    LOAD_MORE: 'button._abl-',
    // Alternative selectors if needed
    ALT_COMMENTS_SECTION: 'section._ae65',
    ALT_COMMENT_ICON: 'span.x78zum5 button'
  }
};

export class InstagramScraper {
    constructor() {
      this.debugDir = './debug';
      this.currentRetry = 0;
      this.maxRetries = 3;
    }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.random() * ms + ms/2));
  }


  async scrape(url, limit = 50) {
    logger.scraper('Starting Instagram scraping', { url, limit });
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
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });

      page = await browser.newPage();
      await this.setupPage(page);
      
      // Check if it's a reel
      const isReel = url.includes('/reel/') || url.includes('/reels/');
      
      // Navigate to the content
      await this.navigateToPost(page, url);
      
      // Check if login is required
      const needsLogin = await this.checkIfLoginRequired(page);
      if (needsLogin) {
        await this.handleLogin(page);
        await this.navigateToPost(page, url);
      }

      // Extract comments based on content type
      let comments;
      if (isReel) {
        comments = await this.extractReelComments(page, limit);
      } else {
        await this.waitForPostContent(page);
        comments = await this.extractComments(page, limit);
      }
      
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
    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Add error handlers
    page.on('console', msg => logger.debug('Browser console:', msg.text()));
    page.on('pageerror', error => logger.error('Page error:', error.message));

    // Set request interception
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });
  }

  async navigateToPost(page, url) {
    try {
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });
      await this.delay(3000);
      await this.saveDebugInfo(page, 'post-navigation');
    } catch (error) {
      throw new CustomError(`Failed to navigate to post: ${error.message}`, 404);
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

  async waitForPostContent(page) {
    try {
      await page.waitForSelector(SELECTORS.POST_CONTAINER, { timeout: 10000 });
      await this.delay(2000);
    } catch (error) {
      throw new CustomError('Post content not found', 404);
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

              if (!textElement || !usernameElement) return null;

              return {
                username: usernameElement.textContent.trim(),
                comment_text: textElement.textContent.trim(),
                timestamp: timeElement ? timeElement.getAttribute('datetime') : 'Unknown',
                likes: likesElement ? parseInt(likesElement.textContent) || 0 : 0
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

        // Try to load more comments if needed
        if (comments.length < limit) {
          const loadedMore = await this.loadMoreComments(page);
          if (!loadedMore) break;
        }

        await this.delay(2000);
      }

      if (comments.length === 0) {
        throw new CustomError('No comments found on the post', 404);
      }

      return comments.slice(0, limit);
    } catch (error) {
      await this.saveDebugInfo(page, 'comment-extraction-error');
      throw new CustomError(`Failed to extract comments: ${error.message}`, 500);
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

  async extractReelComments(page, limit) {
    let comments = [];
    let previousLength = 0;
    let attempts = 0;
    const maxAttempts = 5;

    try {
      // Try to find and click the comments icon
      await this.openReelComments(page);
      
      // Wait for comments section
      await this.waitForReelComments(page);

      while (comments.length < limit && attempts < maxAttempts) {
        // Extract current visible comments
        const newComments = await this.getVisibleReelComments(page);
        
        comments = [...new Set([...comments, ...newComments])];
        logger.scraper(`Extracted ${comments.length} reel comments`);

        if (comments.length === previousLength) {
          attempts++;
        } else {
          previousLength = comments.length;
          attempts = 0;
        }

        if (comments.length < limit) {
          const loadedMore = await this.loadMoreReelComments(page);
          if (!loadedMore) break;
        }

        await this.delay(2000);
      }

      if (comments.length === 0) {
        throw new CustomError('No comments found on reel', 404);
      }

      return comments.slice(0, limit);
    } catch (error) {
      throw new CustomError(`Failed to extract reel comments: ${error.message}`, 500);
    }
  }

  async openReelComments(page) {
    try {
      logger.scraper('Looking for comment icon...');
      
      // Try multiple possible comment icon selectors
      const commentIconSelectors = [
        SELECTORS.REEL.COMMENT_ICON,
        SELECTORS.REEL.ALT_COMMENT_ICON,
        'button[aria-label*="comment"]',  // Generic fallback
        'span[class*="x78zum5"] button'   // Another fallback
      ];

      for (const selector of commentIconSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          const commentIcon = await page.$(selector);
          if (commentIcon) {
            await commentIcon.click();
            logger.scraper('Clicked comment icon');
            await this.delay(2000);
            return true;
          }
        } catch (err) {
          continue;
        }
      }

      // If we get here, try finding by XPath as last resort
      const commentButton = await page.$x("//button[contains(@aria-label, 'comment')]");
      if (commentButton.length > 0) {
        await commentButton[0].click();
        logger.scraper('Clicked comment icon (XPath)');
        await this.delay(2000);
        return true;
      }

      throw new CustomError('Could not find comment icon', 404);
    } catch (error) {
      throw new CustomError(`Failed to open comments: ${error.message}`, 500);
    }
  }

  async waitForReelComments(page) {
    try {
      // Try multiple possible comment section selectors
      const selectors = [
        SELECTORS.REEL.COMMENTS_SECTION,
        SELECTORS.REEL.ALT_COMMENTS_SECTION,
        SELECTORS.REEL.COMMENTS_LIST
      ];

      for (const selector of selectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          logger.scraper(`Found comments section: ${selector}`);
          await this.delay(1000);
          return true;
        } catch (err) {
          continue;
        }
      }

      throw new CustomError('Comments section not found', 404);
    } catch (error) {
      throw error;
    }
  }

  async getVisibleReelComments(page) {
    try {
      return await page.evaluate((SELECTORS) => {
        const commentElements = document.querySelectorAll(SELECTORS.REEL.COMMENT_ITEM);
        
        return Array.from(commentElements).map(comment => {
          try {
            const usernameElement = comment.querySelector(SELECTORS.REEL.USERNAME);
            const textElement = comment.querySelector(SELECTORS.REEL.TEXT);
            const timeElement = comment.querySelector(SELECTORS.REEL.TIMESTAMP);

            if (!textElement || !usernameElement) return null;

            return {
              username: usernameElement.textContent.trim(),
              comment_text: textElement.textContent.trim(),
              timestamp: timeElement ? timeElement.getAttribute('datetime') : 'Unknown',
              likes: 0
            };
          } catch (err) {
            console.error('Error processing reel comment:', err);
            return null;
          }
        }).filter(c => c !== null);
      }, SELECTORS);
    } catch (error) {
      throw new CustomError(`Failed to extract visible comments: ${error.message}`, 500);
    }
  }

  async loadMoreReelComments(page) {
    try {
      const loadMoreButton = await page.$(SELECTORS.REEL.LOAD_MORE);
      if (loadMoreButton) {
        await loadMoreButton.click();
        await this.delay(2000);
        return true;
      }

      // Try scrolling
      await page.evaluate((selector) => {
        const container = document.querySelector(selector);
        if (container) {
          container.scrollTo(0, container.scrollHeight);
        }
      }, SELECTORS.REEL.COMMENTS_LIST);
      await this.delay(1000);

      return false;
    } catch (error) {
      return false;
    }
  }

}