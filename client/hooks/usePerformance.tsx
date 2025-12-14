import { useEffect, useRef, useCallback } from 'react';

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  type: 'navigation' | 'resource' | 'paint' | 'custom' | 'api';
  metadata?: Record<string, any>;
}

interface WebVitals {
  LCP: number | null;  // Largest Contentful Paint
  FID: number | null;  // First Input Delay
  CLS: number | null;  // Cumulative Layout Shift
  FCP: number | null;  // First Contentful Paint
  TTFB: number | null; // Time to First Byte
  INP: number | null;  // Interaction to Next Paint
}

// Thresholds based on Google's Core Web Vitals
const WEB_VITALS_THRESHOLDS = {
  LCP: { good: 2500, needsImprovement: 4000 },
  FID: { good: 100, needsImprovement: 300 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  FCP: { good: 1800, needsImprovement: 3000 },
  TTFB: { good: 800, needsImprovement: 1800 },
  INP: { good: 200, needsImprovement: 500 },
};

class ClientPerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private webVitals: WebVitals = {
    LCP: null,
    FID: null,
    CLS: null,
    FCP: null,
    TTFB: null,
    INP: null,
  };
  private apiCallTimes: Map<string, number[]> = new Map();
  private observers: PerformanceObserver[] = [];
  private initialized = false;

  initialize() {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    this.observePaintTiming();
    this.observeLCP();
    this.observeFID();
    this.observeCLS();
    this.observeINP();
    this.measureTTFB();
  }

  private observePaintTiming() {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.webVitals.FCP = entry.startTime;
            this.recordMetric({
              name: 'FCP',
              value: entry.startTime,
              timestamp: Date.now(),
              type: 'paint',
            });
          }
        }
      });
      observer.observe({ type: 'paint', buffered: true });
      this.observers.push(observer);
    } catch (e) {
      console.warn('Paint timing not supported');
    }
  }

  private observeLCP() {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          this.webVitals.LCP = lastEntry.startTime;
          this.recordMetric({
            name: 'LCP',
            value: lastEntry.startTime,
            timestamp: Date.now(),
            type: 'paint',
          });
        }
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      this.observers.push(observer);
    } catch (e) {
      console.warn('LCP not supported');
    }
  }

  private observeFID() {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const fidEntry = entry as PerformanceEventTiming;
          if (fidEntry.processingStart) {
            const fid = fidEntry.processingStart - fidEntry.startTime;
            this.webVitals.FID = fid;
            this.recordMetric({
              name: 'FID',
              value: fid,
              timestamp: Date.now(),
              type: 'paint',
            });
          }
        }
      });
      observer.observe({ type: 'first-input', buffered: true });
      this.observers.push(observer);
    } catch (e) {
      console.warn('FID not supported');
    }
  }

  private observeCLS() {
    try {
      let clsValue = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShiftEntry = entry as any;
          if (!layoutShiftEntry.hadRecentInput) {
            clsValue += layoutShiftEntry.value;
            this.webVitals.CLS = clsValue;
          }
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
      this.observers.push(observer);
    } catch (e) {
      console.warn('CLS not supported');
    }
  }

  private observeINP() {
    try {
      let maxINP = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const eventEntry = entry as PerformanceEventTiming;
          if (eventEntry.duration > maxINP) {
            maxINP = eventEntry.duration;
            this.webVitals.INP = maxINP;
          }
        }
      });
      observer.observe({ type: 'event', buffered: true });
      this.observers.push(observer);
    } catch (e) {
      console.warn('INP not supported');
    }
  }

  private measureTTFB() {
    try {
      const navigationEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (navigationEntries.length > 0) {
        const nav = navigationEntries[0];
        this.webVitals.TTFB = nav.responseStart - nav.requestStart;
        this.recordMetric({
          name: 'TTFB',
          value: this.webVitals.TTFB,
          timestamp: Date.now(),
          type: 'navigation',
        });
      }
    } catch (e) {
      console.warn('TTFB measurement failed');
    }
  }

  recordMetric(metric: PerformanceMetric) {
    this.metrics.push(metric);
    // Keep only last 1000 metrics
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  recordApiCall(url: string, duration: number, status: number) {
    const normalizedUrl = this.normalizeUrl(url);

    if (!this.apiCallTimes.has(normalizedUrl)) {
      this.apiCallTimes.set(normalizedUrl, []);
    }

    const times = this.apiCallTimes.get(normalizedUrl)!;
    times.push(duration);

    // Keep only last 100 calls per endpoint
    if (times.length > 100) {
      this.apiCallTimes.set(normalizedUrl, times.slice(-100));
    }

    this.recordMetric({
      name: normalizedUrl,
      value: duration,
      timestamp: Date.now(),
      type: 'api',
      metadata: { status },
    });

    // Log slow API calls
    if (duration > 2000) {
      console.warn(`🐌 Slow API call: ${normalizedUrl} - ${duration}ms`);
    }
  }

  private normalizeUrl(url: string): string {
    return url
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/[0-9a-f]{24}/gi, '/:id')
      .replace(/\/\d+/g, '/:id')
      .replace(/\?.*$/, '');
  }

  getWebVitals(): WebVitals {
    return { ...this.webVitals };
  }

  getWebVitalsReport(): {
    vitals: WebVitals;
    scores: Record<string, 'good' | 'needs-improvement' | 'poor' | 'not-measured'>;
    overallScore: number;
  } {
    const vitals = this.getWebVitals();
    const scores: Record<string, 'good' | 'needs-improvement' | 'poor' | 'not-measured'> = {};
    let totalScore = 0;
    let measuredCount = 0;

    for (const [key, value] of Object.entries(vitals)) {
      const thresholds = WEB_VITALS_THRESHOLDS[key as keyof typeof WEB_VITALS_THRESHOLDS];

      if (value === null) {
        scores[key] = 'not-measured';
      } else if (value <= thresholds.good) {
        scores[key] = 'good';
        totalScore += 100;
        measuredCount++;
      } else if (value <= thresholds.needsImprovement) {
        scores[key] = 'needs-improvement';
        totalScore += 50;
        measuredCount++;
      } else {
        scores[key] = 'poor';
        measuredCount++;
      }
    }

    return {
      vitals,
      scores,
      overallScore: measuredCount > 0 ? Math.round(totalScore / measuredCount) : 0,
    };
  }

  getApiStats(): Array<{
    endpoint: string;
    count: number;
    avgTime: number;
    minTime: number;
    maxTime: number;
    p50: number;
    p95: number;
  }> {
    const stats: Array<any> = [];

    for (const [endpoint, times] of this.apiCallTimes.entries()) {
      if (times.length === 0) continue;

      const sorted = [...times].sort((a, b) => a - b);
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

      stats.push({
        endpoint,
        count: times.length,
        avgTime: Math.round(avgTime),
        minTime: Math.round(sorted[0]),
        maxTime: Math.round(sorted[sorted.length - 1]),
        p50: Math.round(sorted[Math.floor(sorted.length * 0.5)]),
        p95: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
      });
    }

    return stats.sort((a, b) => b.avgTime - a.avgTime);
  }

  getRecentMetrics(type?: PerformanceMetric['type']): PerformanceMetric[] {
    if (type) {
      return this.metrics.filter(m => m.type === type);
    }
    return [...this.metrics];
  }

  generateReport(): {
    webVitals: ReturnType<ClientPerformanceMonitor['getWebVitalsReport']>;
    apiStats: ReturnType<ClientPerformanceMonitor['getApiStats']>;
    recommendations: string[];
  } {
    const webVitalsReport = this.getWebVitalsReport();
    const apiStats = this.getApiStats();
    const recommendations: string[] = [];

    // Web Vitals recommendations
    if (webVitalsReport.scores.LCP === 'poor') {
      recommendations.push('LCP is poor. Consider optimizing images, preloading critical resources, and using CDN.');
    }
    if (webVitalsReport.scores.FID === 'poor') {
      recommendations.push('FID is poor. Reduce JavaScript execution time and break up long tasks.');
    }
    if (webVitalsReport.scores.CLS === 'poor') {
      recommendations.push('CLS is poor. Set explicit sizes for images/videos and avoid inserting content above existing content.');
    }
    if (webVitalsReport.scores.TTFB === 'poor') {
      recommendations.push('TTFB is poor. Consider using a CDN, optimizing server response times, or using caching.');
    }

    // API recommendations
    const slowApis = apiStats.filter(s => s.p95 > 2000);
    if (slowApis.length > 0) {
      recommendations.push(`${slowApis.length} API endpoint(s) have P95 > 2s. Consider optimizing: ${slowApis.slice(0, 3).map(s => s.endpoint).join(', ')}`);
    }

    return {
      webVitals: webVitalsReport,
      apiStats,
      recommendations,
    };
  }

  cleanup() {
    for (const observer of this.observers) {
      observer.disconnect();
    }
    this.observers = [];
  }
}

