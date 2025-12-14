import { Job } from "../models/sql/Job.model.js";
import { User } from "../models/sql/User.model.js";
import { Op } from 'sequelize';

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

// Normalize location string: remove punctuation and convert to lowercase
const normalizeLocation = (location: string): string => {
  return location
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
};

interface SearchFilters {
  query?: string;
  category?: string;
  tags?: string[];
  minPrice?: number;
  maxPrice?: number;
  location?: string;
  latitude?: number;
  longitude?: number;
  maxDistance?: number; // in kilometers
  remoteOk?: boolean;
  urgency?: "low" | "medium" | "high";
  experienceLevel?: "beginner" | "intermediate" | "expert";
  materialsProvided?: boolean;
  startDateFrom?: Date;
  startDateTo?: Date;
  sortBy?: "createdAt" | "price" | "views" | "startDate";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

class SearchService {
  /**
   * Advanced search for jobs with multiple filters
   */
  async searchJobs(filters: SearchFilters) {
    const {
      query,
      category,
      tags,
      minPrice,
      maxPrice,
      location,
      latitude,
      longitude,
      maxDistance,
      remoteOk,
      urgency,
      experienceLevel,
      materialsProvided,
      startDateFrom,
      startDateTo,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 20,
    } = filters;

    // Generate cache key from filters
    const cacheKey = `search:jobs:${JSON.stringify(filters)}`;

    // Try to get from cache
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    // Build Sequelize where clause
    const where: any = {
      status: "open", // Only show open jobs
    };

    // Text search using ILIKE for PostgreSQL
    if (query) {
      const searchPattern = `%${query}%`;
      where[Op.or] = [
        { title: { [Op.iLike]: searchPattern } },
        { summary: { [Op.iLike]: searchPattern } },
        { description: { [Op.iLike]: searchPattern } },
      ];
    }

    // Category filter
    if (category) {
      where.category = category;
    }

    // Tags filter (match any tag) - use overlap for PostgreSQL arrays
    if (tags && tags.length > 0) {
      where.tags = { [Op.overlap]: tags };
    }

    // Price range filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) {
        where.price[Op.gte] = minPrice;
      }
      if (maxPrice !== undefined) {
        where.price[Op.lte] = maxPrice;
      }
    }

    // Location filter - will be handled in post-processing for normalized matching
    if (location) {
      where.location = { [Op.ne]: null };
    }

    // Geolocation filter - will be handled in post-processing
    if (latitude !== undefined && longitude !== undefined && maxDistance) {
      where.latitude = { [Op.ne]: null };
      where.longitude = { [Op.ne]: null };
    }

    // Remote work filter
    if (remoteOk !== undefined) {
      where.remoteOk = remoteOk;
    }

    // Urgency filter
    if (urgency) {
      where.urgency = urgency;
    }

    // Experience level filter
    if (experienceLevel) {
      where.experienceLevel = experienceLevel;
    }

    // Materials provided filter
    if (materialsProvided !== undefined) {
      where.materialsProvided = materialsProvided;
    }

    // Start date range filter
    if (startDateFrom || startDateTo) {
      where.startDate = {};
      if (startDateFrom) {
        where.startDate[Op.gte] = new Date(startDateFrom);
      }
      if (startDateTo) {
        where.startDate[Op.lte] = new Date(startDateTo);
      }
    }

    // Build sort order for Sequelize
    const order: any[] = [[sortBy, sortOrder === "asc" ? "ASC" : "DESC"]];

    // Execute query
    let jobs = await Job.findAll({
      where,
      include: [
        {
          model: User,
          as: "client",
          attributes: ["id", "name", "avatar", "rating", "reviewsCount"],
        },
      ],
      order,
    });

    // Convert to plain objects
    let plainJobs = jobs.map(job => job.toJSON());

    // Apply location filter with normalization if provided (post-processing)
    if (location) {
      const normalizedSearchLocation = normalizeLocation(location);
      plainJobs = plainJobs.filter((job: any) => {
        if (!job.location) return false;
        const normalizedJobLocation = normalizeLocation(job.location);
        return normalizedJobLocation.includes(normalizedSearchLocation);
      });
    }

    // Apply geolocation filtering if coordinates provided (post-processing)
    if (latitude !== undefined && longitude !== undefined && maxDistance) {
      plainJobs = plainJobs.filter((job: any) => {
        if (!job.latitude || !job.longitude) return false;

        const distance = this.calculateDistance(
          latitude,
          longitude,
          job.latitude,
          job.longitude
        );

        return distance <= maxDistance;
      });
    }

    // Count after filtering
    const total = plainJobs.length;

    // Apply pagination after filtering
    const paginatedJobs = plainJobs.slice((page - 1) * limit, page * limit);

    const result = {
      jobs: paginatedJobs,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };

    // Cache for 5 minutes
    await cacheSet(cacheKey, result, 300);
    return result;
  }

  /**
   * Get popular tags
   */
  async getPopularTags(limit: number = 20) {
    const cacheKey = `search:tags:${limit}`;

    // Try cache first
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    // Get all open jobs with tags
    const jobs = await Job.findAll({
      where: { status: "open" },
      attributes: ["tags"],
    });

    // Count tags manually
    const tagCounts: Record<string, number> = {};
    jobs.forEach((job: any) => {
      if (job.tags && Array.isArray(job.tags)) {
        job.tags.forEach((tag: string) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    // Sort and limit
    const result = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    // Cache for 15 minutes
    await cacheSet(cacheKey, result, 900);
    return result;
  }

  /**
   * Get all categories with job counts
   */
  async getCategories() {
    const cacheKey = "search:categories";

    // Try cache first
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    // Get all open jobs with categories
    const jobs = await Job.findAll({
      where: { status: "open" },
      attributes: ["category"],
    });

    // Count categories manually
    const categoryCounts: Record<string, number> = {};
    jobs.forEach((job: any) => {
      if (job.category) {
        categoryCounts[job.category] = (categoryCounts[job.category] || 0) + 1;
      }
    });

    // Sort by count
    const result = Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    // Cache for 15 minutes
    await cacheSet(cacheKey, result, 900);
    return result;
  }

  /**
   * Get search suggestions based on query
   */
  async getSuggestions(query: string, limit: number = 10) {
    if (!query || query.length < 2) {
      return [];
    }

    const searchPattern = `%${query}%`;

    const jobs = await Job.findAll({
      where: {
        status: "open",
        [Op.or]: [
          { title: { [Op.iLike]: searchPattern } },
          { category: { [Op.iLike]: searchPattern } },
        ],
      },
      attributes: ["title", "category", "tags"],
      limit,
    });

    // Extract unique suggestions
    const suggestions = new Set<string>();

    jobs.forEach((job: any) => {
      if (job.title && job.title.toLowerCase().includes(query.toLowerCase())) {
        suggestions.add(job.title);
      }
      if (job.category && job.category.toLowerCase().includes(query.toLowerCase())) {
        suggestions.add(job.category);
      }
      if (job.tags && Array.isArray(job.tags)) {
        job.tags.forEach((tag: string) => {
          if (tag.toLowerCase().includes(query.toLowerCase())) {
            suggestions.add(tag);
          }
        });
      }
    });

    return Array.from(suggestions).slice(0, limit);
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Sort jobs array
   */
  private sortJobs(jobs: any[], sortBy: string, sortOrder: string): any[] {
    return jobs.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];

      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }
}

export default new SearchService();
