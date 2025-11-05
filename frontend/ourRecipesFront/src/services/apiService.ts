import { authService } from './authService';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Log API URL on initialization (only in browser, not during SSR)
if (typeof window !== 'undefined') {
  console.log('🔧 API Service initialized with URL:', API_URL || '[NOT SET]');
}

// Custom error class for API errors
export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends ApiError {
  constructor(message: string = 'Network error occurred', data?: any) {
    super(503, message, data);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends ApiError {
  constructor(message: string = 'Request timed out', data?: any) {
    super(408, message, data);
    this.name = 'TimeoutError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string = 'Validation failed', data?: any) {
    super(400, message, data);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication failed', data?: any) {
    super(401, message, data);
    this.name = 'AuthenticationError';
  }
}

// Custom cache strategy type
type CustomCacheStrategy = 'persistent' | 'cache-first' | 'network-first';

// Request/Response interceptor types
type RequestInterceptor = (config: CustomRequestOptions) => CustomRequestOptions | Promise<CustomRequestOptions>;
type ResponseInterceptor = (response: Response) => Response | Promise<Response>;
type ErrorInterceptor = (error: any) => any;

// Extend RequestInit with our custom options
interface CustomRequestOptions {
  method?: string;
  headers?: HeadersInit;
  body?: any;
  timeout?: number;
  cache?: RequestCache | CustomCacheStrategy;
  priority?: 'high' | 'low' | 'auto';
  batch?: boolean;
  retryConfig?: {
    maxRetries?: number;
    retryDelay?: number;
    shouldRetry?: (error: any) => boolean;
  };
  queueKey?: string;
  signal?: AbortSignal;
  cancelToken?: CancelToken;
  credentials?: RequestCredentials;
}

class ApiService {
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly cacheDuration = 5 * 60 * 1000; // 5 minutes
  private offlineQueue: Array<{ endpoint: string; options: CustomRequestOptions }> = [];
  private metrics = {
    requestCount: 0,
    errorCount: 0,
    averageResponseTime: 0,
  };
  private batchQueue = new Map<string, Promise<any>>();
  private readonly BATCH_DELAY = 50;
  private readonly MAX_BATCH_SIZE = 10;
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'apiCache';
  private readonly STORE_NAME = 'responses';

  constructor() {
    // Initialize offline detection
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.processOfflineQueue.bind(this));
      window.addEventListener('offline', () => {
        console.log('Device is offline');
      });
      this.initIndexedDB();
    }
  }

  // IndexedDB initialization
  private async initIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1);

      request.onerror = () => {
        console.error('Failed to open IndexedDB');
        reject();
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'key' });
        }
      };
    });
  }

  // IndexedDB cache operations
  private async getFromIndexedDB(key: string): Promise<any> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }

        if (Date.now() - result.timestamp > this.cacheDuration) {
          this.removeFromIndexedDB(key);
          resolve(null);
          return;
        }

        resolve(result.data);
      };

      request.onerror = () => {
        console.error('Error reading from IndexedDB');
        reject();
      };
    });
  }

  private async setInIndexedDB(key: string, data: any): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.put({
        key,
        data,
        timestamp: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('Error writing to IndexedDB');
        reject();
      };
    });
  }

  private async removeFromIndexedDB(key: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('Error deleting from IndexedDB');
        reject();
      };
    });
  }

  // Enhanced cache management
  private async getCachedData<T>(key: string, cacheStrategy: RequestCache | CustomCacheStrategy = 'no-store'): Promise<T | null> {
    if (cacheStrategy === 'no-store') return null;

    // Try memory cache first
    const memoryCache = this.cache.get(key);
    if (memoryCache) {
      if (Date.now() - memoryCache.timestamp > this.cacheDuration) {
        this.cache.delete(key);
        return null;
      }
      return memoryCache.data as T;
    }

    // Try IndexedDB if memory cache miss
    if (cacheStrategy === 'persistent' || cacheStrategy === 'cache-first') {
      const persistentCache = await this.getFromIndexedDB(key);
      if (persistentCache) {
        // Update memory cache
        this.cache.set(key, {
          data: persistentCache,
          timestamp: Date.now(),
        });
        return persistentCache as T;
      }
    }

    return null;
  }

  private async setCachedData<T>(key: string, data: T, cacheStrategy: RequestCache | CustomCacheStrategy = 'no-store'): Promise<void> {
    if (cacheStrategy === 'no-store') return;

    // Update memory cache
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });

    // Update IndexedDB if using persistent cache
    if (cacheStrategy === 'persistent' || cacheStrategy === 'cache-first') {
      await this.setInIndexedDB(key, data);
    }
  }

  // Offline support
  private isDeviceOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  private async processOfflineQueue(): Promise<void> {
    if (!this.isDeviceOnline() || this.offlineQueue.length === 0) return;

    console.log(`Processing ${this.offlineQueue.length} queued requests`);
    
    const queue = [...this.offlineQueue];
    this.offlineQueue = [];

    for (const request of queue) {
      try {
        await this.fetch(request.endpoint, request.options);
      } catch (error) {
        console.error('Failed to process queued request:', error);
        this.offlineQueue.push(request);
      }
    }
  }

  // Request batching
  private async batchRequests<T>(endpoint: string, options: CustomRequestOptions): Promise<T> {
    const batchKey = this.getCacheKey(endpoint, options);
    
    if (!this.batchQueue.has(batchKey)) {
      const batchPromise = new Promise((resolve) => {
        setTimeout(async () => {
          const batch = Array.from(this.batchQueue.entries())
            .filter(([key]) => key.startsWith(endpoint))
            .slice(0, this.MAX_BATCH_SIZE);
          
          try {
            const response = await this.fetch<T[]>(endpoint, {
              ...options,
              method: 'POST',
              body: JSON.stringify(batch.map(([key]) => key)),
            });
            
            batch.forEach(([key, promise]: [string, any]) => {
              promise.resolve(response);
              this.batchQueue.delete(key);
            });
          } catch (error) {
            batch.forEach(([key, promise]: [string, any]) => {
              promise.reject(error);
              this.batchQueue.delete(key);
            });
          }
        }, this.BATCH_DELAY);
      });
      
      this.batchQueue.set(batchKey, batchPromise);
    }
    
    return this.batchQueue.get(batchKey);
  }

  // Performance metrics
  private updateMetrics(startTime: number, success: boolean): void {
    const duration = Date.now() - startTime;
    this.metrics.requestCount++;
    if (!success) this.metrics.errorCount++;
    
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (this.metrics.requestCount - 1) + duration) / 
      this.metrics.requestCount;
  }

  getRequestMetrics() {
    return {
      ...this.metrics,
      successRate: (this.metrics.requestCount - this.metrics.errorCount) / this.metrics.requestCount,
    };
  }

  // Add request interceptor
  addRequestInterceptor(interceptor: RequestInterceptor) {
    this.requestInterceptors.push(interceptor);
  }

  // Add response interceptor
  addResponseInterceptor(interceptor: ResponseInterceptor) {
    this.responseInterceptors.push(interceptor);
  }

  // Add error interceptor
  addErrorInterceptor(interceptor: ErrorInterceptor) {
    this.errorInterceptors.push(interceptor);
  }

  // Apply request interceptors
  private async applyRequestInterceptors(options: CustomRequestOptions): Promise<CustomRequestOptions> {
    let config = { ...options };
    for (const interceptor of this.requestInterceptors) {
      config = await interceptor(config);
    }
    return config;
  }

  // Apply response interceptors
  private async applyResponseInterceptors(response: Response): Promise<Response> {
    let result = response;
    for (const interceptor of this.responseInterceptors) {
      result = await interceptor(result);
    }
    return result;
  }

  // Apply error interceptors
  private async applyErrorInterceptors(error: any): Promise<any> {
    let result = error;
    for (const interceptor of this.errorInterceptors) {
      result = await interceptor(result);
    }
    return result;
  }

  // Cache management
  private getCacheKey(endpoint: string, options: CustomRequestOptions): string {
    return `${options.method || 'GET'}-${endpoint}-${JSON.stringify(options.body || '')}`;
  }

  // Enhanced fetch with advanced caching
  private async fetch<T>(endpoint: string, options: CustomRequestOptions = {}): Promise<T> {
    const startTime = Date.now();
    const { timeout = 5000, cache = 'no-store', priority = 'auto', ...fetchOptions } = options;

    // Handle offline state
    if (!this.isDeviceOnline() && options.method !== 'GET') {
      this.offlineQueue.push({ endpoint, options });
      throw new NetworkError('Device is offline. Request queued for later.');
    }

    // Handle request batching for GET requests
    if (options.method === 'GET' && options.batch) {
      return this.batchRequests<T>(endpoint, options);
    }

    const cacheKey = this.getCacheKey(endpoint, options);

    // Try cache first if strategy is cache-first
    if (cache === 'cache-first') {
      const cachedData = await this.getCachedData<T>(cacheKey, cache);
      if (cachedData) return cachedData;
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const fullUrl = `${API_URL}${endpoint}`;
      const requestHeaders = {
        ...authService.getHeaders(),
        ...fetchOptions.headers,
      };

      console.log('🌐 API Request:', {
        url: fullUrl,
        method: fetchOptions.method || 'GET',
        headers: requestHeaders,
        hasBody: !!fetchOptions.body
      });

      const response = await fetch(fullUrl, {
        ...fetchOptions,
        credentials: 'include',
        headers: requestHeaders,
        signal: controller.signal,
      });

      console.log('📥 API Response:', {
        url: fullUrl,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      const success = response.ok;
      this.updateMetrics(startTime, success);

      // Apply response interceptors
      const interceptedResponse = await this.applyResponseInterceptors(response);

      if (!interceptedResponse.ok) {
        const errorData = await interceptedResponse.json().catch(() => ({}));
        console.error('❌ API Error Response:', {
          url: fullUrl,
          status: interceptedResponse.status,
          statusText: interceptedResponse.statusText,
          errorData
        });
        throw new ApiError(
          interceptedResponse.status,
          errorData.message || 'Network response was not ok',
          errorData
        );
      }

      const data = await interceptedResponse.json();

      // Cache successful GET requests
      if (options.method === 'GET' && cache !== 'no-store') {
        await this.setCachedData(cacheKey, data, cache);
      }

      return data;
    } catch (error) {
      console.error('❌ API Request Failed:', {
        url: `${API_URL}${endpoint}`,
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        isApiError: error instanceof ApiError,
        isAbortError: error instanceof Error && error.name === 'AbortError',
        isNetworkError: error instanceof TypeError
      });

      this.updateMetrics(startTime, false);

      // Try cache if network request fails and strategy is network-first
      if (cache === 'network-first') {
        const cachedData = await this.getCachedData<T>(cacheKey, cache);
        if (cachedData) return cachedData;
      }

      const processedError = await this.applyErrorInterceptors(error);
      throw processedError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // GET request
  async get<T>(endpoint: string, options: CustomRequestOptions = {}): Promise<T> {
    return this.fetch<T>(endpoint, {
      ...options,
      method: 'GET',
    });
  }

  // POST request
  async post<T>(endpoint: string, data?: any, options: CustomRequestOptions = {}): Promise<T> {
    return this.fetch<T>(endpoint, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
  }

  // PUT request
  async put<T>(endpoint: string, data?: any, options: CustomRequestOptions = {}): Promise<T> {
    return this.fetch<T>(endpoint, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
  }

  // DELETE request
  async delete<T>(endpoint: string, options: CustomRequestOptions = {}): Promise<T> {
    return this.fetch<T>(endpoint, {
      ...options,
      method: 'DELETE',
    });
  }

  // PATCH request
  async patch<T>(endpoint: string, data?: any, options: CustomRequestOptions = {}): Promise<T> {
    return this.fetch<T>(endpoint, {
      ...options,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
  }

  // Clear all caches
  async clearCache(): Promise<void> {
    this.cache.clear();
    
    if (this.db) {
      const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      await store.clear();
    }
  }

  // Clear specific cache entry
  async clearCacheEntry(endpoint: string, options: CustomRequestOptions = {}): Promise<void> {
    const key = this.getCacheKey(endpoint, options);
    this.cache.delete(key);
    await this.removeFromIndexedDB(key);
  }
}

export const apiService = new ApiService();

// Add default interceptors
apiService.addRequestInterceptor(async (config) => {
  // Add timestamp to prevent caching
  if (config.cache === 'no-store') {
    const headers = new Headers(config.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('Pragma', 'no-cache');
    return { ...config, headers };
  }
  return config;
});

apiService.addErrorInterceptor(async (error) => {
  if (error.name === 'AbortError') {
    throw new ApiError(408, 'Request timeout');
  }
  throw error;
});

// CancelToken implementation
export class CancelToken {
  private _cancelled = false;
  private _reason?: string;

  get isCancelled(): boolean {
    return this._cancelled;
  }

  get reason(): string | undefined {
    return this._reason;
  }

  cancel(reason?: string): void {
    this._cancelled = true;
    this._reason = reason;
  }
} 