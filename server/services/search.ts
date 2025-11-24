import { Job } from "../models/sql/Job.model.js";
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

    // Build query
    const searchQuery: any = {
      status: "open", // Only show open jobs
    };

    // Text search
    if (query) {
      searchQuery.$text = { $search: query };
    }

    // Category filter
    if (category) {
      searchQuery.category = category;
    }

    // Tags filter (match any tag)
    if (tags && tags.length > 0) {
      searchQuery.tags = { [Op.in]: tags };
    }

    // Price range filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      searchQuery.price = {};
      if (minPrice !== undefined) {
        searchQuery.price.$gte = minPrice;
      }
      if (maxPrice !== undefined) {
        searchQuery.price.$lte = maxPrice;
      }
    }

    // Location filter - will be handled in post-processing for normalized matching
    // We'll keep the regex as a pre-filter to reduce dataset
    if (location) {
      searchQuery.location = { $exists: true };
    }

    // Geolocation filter (proximity search)
    if (latitude !== undefined && longitude !== undefined && maxDistance) {
      searchQuery.latitude = { $exists: true };
      searchQuery.longitude = { $exists: true };
    }

    // Remote work filter
    if (remoteOk !== undefined) {
      searchQuery.remoteOk = remoteOk;
    }

    // Urgency filter
    if (urgency) {
      searchQuery.urgency = urgency;
    }

    // Experience level filter
    if (experienceLevel) {
      searchQuery.experienceLevel = experienceLevel;
    }

    // Materials provided filter
    if (materialsProvided !== undefined) {
      searchQuery.materialsProvided = materialsProvided;
    }

    // Start date range filter
    if (startDateFrom || startDateTo) {
      searchQuery.startDate = {};
      if (startDateFrom) {
        searchQuery.startDate.$gte = new Date(startDateFrom);
      }
      if (startDateTo) {
        searchQuery.startDate.$lte = new Date(startDateTo);
      }
    }

    // Execute query
    let jobsQuery = Job.find(searchQuery).populate("client", "name avatar rating reviewsCount");

    // Apply geolocation filtering if coordinates provided
    if (latitude !== undefined && longitude !== undefined && maxDistance) {
      const jobs = await jobsQuery.lean();

      // Filter by distance using Haversine formula
      const filteredJobs = jobs.filter((job: any) => {
        if (!job.latitude || !job.longitude) return false;

        const distance = this.calculateDistance(
          latitude,
          longitude,
          job.latitude,
          job.longitude
        );

        return distance <= maxDistance;
      });

      // Manual sorting and pagination for geo-filtered results
      const sorted = this.sortJobs(filteredJobs, sortBy, sortOrder);
      const startIndex = (page - 1) * limit;
      const paginatedJobs = sorted.slice(startIndex, startIndex + limit);

      const result = {
        jobs: paginatedJobs,
        total: filteredJobs.length,
        page,
        limit,
        pages: Math.ceil(filteredJobs.length / limit),
      };

      // Cache for 5 minutes
      await cacheSet(cacheKey, result, 300);
      return result;
    }

    // Regular search (no geo filtering)
    // Build sort object
    const sort: any = {};
    if (query) {
      // If text search, include text score
      sort.score = { $meta: "textScore" };
    }
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    let jobs = await jobsQuery
      .sort(sort)
      .lean();

    // Apply location filter with normalization if provided
    if (location) {
      const normalizedSearchLocation = normalizeLocation(location);
      jobs = jobs.filter((job: any) => {
        if (!job.location) return false;
        const normalizedJobLocation = normalizeLocation(job.location);
        return normalizedJobLocation.includes(normalizedSearchLocation);
      });
    }

    // Count after filtering
    const total = jobs.length;

    // Apply pagination after filtering
    const paginatedJobs = jobs.slice((page - 1) * limit, page * limit);

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

    const result = await Job.aggregate([
      { $match: { status: "open" } },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { tag: "$_id", count: 1, _id: 0 } },
    ]);

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

    const result = await Job.aggregate([
      { $match: { status: "open" } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { category: "$_id", count: 1, _id: 0 } },
    ]);

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

    const jobs = await Job.find({
      status: "open",
      [Op.or]: [
        { title: { [Op.regexp]: query, $options: "i" } },
        { tags: { [Op.regexp]: query, $options: "i" } },
        { category: { [Op.regexp]: query, $options: "i" } },
      ],
    })
      .select("title category tags")
      .limit(limit)
      .lean();

    // Extract unique suggestions
    const suggestions = new Set<string>();

    jobs.forEach((job: any) => {
      if (job.title.toLowerCase().includes(query.toLowerCase())) {
        suggestions.add(job.title);
      }
      if (job.category && job.category.toLowerCase().includes(query.toLowerCase())) {
        suggestions.add(job.category);
      }
      job.tags?.forEach((tag: string) => {
        if (tag.toLowerCase().includes(query.toLowerCase())) {
          suggestions.add(tag);
        }
      });
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
