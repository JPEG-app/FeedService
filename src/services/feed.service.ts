import { FeedItem } from '../models/feed.model';
import { FeedRepository } from '../repositories/feed.repository';
import winston from 'winston';

export class FeedService {
  private logger: winston.Logger;
  private feedRepository: FeedRepository;

  constructor(feedRepository: FeedRepository, loggerInstance: winston.Logger) {
    this.feedRepository = feedRepository;
    this.logger = loggerInstance;
  }

  async getFeed(correlationId?: string, authorizationHeader?: string): Promise<FeedItem[]> {
    this.logger.info(`FeedService: Fetching fresh feed from repository.`, { correlationId });

    const posts = await this.feedRepository.getPosts(correlationId, authorizationHeader);
    if (posts.length === 0) {
      return [];
    }

    // const userIds = [...new Set(posts.map(post => post.userId))];
    const usersFromRepo = await this.feedRepository.getUsersByIds(correlationId, authorizationHeader);

    const usernames = new Map(usersFromRepo.map(user => [user.userId, user.username]));

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
    
    return feedItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}