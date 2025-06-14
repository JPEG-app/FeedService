import { FeedItem } from '../models/feed.model';
import { PostCreatedEventData, UserLifecycleEvent } from '../models/events.model';
import NodeCache from 'node-cache';
import winston from 'winston';
import { FeedRepository } from '../repositories/feed.repository';

const FEED_CACHE_KEY = 'aggregated-feed-items';
const USER_DETAIL_CACHE_PREFIX = 'user-detail-';

export class FeedService {
  private feedItemsCache: NodeCache;
  private userDetailsCache: NodeCache;
  private logger: winston.Logger;
  private feedRepo: FeedRepository;

  constructor(loggerInstance: winston.Logger, feedRepo: FeedRepository) {
    this.logger = loggerInstance;
    this.feedRepo = feedRepo;
    this.feedItemsCache = new NodeCache({ stdTTL: 0, checkperiod: 0, useClones: false });
    this.userDetailsCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });

    if (!this.feedItemsCache.has(FEED_CACHE_KEY)) {
      this.feedItemsCache.set(FEED_CACHE_KEY, []);
      this.logger.info('FeedService: Initialized empty feedItemsCache.', {
        cacheKey: FEED_CACHE_KEY,
        type: 'CacheLog.Init',
      });
    }
  }

  async getFeed(correlationId?: string, authHeader?: string): Promise<FeedItem[]> {
    const cacheKey = FEED_CACHE_KEY;
    let cachedFeedItems = this.feedItemsCache.get<FeedItem[]>(cacheKey);

    if (!cachedFeedItems || cachedFeedItems.length === 0) {
      this.logger.warn('FeedService: Cache is empty. Loading posts from repository.', {
        correlationId,
        type: 'CacheLog.Miss.Load',
      });

      const posts = await this.feedRepo.getPosts(correlationId, authHeader);
      const uniqueUserIds = Array.from(new Set(posts.map((post) => post.userId)));

      const knownUsernames: Record<string, string> = {};
      const missingUserIds: string[] = [];

      for (const userId of uniqueUserIds) {
        const cached = this.userDetailsCache.get<string>(`${USER_DETAIL_CACHE_PREFIX}${userId}`);
        if (cached) {
          knownUsernames[userId] = cached;
        } else {
          missingUserIds.push(userId);
        }
      }

      if (missingUserIds.length > 0) {
        const allUsers = await this.feedRepo.getUsersByIds(correlationId, authHeader);
        for (const user of allUsers) {
          if (missingUserIds.includes(user.userId)) {
            this.userDetailsCache.set(`${USER_DETAIL_CACHE_PREFIX}${user.userId}`, user.username);
            knownUsernames[user.userId] = user.username;
          }
        }
      }

      cachedFeedItems = posts.map((post) => ({
        postId: post.postId,
        userId: post.userId,
        authorUsername: knownUsernames[post.userId] || 'Unknown User',
        postTitle: post.title,
        postContent: post.content,
        createdAt: new Date(post.createdAt),
        updatedAt: new Date(post.updatedAt),
        likeCount: post.likeCount || 0,
        hasUserLiked: post.hasUserLiked,
      }));

      this.feedItemsCache.set(cacheKey, cachedFeedItems);

      this.logger.info('FeedService: Fetched and cached posts + usernames.', {
        correlationId,
        count: cachedFeedItems.length,
        type: 'RepoLoad.FeedInit',
      });
    } else {
      this.logger.info('FeedService: Cache hit for feed items.', {
        correlationId,
        cacheKey,
        action: 'hit',
        count: cachedFeedItems.length,
        type: 'CacheLog.GetFeed',
      });
    }

    return cachedFeedItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async processNewPostEvent(postEvent: PostCreatedEventData, correlationId?: string, authHeader?: string): Promise<void> {
    this.logger.info('FeedService: Processing PostCreatedEvent', {
      correlationId,
      postId: postEvent.postId,
      userId: postEvent.userId,
      type: 'EventProcessingLog.PostCreated',
    });

    const userCacheKey = `${USER_DETAIL_CACHE_PREFIX}${postEvent.userId}`;
    let username = this.userDetailsCache.get<string>(userCacheKey);

    if (!username) {
      const users = await this.feedRepo.getUsersByIds(correlationId, authHeader);
      const user = users.find((u) => u.userId === postEvent.userId);
      username = user?.username || 'Unknown User';

      if (username !== 'Unknown User') {
        this.userDetailsCache.set(userCacheKey, username);
        this.logger.info('FeedService: Username cached after lookup.', {
          correlationId,
          userId: postEvent.userId,
          username,
        });
      } else {
        this.logger.warn('FeedService: Could not resolve username for userId.', {
          correlationId,
          userId: postEvent.userId,
        });
      }
    }

    const newFeedItem: FeedItem = {
      postId: postEvent.postId,
      userId: postEvent.userId,
      authorUsername: username,
      postTitle: postEvent.title,
      postContent: postEvent.content,
      createdAt: new Date(postEvent.createdAt),
      updatedAt: new Date(postEvent.updatedAt),
      likeCount: 0,
      hasUserLiked: false, // Default value — not known from event
    };

    const currentFeedItems = this.feedItemsCache.get<FeedItem[]>(FEED_CACHE_KEY) || [];
    const updatedItems = [newFeedItem, ...currentFeedItems.filter((item) => item.postId !== newFeedItem.postId)];
    this.feedItemsCache.set(FEED_CACHE_KEY, updatedItems);

    this.logger.info('FeedService: Added/Updated post in feed cache.', {
      correlationId,
      postId: newFeedItem.postId,
      newSize: updatedItems.length,
    });
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
      this.logger.info('FeedService: Cached username for user.', {
        correlationId,
        userId: userEvent.userId,
        username: userEvent.username,
      });
    } else if (userEvent.eventType === 'UserDeleted') {
      const deleted = this.userDetailsCache.del(userCacheKey);
      if (deleted) {
        this.logger.info('FeedService: Removed username from cache.', { correlationId, userId: userEvent.userId });
      } else {
        this.logger.info('FeedService: Tried to delete username from cache but key was not found.', {
          correlationId,
          userId: userEvent.userId,
        });
      }
    }
  }

  clearAllCaches(correlationId?: string): void {
    this.feedItemsCache.flushAll();
    this.userDetailsCache.flushAll();
    this.feedItemsCache.set(FEED_CACHE_KEY, []);
    this.logger.info('FeedService: All caches cleared.', { correlationId });
  }
}
