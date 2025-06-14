import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

export interface PostFromService {
  postId: string;
  userId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  hasUserLiked: boolean;
}

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

  async getPosts(correlationId?: string, authorizationHeader?: string): Promise<PostFromService[]> {
    const requestUrl = `${this.postServiceUrl}/posts`;
    this.logger.info(`FeedRepository: Fetching posts from PostService.`, { correlationId, url: requestUrl });
    
    const headers: Record<string, string> = {};
    if (correlationId) headers['X-Correlation-ID'] = correlationId;
    if (authorizationHeader) headers['Authorization'] = authorizationHeader;

    try {
      const response = await this.axiosInstance.get<PostFromService[]>(requestUrl, { headers });
      return response.data;
    } catch (error) {
      this.logger.error(`FeedRepository: Error fetching posts.`, { correlationId, error: (error as any).message });
      throw new Error('Failed to fetch posts from downstream service.');
    }
  }

  async getUsersByIds(userIds: string[], correlationId?: string, authorizationHeader?: string): Promise<UserFromService[]> {
    if (userIds.length === 0) {
      return [];
    }
    const params = new URLSearchParams({ ids: userIds.join(',') });
    const requestUrl = `${this.userServiceUrl}/users`;
    
    const headers: Record<string, string> = {};
    if (correlationId) headers['X-Correlation-ID'] = correlationId;
    if (authorizationHeader) headers['Authorization'] = authorizationHeader;

    try {
      const response = await this.axiosInstance.get<UserFromService[]>(requestUrl, { headers });
      return response.data;
    } catch (error) {
      this.logger.error(`FeedRepository: Error fetching users in bulk.`, { correlationId, error: (error as any).message });
      return [];
    }
  }
}