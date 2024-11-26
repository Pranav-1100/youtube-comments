class ProxyManager {
    constructor() {
      this.proxies = [];
      this.currentIndex = 0;
    }
  
    addProxy(proxy) {
      this.proxies.push(proxy);
    }
  
    getNextProxy() {
      if (this.proxies.length === 0) return null;
      const proxy = this.proxies[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      return proxy;
    }
  }
  
  export const proxyManager = new ProxyManager();