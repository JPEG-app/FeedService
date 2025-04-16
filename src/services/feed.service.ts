import { FeedRepository } from '../repositories/feed.repository';
import { Feed, FeedItem } from '../models/feed.model';
import NodeCache from 'node-cache';

export class FeedService {
  private feedRepository: FeedRepository;
  private feedCache: NodeCache;

  constructor(feedRepository: FeedRepository) {
    this.feedRepository = feedRepository;
    this.feedCache = new NodeCache({ stdTTL: 60 });
  }

  async getFeed(): Promise<Feed> {
    try {
      const cachedFeed = this.feedCache.get<Feed>('all-posts');
      if (cachedFeed) {
        return cachedFeed;
      }

      const feedItems = await this.feedRepository.getFeedItems();
      const feed: Feed = {
        userId: 'all-users',
        items: feedItems,
      };

      this.feedCache.set('all-posts', feed);

      return feed;
    } catch (error: any) {
      console.error('Error getting feed:', error);
      throw new Error('Error retrieving feed: ' + error.message);
    }
  }
}