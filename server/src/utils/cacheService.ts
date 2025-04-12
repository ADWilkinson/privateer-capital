import { logger } from './logger';

interface CacheItem<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

export class CacheService {
  private static instance: CacheService;
  private cache: Map<string, CacheItem<any>> = new Map();
  private defaultTTL: number = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  private isExpired(item: CacheItem<any>): boolean {
    return Date.now() > item.timestamp + item.ttl;
  }

  public get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (this.isExpired(item)) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  public set<T>(key: string, value: T, ttl: number = this.defaultTTL): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl
    });
  }

  public delete(key: string): void {
    this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }

  public keys(): string[] {
    return Array.from(this.cache.keys());
  }

  public values<T>(): T[] {
    return Array.from(this.cache.values()).map(item => item.value) as T[];
  }

  public entries<T>(): [string, T][] {
    return Array.from(this.cache.entries()).map(([key, item]) => [key, item.value]) as [string, T][];
  }

  public async withCache<T>(
    key: string,
    ttl: number,
    fetchFn: () => Promise<T>,
    options: {
      forceRefresh?: boolean;
      staleWhileRevalidate?: number;
    } = {}
  ): Promise<T> {
    const { forceRefresh = false, staleWhileRevalidate = 0 } = options;

    // Check cache first
    const cachedValue = this.get<T>(key);
    if (!forceRefresh && cachedValue !== null) {
      // If staleWhileRevalidate is set, return stale data while fetching fresh data
      if (staleWhileRevalidate > 0) {
        const item = this.cache.get(key);
        if (item && Date.now() - item.timestamp < staleWhileRevalidate) {
          // Return stale data immediately while fetching fresh data
          const freshData = fetchFn();
          freshData.then(data => {
            this.set(key, data, ttl);
          }).catch(error => {
            logger.error(`Error refreshing cached data for ${key}:`, error);
          });
          return cachedValue;
        }
      }
      return cachedValue;
    }

    // Fetch fresh data
    const data = await fetchFn();
    this.set(key, data, ttl);
    return data;
  }
}
