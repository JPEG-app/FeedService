import { FeedItem, UserLifecycleEvent } from '../models/feed.model';
import { FeedRepository } from '../repositories/feed.repository';
import NodeCache from 'node-cache';
import winston from 'winston';

const FEED_CACHE_KEY = 'aggregated-feed-items';
const USER_DETAIL_CACHE_PREFIX = 'user-detail-';

export class FeedService {
  private feedItemsCache: NodeCache;
  private userDetailsCache: NodeCache;
  private logger: winston.Logger;
  private feedRepository: FeedRepository;

  constructor(feedRepository: FeedRepository, loggerInstance: winston.Logger) {
    this.feedRepository = feedRepository;
    this.logger = loggerInstance;
    
    this.feedItemsCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });
    this.userDetailsCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });

    if (!this.feedItemsCache.has(FEED_CACHE_KEY)) {
        this.feedItemsCache.set(FEED_CACHE_KEY, []);
    }
  }

  async getFeed(correlationId?: string, authorizationHeader?: string): Promise<FeedItem[]> {
    let feedItems = this.feedItemsCache.get<FeedItem[]>(FEED_CACHE_KEY);

    if (feedItems && feedItems.length > 0) {
      this.logger.info(`FeedService: Returning ${feedItems.length} items from cache.`, { correlationId });
      return feedItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    
    this.logger.info(`FeedService: Cache is empty. Bootstrapping feed from repository.`, { correlationId });

    const posts = await this.feedRepository.getPosts(correlationId, authorizationHeader);
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
        const usersFromRepo = await this.feedRepository.getUsersByIds(correlationId, authorizationHeader);
        usersFromRepo.forEach(user => {
            usernames.set(user.userId, user.username);
            this.userDetailsCache.set(`${USER_DETAIL_CACHE_PREFIX}${user.userId}`, user.username);
        });
    }

    const bootstrappedFeed: FeedItem[] = posts.map(post => {
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

    this.feedItemsCache.set(FEED_CACHE_KEY, bootstrappedFeed);
    this.logger.info(`FeedService: Bootstrapped and cached ${bootstrappedFeed.length} feed items.`, { correlationId });
    
    return bootstrappedFeed.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
    this.feedItemsCache.flushAll();
    this.userDetailsCache.flushAll();
    this.feedItemsCache.set(FEED_CACHE_KEY, []);
    this.logger.info('FeedService: All internal caches cleared.', { correlationId });
  }
}