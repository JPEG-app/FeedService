import { FeedItem } from '../models/feed.model';
import { PostCreatedEventData, UserLifecycleEvent } from '../models/events.model';
import NodeCache from 'node-cache';
import winston from 'winston';
import { FeedRepository } from '../repositories/feed.repository';

const USER_DETAIL_CACHE_PREFIX = 'user-detail-';

export class FeedService {
  private feedItemsCache: NodeCache;
  private userDetailsCache: NodeCache;
  private logger: winston.Logger;
  private feedRepo: FeedRepository;

  constructor(loggerInstance: winston.Logger, feedRepo: FeedRepository) {
    this.logger = loggerInstance;
    this.feedRepo = feedRepo;
    this.feedItemsCache = new NodeCache({ stdTTL: 300, checkperiod: 60, useClones: false });
    this.userDetailsCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
  }

  private getFeedCacheKey(userId?: string): string {
    return userId ? `feed-for-user-${userId}` : 'anonymous-feed';
  }

  async getFeed(correlationId?: string, authHeader?: string, userId?: string): Promise<FeedItem[]> {
    const cacheKey = this.getFeedCacheKey(userId); 
    let cachedFeedItems = this.feedItemsCache.get<FeedItem[]>(cacheKey);

    if (!cachedFeedItems) {
      this.logger.info('FeedService: Cache miss. Loading from repository.', {
        correlationId,
        cacheKey,
        type: 'CacheLog.Miss.Load',
      });
      
      const posts = await this.feedRepo.getPosts(correlationId, authHeader);
      const users = await this.feedRepo.getUsersByIds(correlationId, authHeader);
      const userMap = new Map(users.map(user => [user.id, user.username]));

      cachedFeedItems = posts.map((post) => ({
        postId: post.postId,
        userId: post.userId,
        authorUsername: userMap.get(post.userId) || 'Unknown User',
        title: post.title,
        content: post.content,
        createdAt: new Date(post.createdAt),
        updatedAt: new Date(post.updatedAt),
        likeCount: post.likeCount || 0,
        hasUserLiked: post.hasUserLiked,
      }));

      this.feedItemsCache.set(cacheKey, cachedFeedItems);

      this.logger.info('FeedService: Fetched and cached feed.', {
        correlationId,
        cacheKey,
        count: cachedFeedItems.length,
        type: 'RepoLoad.FeedInit',
      });
    } else {
      this.logger.info('FeedService: Cache hit for feed items.', {
        correlationId,
        cacheKey,
        count: cachedFeedItems.length,
        type: 'CacheLog.GetFeed',
      });
    }

    return cachedFeedItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  private clearAllFeedCaches(correlationId?: string): void {
    const keys = this.feedItemsCache.keys();
    const feedKeys = keys.filter(k => k.startsWith('feed-for-user-') || k === 'anonymous-feed');
    if (feedKeys.length > 0) {
      this.feedItemsCache.del(feedKeys);
      this.logger.info('FeedService: Cleared all feed caches due to content update.', { correlationId, clearedKeys: feedKeys.length });
    }
  }

  async processNewPostEvent(postEvent: PostCreatedEventData, correlationId?: string, authHeader?: string): Promise<void> {
    this.logger.info('FeedService: Processing PostCreatedEvent, clearing caches.', {
      correlationId,
      postId: postEvent.postId,
    });
    this.clearAllFeedCaches(correlationId);
  }

  async processUserLifecycleEvent(userEvent: UserLifecycleEvent, correlationId?: string): Promise<void> {
    const userCacheKey = `${USER_DETAIL_CACHE_PREFIX}${userEvent.userId}`;
    this.logger.info('FeedService: Processing UserLifecycleEvent', {
      correlationId,
      eventType: userEvent.eventType,
      userId: userEvent.userId,
    });

    if ((userEvent.eventType === 'UserCreated' || userEvent.eventType === 'UserUpdated') && userEvent.username) {
      this.userDetailsCache.set(userCacheKey, userEvent.username);
    } else if (userEvent.eventType === 'UserDeleted') {
      this.userDetailsCache.del(userCacheKey);
    }
  }

  clearAllCaches(correlationId?: string): void {
    this.feedItemsCache.flushAll();
    this.userDetailsCache.flushAll();
    this.logger.info('FeedService: All caches (feed & user) cleared.', { correlationId });
  }
}