import { Router, Request, Response } from "express";
import searchService from "../services/search";

const router = Router();

/**
 * Advanced search for jobs
 * GET /api/search/jobs
 */
router.get("/jobs", async (req: Request, res: Response): Promise<void> => {
  try {
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
      sortBy,
      sortOrder,
      page,
      limit,
    } = req.query;

    const filters: any = {};

    if (query) filters.query = query as string;
    if (category) filters.category = category as string;
    if (tags) {
      filters.tags = Array.isArray(tags) ? tags : [tags];
    }
    if (minPrice) filters.minPrice = parseFloat(minPrice as string);
    if (maxPrice) filters.maxPrice = parseFloat(maxPrice as string);
    if (location) filters.location = location as string;
    if (latitude) filters.latitude = parseFloat(latitude as string);
    if (longitude) filters.longitude = parseFloat(longitude as string);
    if (maxDistance) filters.maxDistance = parseFloat(maxDistance as string);
    if (remoteOk !== undefined) filters.remoteOk = remoteOk === "true";
    if (urgency) filters.urgency = urgency as "low" | "medium" | "high";
    if (experienceLevel) {
      filters.experienceLevel = experienceLevel as "beginner" | "intermediate" | "expert";
    }
    if (materialsProvided !== undefined) {
      filters.materialsProvided = materialsProvided === "true";
    }
    if (startDateFrom) filters.startDateFrom = new Date(startDateFrom as string);
    if (startDateTo) filters.startDateTo = new Date(startDateTo as string);
    if (sortBy) filters.sortBy = sortBy as string;
    if (sortOrder) filters.sortOrder = sortOrder as "asc" | "desc";
    if (page) filters.page = parseInt(page as string);
    if (limit) filters.limit = parseInt(limit as string);

    const result = await searchService.searchJobs(filters) as any;

    res.json({
      success: true,
      data: result.jobs,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: result.pages,
      },
    });
  } catch (error: any) {
    console.error("Search jobs error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Get popular tags
 * GET /api/search/tags
 */
router.get("/tags", async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit } = req.query;
    const tagLimit = limit ? parseInt(limit as string) : 20;

    const tags = await searchService.getPopularTags(tagLimit);

    res.json({
      success: true,
      data: tags,
    });
  } catch (error: any) {
    console.error("Get popular tags error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Get all categories with counts
 * GET /api/search/categories
 */
router.get("/categories", async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await searchService.getCategories();

    res.json({
      success: true,
      data: categories,
    });
  } catch (error: any) {
    console.error("Get categories error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Get search suggestions
 * GET /api/search/suggestions
 */
router.get("/suggestions", async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, limit } = req.query;

    if (!query) {
      res.json({
        success: true,
        data: [],
      });
      return;
    }

    const suggestionLimit = limit ? parseInt(limit as string) : 10;
    const suggestions = await searchService.getSuggestions(
      query as string,
      suggestionLimit
    );

    res.json({
      success: true,
      data: suggestions,
    });
  } catch (error: any) {
    console.error("Get suggestions error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Geocode location via OpenStreetMap Nominatim proxy
 * GET /api/search/geocode?q=query
 */
router.get("/geocode", async (req: Request, res: Response): Promise<void> => {
  try {
    const { q } = req.query;
    if (!q || (q as string).length < 2) {
      res.json({ success: true, results: [] });
      return;
    }

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent((q as string) + ', Argentina')}&format=json&limit=7&accept-language=es&addressdetails=0`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'DOAPP/1.0', 'Accept-Language': 'es' },
    });

    if (!response.ok) {
      res.json({ success: true, results: [] });
      return;
    }

    const data = await response.json() as any[];
    const results = data.map((item: any) =>
      item.display_name.replace(/,\s*Argentina$/i, '').trim()
    );

    res.json({ success: true, results });
  } catch {
    res.json({ success: true, results: [] });
  }
});

export default router;
