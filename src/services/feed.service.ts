// feed-service/src/services/feed.service.ts
import { FeedItem } from '../models/feed.model';
import { PostCreatedEventData, UserLifecycleEvent } from '../models/events.model';
import NodeCache from 'node-cache';

const FEED_CACHE_KEY = 'aggregated-feed-items';
const USER_DETAIL_CACHE_PREFIX = 'user-detail-'; // For storing username or other details

export class FeedService {
  private feedItemsCache: NodeCache;
  private userDetailsCache: NodeCache;

  constructor() {
    this.feedItemsCache = new NodeCache({
      stdTTL: 0, // Infinite TTL for feed items, managed by events
      checkperiod: 0,
      useClones: false, // Important for performance with arrays/objects
    });

    this.userDetailsCache = new NodeCache({
      stdTTL: 0, // Infinite TTL for user details, managed by events
      checkperiod: 0,
    });

    // Initialize feedItemsCache with an empty array if not present
    if (!this.feedItemsCache.has(FEED_CACHE_KEY)) {
        this.feedItemsCache.set(FEED_CACHE_KEY, []);
    }
  }

  async getFeed(): Promise<FeedItem[]> {
    const feedItems = this.feedItemsCache.get<FeedItem[]>(FEED_CACHE_KEY);
    // Sort by createdAt descending before returning, if not already sorted during insertion
    return (feedItems || []).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async processNewPostEvent(postEvent: PostCreatedEventData): Promise<void> {
    console.log(`FeedService: Processing PostCreatedEvent for postId: ${postEvent.postId}`);
    const username = this.userDetailsCache.get<string>(`${USER_DETAIL_CACHE_PREFIX}${postEvent.userId}`);

    const newFeedItem: FeedItem = {
      postId: postEvent.postId,
      userId: postEvent.userId,
      authorUsername: username || 'Unknown User', // Fallback if username not found
      postTitle: postEvent.title,
      postContent: postEvent.content,
      createdAt: new Date(postEvent.createdAt),
      updatedAt: new Date(postEvent.updatedAt),
    };

    let currentFeedItems = this.feedItemsCache.get<FeedItem[]>(FEED_CACHE_KEY) || [];
    
    // Remove existing item with the same postId to handle updates or re-processing
    currentFeedItems = currentFeedItems.filter(item => item.postId !== newFeedItem.postId);
    // Add new item to the beginning (or sort later)
    currentFeedItems.unshift(newFeedItem);

    // Optional: Limit cache size if necessary
    // const MAX_FEED_ITEMS = 1000;
    // if (currentFeedItems.length > MAX_FEED_ITEMS) {
    //   currentFeedItems = currentFeedItems.slice(0, MAX_FEED_ITEMS);
    // }

    this.feedItemsCache.set(FEED_CACHE_KEY, currentFeedItems);
    console.log(`FeedService: Added/Updated post ${newFeedItem.postId} to feed cache. New cache size: ${currentFeedItems.length}`);
  }

  public async processUserLifecycleEvent(userEvent: UserLifecycleEvent): Promise<void> {
    console.log(`FeedService: Processing ${userEvent.eventType} for userId: ${userEvent.userId}`);
    const userCacheKey = `${USER_DETAIL_CACHE_PREFIX}${userEvent.userId}`;

    if ((userEvent.eventType === 'UserCreated' || userEvent.eventType === 'UserUpdated') && userEvent.username) {
      this.userDetailsCache.set(userCacheKey, userEvent.username);
      console.log(`FeedService: Cached username '${userEvent.username}' for userId ${userEvent.userId}`);
      // Note: This doesn't automatically update existing feed items with the new username.
      // That would require iterating the feed cache, which can be complex.
      // New posts by this user will pick up the new username.
    } else if (userEvent.eventType === 'UserDeleted') {
      this.userDetailsCache.del(userCacheKey);
      console.log(`FeedService: Removed username for userId ${userEvent.userId} from cache.`);
      // Existing feed items from this user will retain the "last known" username.
    }
  }

  // For testing or administrative purposes
  public clearAllCaches(): void {
    this.feedItemsCache.flushAll();
    this.userDetailsCache.flushAll();
    this.feedItemsCache.set(FEED_CACHE_KEY, []); // Re-initialize with empty array
    console.log('FeedService: All internal caches cleared.');
  }
}