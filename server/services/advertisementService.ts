import { Advertisement } from "../models/sql/Advertisement.model.js";
import { Op } from 'sequelize';
import currencyExchange from './currencyExchange.js';

// Simple in-memory cache
const memoryCache = new Map<string, { data: any; expiresAt: number }>();

const cacheGet = async <T>(key: string): Promise<T | null> => {
  const cached = memoryCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return cached.data as T;
};

const cacheSet = async (key: string, data: any, ttl: number): Promise<void> => {
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + (ttl * 1000)
  });
};

const cacheDelPattern = async (pattern: string): Promise<void> => {
  const keys = Array.from(memoryCache.keys());
  const regex = new RegExp(pattern.replace('*', '.*'));
  keys.forEach(key => {
    if (regex.test(key)) {
      memoryCache.delete(key);
    }
  });
};

interface AdPlacementConfig {
  model1Count: number; // 3x1 ads
  model2Count: number; // 1x2 ads
  model3Count: number; // 1x1 ads
  totalJobsPerPage: number;
}

// Default pricing per month in USD for each ad type
export const AD_PRICING_USD = {
  model1: 50, // $50 USD/month for 3x1 (premium)
  model2: 35, // $35 USD/month for 1x2
  model3: 20, // $20 USD/month for 1x1
};