// Singleton instance
export const clientPerformanceMonitor = new ClientPerformanceMonitor();

// Custom hook for performance monitoring
export function usePerformance() {
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!isInitialized.current) {
      clientPerformanceMonitor.initialize();
      isInitialized.current = true;
    }

    return () => {
      // Don't cleanup on unmount to keep collecting metrics
    };
  }, []);

  const recordApiCall = useCallback((url: string, duration: number, status: number) => {
    clientPerformanceMonitor.recordApiCall(url, duration, status);
  }, []);

  const recordCustomMetric = useCallback((name: string, value: number, metadata?: Record<string, any>) => {
    clientPerformanceMonitor.recordMetric({
      name,
      value,
      timestamp: Date.now(),
      type: 'custom',
      metadata,
    });
  }, []);

  const getWebVitals = useCallback(() => {
    return clientPerformanceMonitor.getWebVitalsReport();
  }, []);

  const getApiStats = useCallback(() => {
    return clientPerformanceMonitor.getApiStats();
  }, []);

  const generateReport = useCallback(() => {
    return clientPerformanceMonitor.generateReport();
  }, []);

  return {
    recordApiCall,
    recordCustomMetric,
    getWebVitals,
    getApiStats,
    generateReport,
  };
}

// HOC to wrap fetch with performance monitoring
export function createMonitoredFetch(originalFetch: typeof fetch): typeof fetch {
  return async function monitoredFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const startTime = performance.now();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    try {
      const response = await originalFetch(input, init);
      const duration = performance.now() - startTime;
      clientPerformanceMonitor.recordApiCall(url, duration, response.status);
      return response;
    } catch (error) {
      const duration = performance.now() - startTime;
      clientPerformanceMonitor.recordApiCall(url, duration, 0);
      throw error;
    }
  };
}

export default usePerformance;
