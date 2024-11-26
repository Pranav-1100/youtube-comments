const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m'
  };
  
  const getTimestamp = () => new Date().toISOString();
  
  const formatMessage = (level, color, message, meta = {}) => {
    const timestamp = getTimestamp();
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${colors[color]}${timestamp} [${level}]: ${message}${metaStr ? ' ' + metaStr : ''}${colors.reset}`;
  };
  
  export const logger = {
    error: (message, meta = {}) => {
      console.error(formatMessage('ERROR', 'red', message, meta));
    },
    
    warn: (message, meta = {}) => {
      console.warn(formatMessage('WARN', 'yellow', message, meta));
    },
    
    info: (message, meta = {}) => {
      console.info(formatMessage('INFO', 'green', message, meta));
    },
    
    debug: (message, meta = {}) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(formatMessage('DEBUG', 'blue', message, meta));
      }
    },
  
    scraper: (message, meta = {}) => {
      console.log(formatMessage('SCRAPER', 'magenta', message, meta));
    },
  
    database: (message, meta = {}) => {
      console.log(formatMessage('DATABASE', 'blue', message, meta));
    },
  
    api: (message, meta = {}) => {
      console.log(formatMessage('API', 'green', message, meta));
    }
  };