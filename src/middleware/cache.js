class Cache {
    constructor() {
      this.cache = new Map();
      this.ttl = 1000 * 60 * 5; // 5 minutes
    }
  
    set(key, value) {
      this.cache.set(key, {
        value,
        timestamp: Date.now()
      });
    }
  
    get(key) {
      const data = this.cache.get(key);
      if (!data) return null;
      
      if (Date.now() - data.timestamp > this.ttl) {
        this.cache.delete(key);
        return null;
      }
      
      return data.value;
    }
  }
  
  const cache = new Cache();
  
  export const cacheMiddleware = (req, res, next) => {
    const key = `${req.method}-${req.originalUrl}`;
    const cachedResponse = cache.get(key);
    
    if (cachedResponse) {
      return res.json(cachedResponse);
    }
    
    const originalJson = res.json;
    res.json = function(data) {
      cache.set(key, data);
      originalJson.call(this, data);
    };
    
    next();
  };