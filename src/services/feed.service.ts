import { FeedItem } from '../models/feed.model';
import { PostCreatedEventData, PostLikedEventData, PostUnlikedEventData, UserLifecycleEvent } from '../models/feed.model';
import NodeCache from 'node-cache';
import winston from 'winston';

const FEED_CACHE_KEY = 'aggregated-feed-items';
const USER_DETAIL_CACHE_PREFIX = 'user-detail-';
const USER_LIKES_CACHE_PREFIX = 'user-likes-';

export class FeedService {
  private feedItemsCache: NodeCache;
  private userDetailsCache: NodeCache;
  private userLikesCache: NodeCache;
  private logger: winston.Logger;

  constructor(loggerInstance: winston.Logger) {
    this.logger = loggerInstance;
    this.feedItemsCache = new NodeCache({ stdTTL: 0, checkperiod: 0, useClones: false });
    this.userDetailsCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });
    this.userLikesCache = new NodeCache({ stdTTL: 0, checkperiod: 0, useClones: false });

    if (!this.feedItemsCache.has(FEED_CACHE_KEY)) {
        this.feedItemsCache.set(FEED_CACHE_KEY, []);
        this.logger.info('FeedService: Initialized empty feedItemsCache.', { cacheKey: FEED_CACHE_KEY, type: 'CacheLog.Init' });
    }
  }

  async getFeed(correlationId?: string, requestingAuthUserId?: string): Promise<FeedItem[]> {
    const cachedFeedItems = this.feedItemsCache.get<FeedItem[]>(FEED_CACHE_KEY) || [];
    
    this.logger.info(`FeedService: Cache hit for feed items.`, { correlationId, cacheKey: FEED_CACHE_KEY, count: cachedFeedItems.length, type: 'CacheLog.GetFeed' });

    let userLikedPostIds: Set<string> = new Set();
    if (requestingAuthUserId) {
      const userLikesCacheKey = `${USER_LIKES_CACHE_PREFIX}${requestingAuthUserId}`;
      userLikedPostIds = this.userLikesCache.get<Set<string>>(userLikesCacheKey) || new Set();
    }

    const feedItemsWithLikeStatus = cachedFeedItems.map(item => ({
      ...item,
      hasUserLiked: userLikedPostIds.has(item.postId),
    }));
    
    const feedItemsToReturn = feedItemsWithLikeStatus.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    this.logger.debug(`FeedService: Returning ${feedItemsToReturn.length} feed items.`, { correlationId, count: feedItemsToReturn.length, type: 'ServiceLog.GetFeed' });
    return feedItemsToReturn;
  }

  public async processNewPostEvent(postEvent: PostCreatedEventData, correlationId?: string): Promise<void> {
    this.logger.info(`FeedService: Processing PostCreatedEvent`, { correlationId, postId: postEvent.postId, userId: postEvent.userId, type: 'EventProcessingLog.PostCreated' });
    
    const userCacheKey = `${USER_DETAIL_CACHE_PREFIX}${postEvent.userId}`;
    const username = this.userDetailsCache.get<string>(userCacheKey) || 'Unknown User';
    
    const newFeedItem: FeedItem = {
      postId: postEvent.postId,
      userId: postEvent.userId,
      authorUsername: username,
      postTitle: postEvent.title,
      postContent: postEvent.content,
      createdAt: new Date(postEvent.createdAt),
      updatedAt: new Date(postEvent.updatedAt),
      likeCount: postEvent.likeCount || 0,
    };

    let currentFeedItems = this.feedItemsCache.get<FeedItem[]>(FEED_CACHE_KEY) || [];
    currentFeedItems = currentFeedItems.filter(item => item.postId !== newFeedItem.postId);
    currentFeedItems.unshift(newFeedItem);

    this.feedItemsCache.set(FEED_CACHE_KEY, currentFeedItems);
    this.logger.info(`FeedService: Added/Updated post in feed cache.`, { correlationId, postId: newFeedItem.postId, newSize: currentFeedItems.length, type: 'CacheLog.FeedUpdate' });
  }

  public async processPostLikedEvent(likeEvent: PostLikedEventData, correlationId?: string): Promise<void> {
    this.logger.info(`FeedService: Processing PostLikedEvent`, { correlationId, postId: likeEvent.postId, userId: likeEvent.userId, type: 'EventProcessingLog.PostLiked' });
    const currentFeedItems = this.feedItemsCache.get<FeedItem[]>(FEED_CACHE_KEY) || [];
    const postIndex = currentFeedItems.findIndex(item => item.postId === likeEvent.postId);

    if (postIndex > -1) {
      currentFeedItems[postIndex].likeCount++;
      this.feedItemsCache.set(FEED_CACHE_KEY, currentFeedItems);
      this.logger.info(`FeedService: Incremented like count for post in feed cache.`, { correlationId, postId: likeEvent.postId, newLikeCount: currentFeedItems[postIndex].likeCount });
    }

    const userLikesCacheKey = `${USER_LIKES_CACHE_PREFIX}${likeEvent.userId}`;
    const userLikes = this.userLikesCache.get<Set<string>>(userLikesCacheKey) || new Set();
    userLikes.add(likeEvent.postId);
    this.userLikesCache.set(userLikesCacheKey, userLikes);
    this.logger.info(`FeedService: Added post to user's like set.`, { correlationId, userId: likeEvent.userId, postId: likeEvent.postId });
  }

  public async processPostUnlikedEvent(unlikeEvent: PostUnlikedEventData, correlationId?: string): Promise<void> {
    this.logger.info(`FeedService: Processing PostUnlikedEvent`, { correlationId, postId: unlikeEvent.postId, userId: unlikeEvent.userId, type: 'EventProcessingLog.PostUnliked' });
    const currentFeedItems = this.feedItemsCache.get<FeedItem[]>(FEED_CACHE_KEY) || [];
    const postIndex = currentFeedItems.findIndex(item => item.postId === unlikeEvent.postId);

    if (postIndex > -1 && currentFeedItems[postIndex].likeCount > 0) {
      currentFeedItems[postIndex].likeCount--;
      this.feedItemsCache.set(FEED_CACHE_KEY, currentFeedItems);
      this.logger.info(`FeedService: Decremented like count for post in feed cache.`, { correlationId, postId: unlikeEvent.postId, newLikeCount: currentFeedItems[postIndex].likeCount });
    }

    const userLikesCacheKey = `${USER_LIKES_CACHE_PREFIX}${unlikeEvent.userId}`;
    const userLikes = this.userLikesCache.get<Set<string>>(userLikesCacheKey);
    if (userLikes) {
      userLikes.delete(unlikeEvent.postId);
      this.userLikesCache.set(userLikesCacheKey, userLikes);
      this.logger.info(`FeedService: Removed post from user's like set.`, { correlationId, userId: unlikeEvent.userId, postId: unlikeEvent.postId });
    }
  }

  public async processUserLifecycleEvent(userEvent: UserLifecycleEvent, correlationId?: string): Promise<void> {
    this.logger.info(`FeedService: Processing UserLifecycleEvent`, { correlationId, eventType: userEvent.eventType, userId: userEvent.userId, type: `EventProcessingLog.${userEvent.eventType}` });
    const userCacheKey = `${USER_DETAIL_CACHE_PREFIX}${userEvent.userId}`;

    if ((userEvent.eventType === 'UserCreated' || userEvent.eventType === 'UserUpdated') && userEvent.username) {
      this.userDetailsCache.set(userCacheKey, userEvent.username);
      this.logger.info(`FeedService: Cached username for user.`, { correlationId, userId: userEvent.userId, username: userEvent.username, type: 'CacheLog.UserDetailsUpdate' });
    } else if (userEvent.eventType === 'UserDeleted') {
      this.userDetailsCache.del(userCacheKey);
      this.userLikesCache.del(`${USER_LIKES_CACHE_PREFIX}${userEvent.userId}`);
      this.logger.info(`FeedService: Removed user details and likes from cache for deleted user.`, { correlationId, userId: userEvent.userId, type: 'CacheLog.UserDetailsDelete' });
    }
  }

  public clearAllCaches(correlationId?: string): void {
    this.feedItemsCache.flushAll();
    this.userDetailsCache.flushAll();
    this.userLikesCache.flushAll();
    this.feedItemsCache.set(FEED_CACHE_KEY, []);
    this.logger.info('FeedService: All internal caches cleared.', { correlationId, type: 'CacheLog.FlushAll' });
  }
}