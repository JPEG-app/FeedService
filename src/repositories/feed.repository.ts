import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { FeedItem } from '../models/feed.model';
import winston from 'winston';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class FeedRepository {
  private postServiceUrl: string;
  private logger: winston.Logger;
  private axiosInstance = axios.create();


  constructor(postServiceUrl: string, loggerInstance?: winston.Logger) {
    this.postServiceUrl = postServiceUrl;
    this.logger = loggerInstance || logger;

    this.axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
        if (!config.headers['X-Correlation-ID']) {
            config.headers['X-Correlation-ID'] = uuidv4();
        }
        return config;
    });
  }

  async getFeedItems(correlationId?: string): Promise<FeedItem[]> {
    const downstreamService = 'PostService';
    const requestUrl = `${this.postServiceUrl}/posts`;
    
    const opCorrelationId = correlationId || uuidv4();

    this.logger.info(`FeedRepository: Attempting to fetch posts from downstream service.`, {
        correlationId: opCorrelationId,
        downstreamService,
        url: requestUrl,
        method: 'GET',
        type: 'ExternalCallLog.Attempt'
    });

    const startTime = Date.now();
    try {
      const postsResponse = await this.axiosInstance.get(requestUrl, {
          headers: { 'X-Correlation-ID': opCorrelationId }
      });
      const latencyMs = Date.now() - startTime;

      this.logger.info(`FeedRepository: Successfully fetched posts from downstream service.`, {
        correlationId: opCorrelationId,
        downstreamService,
        url: requestUrl,
        method: 'GET',
        statusCode: postsResponse.status,
        latencyMs,
        type: 'ExternalCallLog.Success'
      });

      const posts = postsResponse.data;

      const feedItems: FeedItem[] = posts.map((post: any) => ({
        postId: post.post_id,
        userId: post.user_id,
        authorUsername: 'User #1',
        postTitle: post.title,
        postContent: post.content,
        createdAt: new Date(post.created_at),
        updatedAt: new Date(post.updated_at),
      }));

      feedItems.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return feedItems;
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      const errorDetails: any = {
        correlationId: opCorrelationId,
        downstreamService,
        url: requestUrl,
        method: 'GET',
        latencyMs,
        error: error.message,
        type: 'ExternalCallLog.Error'
      };

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        errorDetails.statusCode = axiosError.response?.status;
        errorDetails.requestPath = axiosError.request?.path;
        if (axiosError.code) errorDetails.axiosErrorCode = axiosError.code;
        if (axiosError.code === 'ECONNREFUSED') {
            errorDetails.reason = 'Connection refused by downstream service.';
        } else if (axiosError.code === 'ETIMEDOUT' || axiosError.message.toLowerCase().includes('timeout')) {
            errorDetails.reason = 'Timeout while calling downstream service.';
        }
      }
      
      this.logger.error(`FeedRepository: Error fetching posts from downstream service.`, errorDetails);
      throw new Error(`Failed to fetch feed data from ${downstreamService}: ${error.message}`);
    }
  }
}