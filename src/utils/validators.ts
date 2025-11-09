import { z } from 'zod';
import { LIMITS } from './constants';

// Common schemas
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid Sui address');

const priceSchema = z
  .number()
  .min(LIMITS.MIN_PRICE, `Price must be at least ${LIMITS.MIN_PRICE} SUI`)
  .max(LIMITS.MAX_PRICE, `Price cannot exceed ${LIMITS.MAX_PRICE} SUI`);

const titleSchema = z
  .string()
  .min(LIMITS.MIN_TITLE_LENGTH, `Title must be at least ${LIMITS.MIN_TITLE_LENGTH} characters`)
  .max(LIMITS.MAX_TITLE_LENGTH, `Title cannot exceed ${LIMITS.MAX_TITLE_LENGTH} characters`);

// Upload Data Schema
export const UploadDataSchema = z.object({
  title: titleSchema,
  description: z.string().min(10).max(5000),
  category: z.string().min(1).max(50),
  tags: z.array(z.string()).min(1).max(10),
  price: priceSchema,
  seller: addressSchema,
});

export type UploadDataInput = z.infer<typeof UploadDataSchema>;

// Publish DataPod Schema
export const PublishDataPodSchema = z.object({
  datapodId: z.string(),
  seller: addressSchema,
  walrusBlob: z.string(),
  encryptionKey: z.string(),
  signature: z.string(),
});

export type PublishDataPodInput = z.infer<typeof PublishDataPodSchema>;

// Create Purchase Schema
export const CreatePurchaseSchema = z.object({
  datapodId: z.string(),
  buyer: addressSchema,
  seller: addressSchema,
  price: priceSchema,
  signature: z.string(),
});

export type CreatePurchaseInput = z.infer<typeof CreatePurchaseSchema>;

// Submit Review Schema
export const SubmitReviewSchema = z.object({
  datapodId: z.string(),
  purchaseId: z.string(),
  reviewer: addressSchema,
  rating: z.number().min(1).max(5),
  comment: z.string().min(10).max(1000),
  signature: z.string(),
});

export type SubmitReviewInput = z.infer<typeof SubmitReviewSchema>;

// Pagination Schema
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;

// Search Schema
export const SearchSchema = z.object({
  query: z.string().min(1).max(100),
  category: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  sortBy: z.enum(['price', 'rating', 'recent']).optional(),
  ...PaginationSchema.shape,
});

export type SearchInput = z.infer<typeof SearchSchema>;

// Auth Schema
export const AuthSchema = z.object({
  address: addressSchema,
  signature: z.string(),
  message: z.string(),
});

export type AuthInput = z.infer<typeof AuthSchema>;

// Update Profile Schema
export const UpdateProfileSchema = z.object({
  address: addressSchema,
  username: z.string().min(3).max(50).optional(),
  bio: z.string().max(500).optional(),
  avatar: z.string().url().optional(),
  website: z.string().url().optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
