import { YouTubeScraper } from '../scrapers/YouTubeScraper.js';
import { PLATFORMS } from '../config/constants.js';
import { CustomError } from '../utils/CustomError.js';
import { logger } from '../config/logger.js';
import { InstagramScraper } from '../scrapers/InstagramScraper.js';

export class ScraperService {
  constructor() {
    this.scrapers = {
      [PLATFORMS.YOUTUBE]: new YouTubeScraper(),
      [PLATFORMS.INSTAGRAM]: new InstagramScraper(),
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
