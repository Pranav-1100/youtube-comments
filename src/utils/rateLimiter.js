class RateLimiter {
    constructor(windowMs = 60000, maxRequests = 30) {
      this.windowMs = windowMs;
      this.maxRequests = maxRequests;
      this.requests = new Map();
    }
  
    isRateLimited(key) {
      const now = Date.now();
      const windowStart = now - this.windowMs;
      
      if (!this.requests.has(key)) {
        this.requests.set(key, [now]);
        return false;
      }
  
      const requests = this.requests.get(key).filter(time => time > windowStart);
      this.requests.set(key, requests);
  
      if (requests.length >= this.maxRequests) {
        return true;
      }
  
      requests.push(now);
      return false;
    }
  }
  
  export const rateLimiter = new RateLimiter();