class AdvertisementService {
  /**
   * Get active advertisements for a specific placement
   */
  async getActiveAds(
    placement: string = 'jobs_list',
    config?: AdPlacementConfig
  ): Promise<any[]> {
    const cacheKey = `ads:active:${placement}`;
    const cached = await cacheGet<any[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const now = new Date();
    const where: any = {
      status: 'active',
      paymentStatus: 'paid',
      isApproved: true,
      startDate: { [Op.lte]: now },
      endDate: { [Op.gte]: now },
    };

    if (placement && placement !== 'all') {
      where.placement = { [Op.in]: [placement, 'all'] };
    }

    let ads = await Advertisement.findAll({
      where,
      order: [
        ['priority', 'DESC'],
        ['createdAt', 'DESC']
      ],
    });

    // If config is provided, balance the mix of ad types
    if (config) {
      ads = this.balanceAdMix(ads, config);
    }

    // Cache for 5 minutes
    await cacheSet(cacheKey, ads, 300);

    return ads;
  }

  /**
   * Balance ad mix based on configuration
   */
  private balanceAdMix(
    ads: IAdvertisement[],
    config: AdPlacementConfig
  ): IAdvertisement[] {
    const model1Ads = ads.filter((ad) => ad.adType === 'model1');
    const model2Ads = ads.filter((ad) => ad.adType === 'model2');
    const model3Ads = ads.filter((ad) => ad.adType === 'model3');

    const balanced: IAdvertisement[] = [
      ...model1Ads.slice(0, config.model1Count),
      ...model2Ads.slice(0, config.model2Count),
      ...model3Ads.slice(0, config.model3Count),
    ];

    return balanced;
  }

  /**
   * Integrate ads into job listings
   * Returns array with jobs and ads mixed based on ad type
   */
  integrateAdsIntoJobs(jobs: any[], ads: IAdvertisement[]): any[] {
    if (ads.length === 0) return jobs;

    const result: any[] = [];
    let jobIndex = 0;

    // Sort ads by priority
    const sortedAds = [...ads].sort((a, b) => b.priority - a.priority);

    // Strategy: Insert ads at strategic positions
    // Model 1 (3x1): Every 6 jobs
    // Model 2 (1x2): Every 4 jobs
    // Model 3 (1x1): Every 3 jobs

    for (let i = 0; i < sortedAds.length; i++) {
      const ad = sortedAds[i];

      // Determine insertion point based on ad type
      let insertAfter = 0;
      if (ad.adType === 'model1') {
        insertAfter = 6;
      } else if (ad.adType === 'model2') {
        insertAfter = 4;
      } else {
        insertAfter = 3;
      }

      // Add jobs before the ad
      while (jobIndex < jobs.length && result.length % insertAfter !== 0) {
        result.push({ type: 'job', data: jobs[jobIndex] });
        jobIndex++;
      }

      // Add the ad
      result.push({ type: 'ad', data: ad });
    }

    // Add remaining jobs
    while (jobIndex < jobs.length) {
      result.push({ type: 'job', data: jobs[jobIndex] });
      jobIndex++;
    }

    return result;
  }

  /**
   * Calculate price for an advertisement in ARS
   * Prices are monthly in USD and converted to ARS
   */
  async calculatePrice(
    adType: 'model1' | 'model2' | 'model3',
    durationMonths: number,
    priority: number = 0
  ): Promise<number> {
    const basePriceUSD = AD_PRICING_USD[adType];

    // Convert USD to ARS
    const basePriceARS = await currencyExchange.convertUSDtoARS(basePriceUSD);

    // Calculate total price in ARS
    const totalPrice = basePriceARS * durationMonths;

    // Add priority cost (10% per priority level)
    const priorityMultiplier = 1 + priority * 0.1;

    return Math.round(totalPrice * priorityMultiplier);
  }

  /**
   * Get pricing information in ARS
   */
  async getPricingInfo(): Promise<{
    model1: number;
    model2: number;
    model3: number;
    currency: string;
    usdRate: number;
  }> {
    const usdRate = await currencyExchange.getUSDtoARSRate();

    return {
      model1: Math.round(await currencyExchange.convertUSDtoARS(AD_PRICING_USD.model1)),
      model2: Math.round(await currencyExchange.convertUSDtoARS(AD_PRICING_USD.model2)),
      model3: Math.round(await currencyExchange.convertUSDtoARS(AD_PRICING_USD.model3)),
      currency: 'ARS',
      usdRate
    };
  }

  /**
   * Record impression for an ad
   */
  async recordImpression(adId: string): Promise<void> {
    try {
      const ad = await Advertisement.findByPk(adId);
      if (ad) {
        await ad.recordImpression();
        // Invalidate cache
        await cacheDelPattern('ads:*');
      }
    } catch (error) {
      console.error('Error recording impression:', error);
    }
  }

  /**
   * Record click for an ad
   */
  async recordClick(adId: string): Promise<void> {
    try {
      const ad = await Advertisement.findByPk(adId);
      if (ad) {
        await ad.recordClick();
        // Invalidate cache
        await cacheDelPattern('ads:*');
      }
    } catch (error) {
      console.error('Error recording click:', error);
    }
  }

  /**
   * Get advertiser statistics
   */
  async getAdvertiserStats(advertiserId: string): Promise<any> {
    const cacheKey = `ads:stats:${advertiserId}`;
    const cached = await cacheGet(cacheKey);

    if (cached) {
      return cached;
    }

    const ads = await Advertisement.findAll({ where: { advertiser: advertiserId } });

    const stats = {
      totalAds: ads.length,
      activeAds: ads.filter((ad) => ad.status === 'active').length,
      totalImpressions: ads.reduce((sum, ad) => sum + ad.impressions, 0),
      totalClicks: ads.reduce((sum, ad) => sum + ad.clicks, 0),
      averageCTR:
        ads.length > 0
          ? ads.reduce((sum, ad) => sum + ad.ctr, 0) / ads.length
          : 0,
      totalSpent: ads
        .filter((ad) => ad.paymentStatus === 'paid')
        .reduce((sum, ad) => sum + ad.totalPrice, 0),
      byType: {
        model1: ads.filter((ad) => ad.adType === 'model1').length,
        model2: ads.filter((ad) => ad.adType === 'model2').length,
        model3: ads.filter((ad) => ad.adType === 'model3').length,
      },
    };

    // Cache for 10 minutes
    await cacheSet(cacheKey, stats, 600);

    return stats;
  }

  /**
   * Check and expire ads
   */
  async expireAds(): Promise<number> {
    const now = new Date();
    const [affectedCount] = await Advertisement.update(
      { status: 'expired' },
      {
        where: {
          status: 'active',
          endDate: { [Op.lt]: now },
        },
      }
    );

    // Invalidate cache
    await cacheDelPattern('ads:*');

    return affectedCount;
  }

  /**
   * Get ad performance report
   */
  async getPerformanceReport(adId: string): Promise<any> {
    const ad = await Advertisement.findByPk(adId);

    if (!ad) {
      throw new Error('Advertisement not found');
    }

    const durationDays = Math.ceil(
      (ad.endDate.getTime() - ad.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const daysActive = Math.ceil(
      (Math.min(new Date().getTime(), ad.endDate.getTime()) -
        ad.startDate.getTime()) /
        (1000 * 60 * 60 * 24)
    );

    return {
      ad: {
        id: ad._id,
        title: ad.title,
        type: ad.adType,
        status: ad.status,
      },
      performance: {
        impressions: ad.impressions,
        clicks: ad.clicks,
        ctr: ad.ctr,
        impressionsPerDay:
          daysActive > 0 ? Math.round(ad.impressions / daysActive) : 0,
        clicksPerDay: daysActive > 0 ? Math.round(ad.clicks / daysActive) : 0,
      },
      duration: {
        totalDays: durationDays,
        daysActive: daysActive,
        daysRemaining: Math.max(
          0,
          Math.ceil((ad.endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        ),
      },
      cost: {
        total: ad.totalPrice,
        perDay: ad.pricePerDay,
        costPerImpression:
          ad.impressions > 0
            ? Math.round((ad.totalPrice / ad.impressions) * 1000) / 1000
            : 0,
        costPerClick:
          ad.clicks > 0 ? Math.round((ad.totalPrice / ad.clicks) * 100) / 100 : 0,
      },
    };
  }
}

export default new AdvertisementService();
