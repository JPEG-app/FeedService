import { FeedItem } from '../models/feed.model';
import { PostCreatedEventData, UserLifecycleEvent } from '../models/events.model';
import NodeCache from 'node-cache';
import winston from 'winston';

const FEED_CACHE_KEY = 'aggregated-feed-items';
const USER_DETAIL_CACHE_PREFIX = 'user-detail-';

export class FeedService {
  private feedItemsCache: NodeCache;
  private userDetailsCache: NodeCache;
  private logger: winston.Logger;

  constructor(loggerInstance: winston.Logger) {
    this.logger = loggerInstance;
    this.feedItemsCache = new NodeCache({
      stdTTL: 0,
      checkperiod: 0,
      useClones: false,
    });

    this.userDetailsCache = new NodeCache({
      stdTTL: 0,
      checkperiod: 0,
    });

    if (!this.feedItemsCache.has(FEED_CACHE_KEY)) {
        this.feedItemsCache.set(FEED_CACHE_KEY, []);
        this.logger.info('FeedService: Initialized empty feedItemsCache.', { cacheKey: FEED_CACHE_KEY, type: 'CacheLog.Init' });
    }
  }

  async getFeed(correlationId?: string): Promise<FeedItem[]> {
    const cacheKey = FEED_CACHE_KEY;
    const cachedFeedItems = this.feedItemsCache.get<FeedItem[]>(cacheKey);
    
    if (cachedFeedItems) { 
        this.logger.info(`FeedService: Cache hit for feed items.`, { correlationId, cacheKey, action: 'hit', count: cachedFeedItems.length, type: 'CacheLog.GetFeed' });
    } else {
        this.logger.warn(`FeedService: Cache miss for feed items (should be initialized). Returning empty array.`, { correlationId, cacheKey, action: 'miss', type: 'CacheLog.GetFeed' });
    }
    
    const feedItemsToReturn = (cachedFeedItems || []).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    this.logger.debug(`FeedService: Returning ${feedItemsToReturn.length} feed items.`, { correlationId, count: feedItemsToReturn.length, type: 'ServiceLog.GetFeed' });
    return feedItemsToReturn;
  }

  public async processNewPostEvent(postEvent: PostCreatedEventData, correlationId?: string): Promise<void> {
    this.logger.info(`FeedService: Processing PostCreatedEvent`, { correlationId, postId: postEvent.postId, userId: postEvent.userId, type: 'EventProcessingLog.PostCreated' });
    
    const userCacheKey = `${USER_DETAIL_CACHE_PREFIX}${postEvent.userId}`;
    const username = this.userDetailsCache.get<string>(userCacheKey);

    if (username) {
        this.logger.info(`FeedService: User detail cache hit for username.`, { correlationId, userId: postEvent.userId, cacheKey: userCacheKey, action: 'hit', type: 'CacheLog.UserDetails' });
    } else {
        this.logger.warn(`FeedService: User detail cache miss for username. Post will use 'Unknown User'.`, { correlationId, userId: postEvent.userId, cacheKey: userCacheKey, action: 'miss', type: 'CacheLog.UserDetails' });
    }

    const newFeedItem: FeedItem = {
      postId: postEvent.postId,
      userId: postEvent.userId,
      authorUsername: username || 'Unknown User',
      postTitle: postEvent.title,
      postContent: postEvent.content,
      createdAt: new Date(postEvent.createdAt),
      updatedAt: new Date(postEvent.updatedAt),
    };

    let currentFeedItems = this.feedItemsCache.get<FeedItem[]>(FEED_CACHE_KEY) || [];
    
    currentFeedItems = currentFeedItems.filter(item => item.postId !== newFeedItem.postId);
    currentFeedItems.unshift(newFeedItem);

    this.feedItemsCache.set(FEED_CACHE_KEY, currentFeedItems);
    this.logger.info(`FeedService: Added/Updated post in feed cache.`, {
        correlationId,
        postId: newFeedItem.postId,
        cacheKey: FEED_CACHE_KEY,
        action: 'set',
        newSize: currentFeedItems.length,
        type: 'CacheLog.FeedUpdate'
    });
  }

  public async processUserLifecycleEvent(userEvent: UserLifecycleEvent, correlationId?: string): Promise<void> {
    this.logger.info(`FeedService: Processing UserLifecycleEvent`, { correlationId, eventType: userEvent.eventType, userId: userEvent.userId, type: `EventProcessingLog.${userEvent.eventType}` });
    const userCacheKey = `${USER_DETAIL_CACHE_PREFIX}${userEvent.userId}`;

    if ((userEvent.eventType === 'UserCreated' || userEvent.eventType === 'UserUpdated') && userEvent.username) {
      this.userDetailsCache.set(userCacheKey, userEvent.username);
      this.logger.info(`FeedService: Cached username for user.`, {
          correlationId,
          userId: userEvent.userId,
          username: userEvent.username,
          cacheKey: userCacheKey,
          action: 'set',
          type: 'CacheLog.UserDetailsUpdate'
      });
    } else if (userEvent.eventType === 'UserDeleted') {
      const deleted = this.userDetailsCache.del(userCacheKey);
      if (deleted) {
        this.logger.info(`FeedService: Removed username from cache for deleted user.`, { correlationId, userId: userEvent.userId, cacheKey: userCacheKey, action: 'delete', type: 'CacheLog.UserDetailsDelete' });
      } else {
        this.logger.info(`FeedService: Attempted to remove username for user from cache, but key was not found.`, { correlationId, userId: userEvent.userId, cacheKey: userCacheKey, action: 'delete_miss', type: 'CacheLog.UserDetailsDelete' });
      }
    }
  }

  public clearAllCaches(correlationId?: string): void {
    this.feedItemsCache.flushAll();
    this.userDetailsCache.flushAll();
    this.feedItemsCache.set(FEED_CACHE_KEY, []);
    this.logger.info('FeedService: All internal caches cleared.', { correlationId, type: 'CacheLog.FlushAll' });
  }
}