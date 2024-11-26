import { YouTubeScraper } from './YouTubeScraper.js';
import { InstagramScraper } from './InstagramScraper.js';
import { FacebookScraper } from './FacebookScraper.js';
import { TwitterScraper } from './TwitterScraper.js';
import { RedditScraper } from './RedditScraper.js';
import { LinkedInScraper } from './LinkedInScraper.js';
import { ThreadsScraper } from './ThreadsScraper.js';
import { SnapchatScraper } from './SnapchatScraper.js';
import { PLATFORMS } from '../config/constants.js';

export const scrapers = {
  [PLATFORMS.YOUTUBE]: new YouTubeScraper(),
  [PLATFORMS.INSTAGRAM]: new InstagramScraper(),
  [PLATFORMS.FACEBOOK]: new FacebookScraper(),
  [PLATFORMS.TWITTER]: new TwitterScraper(),
  [PLATFORMS.REDDIT]: new RedditScraper(),
  [PLATFORMS.LINKEDIN]: new LinkedInScraper(),
  [PLATFORMS.THREADS]: new ThreadsScraper(),
  [PLATFORMS.SNAPCHAT]: new SnapchatScraper()
};