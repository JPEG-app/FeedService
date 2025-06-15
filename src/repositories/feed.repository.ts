import axios, { InternalAxiosRequestConfig } from 'axios';
import { FeedItem, User } from '../models/feed.model';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

export interface UserFromService {
  userId: string;
  username: string;
}

export class FeedRepository {
  private postServiceUrl: string;
  private userServiceUrl: string;
  private logger: winston.Logger;
  private axiosInstance = axios.create();

  constructor(
    postServiceUrl: string,
    userServiceUrl: string,
    loggerInstance: winston.Logger
  ) {
    this.postServiceUrl = postServiceUrl;
    this.userServiceUrl = userServiceUrl;
    this.logger = loggerInstance;

    this.axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
        if (!config.headers['X-Correlation-ID']) {
            config.headers['X-Correlation-ID'] = uuidv4();
        }
        return config;
    });
  }

  async getPosts(correlationId?: string, authorizationHeader?: string): Promise<FeedItem[]> {
    const requestUrl = `${this.postServiceUrl}/posts`;
    this.logger.info(`FeedRepository: Fetching posts from PostService.`, { correlationId, url: requestUrl });
    
    const headers: Record<string, string> = {};
    if (correlationId) headers['X-Correlation-ID'] = correlationId;
    if (authorizationHeader) headers['Authorization'] = authorizationHeader;

    try {
      const response = await this.axiosInstance.get<FeedItem[]>(requestUrl, { headers });
      return response.data;
    } catch (error) {
      this.logger.error(`FeedRepository: Error fetching posts.`, { correlationId, error: (error as any).message });
      throw new Error('Failed to fetch posts from downstream service.');
    }
  }

  async getUsersByIds(correlationId?: string, authorizationHeader?: string): Promise<User[]> {
    const requestUrl = `${this.userServiceUrl}/users`;
    
    const headers: Record<string, string> = {};
    if (correlationId) headers['X-Correlation-ID'] = correlationId;
    if (authorizationHeader) headers['Authorization'] = authorizationHeader;

    try {
      const response = await this.axiosInstance.get<User[]>(requestUrl, { headers });
      return response.data;
    } catch (error) {
      this.logger.error(`FeedRepository: Error fetching users in bulk.`, { correlationId, error: (error as any).message });
      return [];
    }
  }
}