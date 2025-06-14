import { FeedItem } from '../models/feed.model';
import { UserLifecycleEvent } from '../models/feed.model';
import NodeCache from 'node-cache';
import winston from 'winston';
import axios from 'axios';

const POST_SERVICE_URL = process.env.POST_SERVICE_URL || 'http://post-service-service:3002';
const USER_DETAIL_CACHE_PREFIX = 'user-detail-';

export class FeedService {
  private userDetailsCache: NodeCache;
  private logger: winston.Logger;

  constructor(loggerInstance: winston.Logger) {
    this.logger = loggerInstance;
    this.userDetailsCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });
  }

  async getFeed(correlationId?: string, requestingAuthUserId?: string): Promise<FeedItem[]> {
    this.logger.info(`FeedService: Fetching posts directly from PostService`, { correlationId, authUserId: requestingAuthUserId });

    try {
      const headers: Record<string, string> = { 'X-Correlation-ID': correlationId || '' };
      if (requestingAuthUserId) {
        headers['X-User-ID'] = requestingAuthUserId;
      }

      const response = await axios.get(`${POST_SERVICE_URL}/posts`, { headers });
      const posts: any[] = response.data;

      const feedItems: FeedItem[] = posts.map(post => {
        const userCacheKey = `${USER_DETAIL_CACHE_PREFIX}${post.userId}`;
        const authorUsername = this.userDetailsCache.get<string>(userCacheKey) || 'Unknown User';

        return {
          postId: post.postId,
          userId: post.userId,
          authorUsername: authorUsername,
          postTitle: post.title,
          postContent: post.content,
          createdAt: new Date(post.createdAt),
          updatedAt: new Date(post.updatedAt),
          likeCount: post.likeCount,
          hasUserLiked: post.hasUserLiked,
        };
      });

      this.logger.info(`FeedService: Successfully fetched and processed ${feedItems.length} posts.`, { correlationId });
      return feedItems;

    } catch (error: any) {
      this.logger.error(`FeedService: Error calling PostService`, {
        correlationId,
        error: error.message,
        stack: error.stack,
        url: `${POST_SERVICE_URL}/posts`,
      });
      throw new Error('Failed to retrieve feed from upstream service.');
    }
  }

  public async processUserLifecycleEvent(userEvent: UserLifecycleEvent, correlationId?: string): Promise<void> {
    const userCacheKey = `${USER_DETAIL_CACHE_PREFIX}${userEvent.userId}`;
    if ((userEvent.eventType === 'UserCreated' || userEvent.eventType === 'UserUpdated') && userEvent.username) {
      this.userDetailsCache.set(userCacheKey, userEvent.username);
    } else if (userEvent.eventType === 'UserDeleted') {
      this.userDetailsCache.del(userCacheKey);
    }
  }
  
  public clearAllCaches(correlationId?: string): void {
    this.userDetailsCache.flushAll();
    this.logger.info('FeedService: User details cache cleared.', { correlationId });
  }
}