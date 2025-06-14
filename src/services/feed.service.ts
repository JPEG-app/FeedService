import { FeedItem } from '../models/feed.model';
import { UserLifecycleEvent } from '../models/feed.model';
import NodeCache from 'node-cache';
import winston from 'winston';
import axios from 'axios';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service-service:3001';
const POST_SERVICE_URL = process.env.POST_SERVICE_URL || 'http://post-service-service:3002';
const USER_DETAIL_CACHE_PREFIX = 'user-detail-';

export class FeedService {
  private userDetailsCache: NodeCache;
  private logger: winston.Logger;

  constructor(loggerInstance: winston.Logger) {
    this.logger = loggerInstance;
    this.userDetailsCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });
  }

  async getFeed(correlationId?: string, authorizationHeader?: string): Promise<FeedItem[]> {
    this.logger.info(`FeedService: Fetching posts from PostService`, { 
        correlationId, 
        isAuthenticated: !!authorizationHeader 
    });

    const headers: Record<string, string> = {};
    if (correlationId) headers['X-Correlation-ID'] = correlationId;
    if (authorizationHeader) headers['Authorization'] = authorizationHeader;
    
    const postsResponse = await axios.get(`${POST_SERVICE_URL}/posts`, { headers });
    const posts: any[] = postsResponse.data;

    if (posts.length === 0) {
      return [];
    }

    const userIds = [...new Set(posts.map(post => post.userId))];
    const usernames = new Map<string, string>();
    const idsToFetch: string[] = [];

    userIds.forEach(id => {
        const cachedUsername = this.userDetailsCache.get<string>(`${USER_DETAIL_CACHE_PREFIX}${id}`);
        if (cachedUsername) {
            usernames.set(id, cachedUsername);
        } else {
            idsToFetch.push(id);
        }
    });

    if (idsToFetch.length > 0) {
        this.logger.info(`FeedService: Cache miss for ${idsToFetch.length} users. Fetching in bulk.`, { correlationId });
        try {
            const bulkResponse = await axios.post(`${USER_SERVICE_URL}/users`, { userIds: idsToFetch }, { headers: { 'X-Correlation-ID': correlationId } });
            const usersFromBulk: { userId: string, username: string }[] = bulkResponse.data;
            
            usersFromBulk.forEach(user => {
                usernames.set(user.userId, user.username);
                this.userDetailsCache.set(`${USER_DETAIL_CACHE_PREFIX}${user.userId}`, user.username);
            });
        } catch (error) {
            this.logger.error('FeedService: Failed to fetch user details in bulk', { correlationId, error: (error as any).message });
        }
    }

    const feedItems: FeedItem[] = posts.map(post => {
      const authorUsername = usernames.get(post.userId) || 'Unknown User';
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