import { YouTubeScraper } from '../scrapers/YouTubeScraper.js';
import { PLATFORMS } from '../config/constants.js';
import { CustomError } from '../utils/CustomError.js';
import { logger } from '../config/logger.js';
import { InstagramScraper } from '../scrapers/InstagramScraper.js';
import { TwitterScraper } from '../scrapers/TwitterScraper.js';
import { ThreadsScraper } from '../scrapers/ThreadsScraper.js';

export class ScraperService {
  constructor() {
    this.scrapers = {
      [PLATFORMS.YOUTUBE]: new YouTubeScraper(),
      [PLATFORMS.INSTAGRAM]: new InstagramScraper(),
      [PLATFORMS.TWITTER]: new TwitterScraper(),
      [PLATFORMS.THREADS]: new ThreadsScraper()
    };
  }

  async scrapeComments(url, platform, limit) {
    const scraper = this.scrapers[platform];
    if (!scraper) {
      throw new CustomError(`Scraper not implemented for platform: ${platform}`, 501);
    }

    return scraper.scrape(url, limit);
  }
}
