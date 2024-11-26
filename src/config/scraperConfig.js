export const scraperConfig = {
    puppeteer: {
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
      defaultViewport: {
        width: 1920,
        height: 1080
      }
    },
    youtube: {
      scrollDelay: 2000,
      maxScrolls: 5,
      retryAttempts: 3,
      loadTimeout: 10000,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    },
    instagram: {
      requestDelay: 2000,
      maxAttempts: 30,
      commentsPerLoad: 12,
      loginTimeout: 10000
    },  
  };



  
  export const SCRAPER_CONFIG = {
    DEFAULT_LIMIT: 200,
    MAX_LIMIT: 1000,
    SCROLL_DELAY: 2000,
    LOAD_TIMEOUT: 60000,
    SCROLL_AMOUNT: 2000,
    MAX_RETRIES: 3,
    DEFAULT_SCROLLS: 20
  };
  
