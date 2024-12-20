import { Document } from 'mongoose';

export interface IApiKey {
  _id: string;
  key: string;
  name: string;
  hashedKey: string;
  lastUsed: Date | null;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

export interface IUser extends Document {
  _id: string;
  username: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  isActive: boolean;
  lastLogin: Date | null;
  apiKeys: IApiKey[];
  apiKeyCount: number;
  addApiKey(name: string, expiresIn?: number): Promise<{ key: string; id: string }>;
  verifyApiKey(key: string): Promise<boolean>;
  deactivateApiKey(keyId: string): Promise<IApiKey | null>;
}

export interface IApiKeyResponse {
  id: string;
  name: string;
  createdAt: Date;
  lastUsed: Date | null;
  expiresAt: Date;
  isActive: boolean;
}

export interface ICreateKeyRequest {
  name: string;
  expiresIn?: number;
}

export interface IApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: string[];
}

export interface IMetricsData {
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  activeUsers: number;
  cacheStats: {
    hits: number;
    misses: number;
    size: number;
  };
}

// Request extension to include user and correlation ID
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      correlationId: string;
      validatedData: any;
    }
  }
} 