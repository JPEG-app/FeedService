import { FeedItem, UserLifecycleEvent } from '../models/feed.model';
import { FeedRepository } from '../repositories/feed.repository';
import NodeCache from 'node-cache';
import winston from 'winston';

const USER_DETAIL_CACHE_PREFIX = 'user-detail-';

export class FeedService {
  private userDetailsCache: NodeCache;
  private logger: winston.Logger;
  private feedRepository: FeedRepository;

  constructor(feedRepository: FeedRepository, loggerInstance: winston.Logger) {
    this.feedRepository = feedRepository;
    this.logger = loggerInstance;
    this.userDetailsCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });
  }

  async getFeed(correlationId?: string, authorizationHeader?: string): Promise<FeedItem[]> {
    const posts = await this.feedRepository.getPosts(correlationId, authorizationHeader);

    if (posts.length === 0) {
      return [];
    }

    const userIds = [...new Set(posts.map(post => post.userId))];
    const usernames = new Map<string, string>();
    // const idsToFetch: string[] = [];

    userIds.forEach(id => {
        const cachedUsername = this.userDetailsCache.get<string>(`${USER_DETAIL_CACHE_PREFIX}${id}`);
        if (cachedUsername) {
            usernames.set(id, cachedUsername);
        } 
        // else {
        //     idsToFetch.push(id);
        // }
    });

    // if (idsToFetch.length > 0) {
        // this.logger.info(`FeedService: Cache miss for ${idsToFetch.length} users. Fetching from repository.`, { correlationId });
        const usersFromRepo = await this.feedRepository.getUsersByIds(correlationId, authorizationHeader);
        
        usersFromRepo.forEach(user => {
            usernames.set(user.userId, user.username);
            this.userDetailsCache.set(`${USER_DETAIL_CACHE_PREFIX}${user.userId}`, user.username);
        });
    // }

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