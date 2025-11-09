export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserEntity extends BaseEntity {
  address: string;
  email?: string;
  username?: string;
  bio?: string;
  avatarUrl?: string;
  websiteUrl?: string;
  reputationScore: number;
  totalSales: number;
}

export interface DataPodEntity extends BaseEntity {
  title: string;
  description: string;
  category: string;
  tags: string[];
  price: number;
  sellerId: string;
  walrusBlobId: string;
  encryptionKey: string;
  isPublished: boolean;
  publishedAt?: Date;
}

export interface PurchaseEntity extends BaseEntity {
  datapodId: string;
  buyerId: string;
  sellerId: string;
  price: number;
  status: 'pending' | 'completed' | 'refunded' | 'disputed';
  txDigest?: string;
}

export interface ReviewEntity extends BaseEntity {
  datapodId: string;
  purchaseId: string;
  reviewerId: string;
  rating: number;
  comment: string;
}

export interface Repository<T extends BaseEntity> {
  findById(id: string): Promise<T | null>;
  findMany(params?: Record<string, unknown>): Promise<T[]>;
  create(data: Omit<T, keyof BaseEntity>): Promise<T>;
  update(id: string, data: Partial<Omit<T, keyof BaseEntity>>): Promise<T>;
  delete(id: string): Promise<void>;
}
