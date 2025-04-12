import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { logger } from './logger';

class ApiClient {
  private axiosInstances: Record<string, AxiosInstance> = {};
  private rateLimiters: Record<string, {
    lastRequest: number;
    requestsPerMinute: number;
  }> = {};

  constructor() {
    // Pre-configure common APIs
    this.configure('hyperliquid', 'https://api.hyperliquid.xyz', 150); // 150 requests per minute
    this.configure('coingecko', 'https://api.coingecko.com/api/v3', 20); // 20 requests per minute for free tier
  }

  public configure(
    name: string, 
    baseURL: string, 
    requestsPerMinute: number = 60, 
    config: AxiosRequestConfig = {}
  ): void {
    this.axiosInstances[name] = axios.create({
      baseURL,
      timeout: 15000, // 15 seconds
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      ...config
    });

    this.rateLimiters[name] = {
      lastRequest: 0,
      requestsPerMinute
    };

    // Add response interceptor for logging
    this.axiosInstances[name].interceptors.response.use(
      (response) => response,
      (error) => {
        const { config, status, data } = error.response || {};
        logger.error(`API Error [${name}]: ${status} - ${error.message}`, {
          url: config?.url,
          method: config?.method,
          data: data
        });
        return Promise.reject(error);
      }
    );
  }

  private async applyRateLimit(name: string): Promise<void> {
    const limiter = this.rateLimiters[name];
    if (!limiter) return;

    const now = Date.now();
    const minInterval = 60000 / limiter.requestsPerMinute;
    const elapsed = now - limiter.lastRequest;

    if (elapsed < minInterval) {
      const delay = minInterval - elapsed;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.rateLimiters[name].lastRequest = Date.now();
  }

  public async request<T>(
    apiName: string,
    config: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    if (!this.axiosInstances[apiName]) {
      throw new Error(`API client not configured for: ${apiName}`);
    }
    
    await this.applyRateLimit(apiName);
    return this.axiosInstances[apiName].request<T>(config);
  }

  public async get<T>(
    apiName: string,
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>(apiName, { ...config, method: 'get', url });
  }

  public async post<T>(
    apiName: string,
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>(apiName, { ...config, method: 'post', url, data });
  }
}

// Singleton instance
export const apiClient = new ApiClient();
