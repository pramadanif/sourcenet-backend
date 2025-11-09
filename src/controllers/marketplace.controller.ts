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
