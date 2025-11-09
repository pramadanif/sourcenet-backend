import { Request, Response } from 'express';
import prisma from '@/config/database';
import { logger } from '@/utils/logger';
import { CacheService } from '@/services/cache.service';
import { ValidationError } from '@/types/errors.types';

interface MarketplaceFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  sortBy?: 'price' | 'rating' | 'recent' | 'popular';
  page?: number;
  limit?: number;
}

/**
 * Browse marketplace
 */
export const browseMarketplace = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      category,
      minPrice,
      maxPrice,
      minRating,
      sortBy = 'recent',
      page = 1,
      limit = 20,
    } = req.query as any;

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build filters
    const filters: any = {
      status: 'published',
      deletedAt: null,
    };

    if (category) {
      filters.category = category;
    }

    if (minPrice || maxPrice) {
      filters.priceSui = {};
      if (minPrice) filters.priceSui.gte = parseFloat(minPrice);
      if (maxPrice) filters.priceSui.lte = parseFloat(maxPrice);
    }

    if (minRating) {
      filters.averageRating = { gte: parseFloat(minRating) };
    }

    logger.info('Browsing marketplace', {
      requestId: req.requestId,
      filters,
      page: pageNum,
      limit: limitNum,
    });

    // Check cache
    const cacheKey = `marketplace:browse:${JSON.stringify(filters)}:${pageNum}:${limitNum}`;
    const cached = await CacheService.getCachedData(cacheKey);
    if (cached) {
      logger.debug('Returning cached marketplace data', { requestId: req.requestId });
      res.status(200).json(cached);
      return;
    }

    // Build sort order
    let orderBy: any = { publishedAt: 'desc' };
    if (sortBy === 'price') {
      orderBy = { priceSui: 'asc' };
    } else if (sortBy === 'rating') {
      orderBy = { averageRating: 'desc' };
    } else if (sortBy === 'popular') {
      orderBy = { totalSales: 'desc' };
    }

    // Query database
    const [datapods, total] = await Promise.all([
      prisma.dataPod.findMany({
        where: filters,
        orderBy,
        skip,
        take: limitNum,
        include: {
          seller: {
            select: {
              id: true,
              username: true,
              averageRating: true,
              totalSales: true,
              isVerified: true,
            },
          },
        },
      }),
      prisma.dataPod.count({ where: filters }),
    ]);

    const response = {
      status: 'success',
      data: datapods,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    };

    // Cache result
    await CacheService.setCachedData(cacheKey, response, 3600); // 1 hour

    res.status(200).json(response);
  } catch (error) {
    logger.error('Browse marketplace failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Search marketplace
 */
export const searchMarketplace = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, category, page = 1, limit = 20 } = req.query as any;

    if (!q || q.trim().length < 2) {
      throw new ValidationError('Search query must be at least 2 characters');
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    logger.info('Searching marketplace', {
      requestId: req.requestId,
      query: q,
      category,
    });

    // Build search filters
    const filters: any = {
      status: 'published',
      deletedAt: null,
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { tags: { has: q.toLowerCase() } },
      ],
    };

    if (category) {
      filters.category = category;
    }

    // Query database
    const [datapods, total] = await Promise.all([
      prisma.dataPod.findMany({
        where: filters,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limitNum,
        include: {
          seller: {
            select: {
              id: true,
              username: true,
              averageRating: true,
              totalSales: true,
              isVerified: true,
            },
          },
        },
      }),
      prisma.dataPod.count({ where: filters }),
    ]);

    res.status(200).json({
      status: 'success',
      query: q,
      data: datapods,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('Search marketplace failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Get DataPod details
 */
export const getDataPodDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { datapod_id } = req.params;

    if (!datapod_id) {
      throw new ValidationError('Missing datapod_id');
    }

    // Check cache
    const cached = await CacheService.getDataPodCache(datapod_id);
    if (cached) {
      logger.debug('Returning cached DataPod', { requestId: req.requestId });
      res.status(200).json(cached);
      return;
    }

    // Query database
    const datapod = await prisma.dataPod.findUnique({
      where: { datapodId: datapod_id },
      include: {
        seller: {
          select: {
            id: true,
            username: true,
            bio: true,
            avatarUrl: true,
            averageRating: true,
            totalSales: true,
            reputationScore: true,
            isVerified: true,
          },
        },
        reviews: {
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!datapod) {
      throw new ValidationError('DataPod not found');
    }

    if (datapod.status !== 'published') {
      throw new ValidationError('DataPod not available');
    }

    const response = {
      status: 'success',
      data: datapod,
    };

    // Cache result
    await CacheService.cacheDataPodDetails(datapod_id, response);

    res.status(200).json(response);
  } catch (error) {
    logger.error('Get DataPod details failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Get top-rated DataPods
 */
export const getTopRated = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 10 } = req.query as any;
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));

    // Check cache
    const cached = await CacheService.getTopRatedCache();
    if (cached) {
      logger.debug('Returning cached top-rated', { requestId: req.requestId });
      res.status(200).json(cached);
      return;
    }

    // Query database
    const datapods = await prisma.dataPod.findMany({
      where: {
        status: 'published',
        deletedAt: null,
        averageRating: { gte: 4 },
      },
      orderBy: { averageRating: 'desc' },
      take: limitNum,
      include: {
        seller: {
          select: {
            id: true,
            username: true,
            averageRating: true,
            isVerified: true,
          },
        },
      },
    });

    const response = {
      status: 'success',
      data: datapods,
    };

    // Cache result (6 hours)
    await CacheService.cacheTopRated(response);

    res.status(200).json(response);
  } catch (error) {
    logger.error('Get top-rated failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Get datapods with advanced filtering, sorting, and caching
 * GET /api/marketplace/datapods?page=1&limit=20&category=gaming&sort_by=newest&price_min=1&price_max=100&search=steam
 */
export const getDataPods = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      sort_by = 'newest',
      price_min,
      price_max,
      search,
    } = req.query as any;

    // Validate and clamp pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Validate sort_by
    const validSortOptions = ['newest', 'price_asc', 'price_desc', 'rating'];
    const sortBy = validSortOptions.includes(sort_by) ? sort_by : 'newest';

    // Parse price filters
    const priceMin = price_min ? parseFloat(price_min) : undefined;
    const priceMax = price_max ? parseFloat(price_max) : undefined;

    // Validate price range
    if ((priceMin && isNaN(priceMin)) || (priceMax && isNaN(priceMax))) {
      res.status(400).json({
        error: {
          code: 'INVALID_PRICE_RANGE',
          message: 'Price min and max must be valid numbers',
          statusCode: 400,
          requestId: req.requestId,
        },
      });
      return;
    }

    // Generate cache key
    const cacheKey = `marketplace:datapods:${pageNum}:${limitNum}:${category || 'all'}:${sortBy}:${priceMin || 'none'}:${priceMax || 'none'}:${search || 'none'}`;

    logger.info('Fetching datapods', {
      requestId: req.requestId,
      page: pageNum,
      limit: limitNum,
      category,
      sortBy,
      priceMin,
      priceMax,
      search,
    });

    // Check Redis cache
    const cached = await CacheService.getCachedData(cacheKey);
    if (cached) {
      logger.debug('Returning cached datapods', { requestId: req.requestId });
      res.status(200).json(cached);
      return;
    }

    // Build Prisma where filters
    const where: any = {
      status: 'published',
      deletedAt: null,
    };

    if (category) {
      where.category = category;
    }

    if (priceMin !== undefined || priceMax !== undefined) {
      where.priceSui = {};
      if (priceMin !== undefined) where.priceSui.gte = priceMin;
      if (priceMax !== undefined) where.priceSui.lte = priceMax;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tags: { has: search.toLowerCase() } },
      ];
    }

    // Build sort order
    let orderBy: any = { publishedAt: 'desc' };
    if (sortBy === 'price_asc') {
      orderBy = { priceSui: 'asc' };
    } else if (sortBy === 'price_desc') {
      orderBy = { priceSui: 'desc' };
    } else if (sortBy === 'rating') {
      orderBy = { averageRating: 'desc' };
    }

    // Query database in parallel
    const startTime = Date.now();
    const [datapods, totalCount] = await Promise.all([
      prisma.dataPod.findMany({
        where,
        orderBy,
        skip,
        take: limitNum,
        include: {
          seller: {
            select: {
              id: true,
              username: true,
              averageRating: true,
              totalSales: true,
              isVerified: true,
            },
          },
        },
      }),
      prisma.dataPod.count({ where }),
    ]);
    const queryTime = Date.now() - startTime;

    // Denormalize response
    const denormalizedDatapods = datapods.map((pod: any) => ({
      id: pod.datapodId,
      title: pod.title,
      category: pod.category,
      price_sui: pod.priceSui.toNumber(),
      seller: pod.seller.username || pod.seller.id,
      seller_name: pod.seller.username,
      seller_rating: pod.seller.averageRating ? parseFloat(pod.seller.averageRating.toString()) : null,
      seller_total_sales: pod.seller.totalSales,
      total_sales: pod.totalSales,
      average_rating: pod.averageRating ? parseFloat(pod.averageRating.toString()) : null,
      preview_data: pod.description?.substring(0, 100) || '',
      size_bytes: 0, // TODO: Add size tracking to schema
      published_at: pod.publishedAt?.toISOString(),
    }));

    const response = {
      status: 'success',
      datapods: denormalizedDatapods,
      total_count: totalCount,
      page: pageNum,
      limit: limitNum,
      has_next: pageNum * limitNum < totalCount,
      has_prev: pageNum > 1,
      query_time_ms: queryTime,
    };

    // Cache result with 1 hour TTL
    await CacheService.setCachedData(cacheKey, response, 3600);

    logger.info('Datapods fetched successfully', {
      requestId: req.requestId,
      count: datapods.length,
      total: totalCount,
      queryTime,
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Get datapods failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Get categories
 */
export const getCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await prisma.dataPod.findMany({
      where: {
        status: 'published',
        deletedAt: null,
      },
      distinct: ['category'],
      select: {
        category: true,
      },
    });

    const categoryList = categories.map((c: any) => c.category).filter(Boolean);

    res.status(200).json({
      status: 'success',
      categories: categoryList,
    });
  } catch (error) {
    logger.error('Get categories failed', { error, requestId: req.requestId });
    throw error;
  }
};
