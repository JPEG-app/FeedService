import request, { SuperTest, Test as SuperTestTest } from 'supertest';
import { App } from '../../app';
import express from 'express';
import * as dotenv from 'dotenv';
import { FeedService } from '../../services/feed.service';
import { PostCreatedEventData, UserLifecycleEvent } from '../../models/events.model'; 
import TestAgent from 'supertest/lib/agent';

const mockFeedConsumerStartFn = jest.fn().mockResolvedValue(undefined);
const mockFeedConsumerStopFn = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '../../kafka/consumer', 
  () => ({
    __esModule: true,
    initializeFeedServiceForConsumer: jest.fn(),
    startFeedConsumers: mockFeedConsumerStartFn,
    stopFeedConsumers: mockFeedConsumerStopFn,
  })
);

dotenv.config({ path: '.env' });

let appInstance: App;
let expressApp: express.Application;
let agent: TestAgent;
let feedService: FeedService;

interface FeedItemApiResponse {
  postId: string;
  userId: string;
  authorUsername: string;
  postTitle: string;
  postContent: string;
  createdAt: string; 
  updatedAt: string; 
}

beforeAll(async () => {
  appInstance = new App(); 
  expressApp = appInstance.app;
  agent = request(expressApp);
  feedService = appInstance.feedService; 
});

beforeEach(() => {
  feedService.clearAllCaches();

  mockFeedConsumerStartFn.mockClear();
  mockFeedConsumerStopFn.mockClear();
  (require('../kafka/consumer').initializeFeedServiceForConsumer as jest.Mock).mockClear();
});

describe('Feed Service Logic & Endpoints', () => {
  const user1: UserLifecycleEvent = {
    eventType: 'UserCreated',
    userId: 'user1',
    username: 'Alice',
    timestamp: new Date().toISOString(),
  };
  const user2: UserLifecycleEvent = {
    eventType: 'UserCreated',
    userId: 'user2',
    username: 'Bob',
    timestamp: new Date().toISOString(),
  };

  const post1ByUser1: PostCreatedEventData = {
    postId: 'post1',
    userId: 'user1',
    title: 'Alice Post 1',
    content: 'Content by Alice',
    createdAt: new Date(Date.now() - 20000).toISOString(), 
    updatedAt: new Date(Date.now() - 20000).toISOString(),
    eventType: 'PostCreated',
    eventTimestamp: new Date().toISOString(),
  };
  const post2ByUser2: PostCreatedEventData = {
    postId: 'post2',
    userId: 'user2',
    title: 'Bob Post 1',
    content: 'Content by Bob',
    createdAt: new Date(Date.now() - 10000).toISOString(), 
    updatedAt: new Date(Date.now() - 10000).toISOString(),
    eventType: 'PostCreated',
    eventTimestamp: new Date().toISOString(),
  };
   const post3ByUser1: PostCreatedEventData = {
    postId: 'post3',
    userId: 'user1',
    title: 'Alice Post 2 (Newest)',
    content: 'Newer Content by Alice',
    createdAt: new Date().toISOString(), 
    updatedAt: new Date().toISOString(),
    eventType: 'PostCreated',
    eventTimestamp: new Date().toISOString(),
  };

  it('should process UserCreated events and cache usernames', async () => {
    await feedService.processUserLifecycleEvent(user1);
    await feedService.processUserLifecycleEvent(user2);
  });

  it('should process PostCreated events and build a feed, then serve it via GET /feed', async () => {
    await feedService.processUserLifecycleEvent(user1);
    await feedService.processUserLifecycleEvent(user2);

    await feedService.processNewPostEvent(post1ByUser1);
    await feedService.processNewPostEvent(post2ByUser2);
    await feedService.processNewPostEvent(post3ByUser1);

    const response = await agent.get('/feed');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    const feedItems = response.body as FeedItemApiResponse[];

    expect(feedItems.length).toBe(3);

    expect(feedItems[0].postId).toBe(post3ByUser1.postId);
    expect(feedItems[0].authorUsername).toBe(user1.username);
    expect(feedItems[0].postTitle).toBe(post3ByUser1.title);

    expect(feedItems[1].postId).toBe(post2ByUser2.postId);
    expect(feedItems[1].authorUsername).toBe(user2.username);

    expect(feedItems[2].postId).toBe(post1ByUser1.postId);
    expect(feedItems[2].authorUsername).toBe(user1.username);
  });

  it('GET /feed should return an empty array if no posts have been processed', async () => {
    const response = await agent.get('/feed');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(0);
  });
  
  it('should handle user updates affecting usernames for new posts', async () => {
    await feedService.processUserLifecycleEvent(user1); 
    await feedService.processNewPostEvent(post1ByUser1); 

    const updatedUser1: UserLifecycleEvent = {
      ...user1,
      eventType: 'UserUpdated',
      username: 'Alicia Keys', 
      timestamp: new Date().toISOString(),
    };
    await feedService.processUserLifecycleEvent(updatedUser1);

    const post4ByUpdatedUser1: PostCreatedEventData = {
      postId: 'post4',
      userId: 'user1',
      title: 'Alicia Post 1',
      content: 'Content by Alicia',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      eventType: 'PostCreated',
      eventTimestamp: new Date().toISOString(),
    };
    await feedService.processNewPostEvent(post4ByUpdatedUser1);

    const response = await agent.get('/feed');
    const feedItems = response.body as FeedItemApiResponse[];
    
    const newPostInFeed = feedItems.find(item => item.postId === 'post4');
    expect(newPostInFeed).toBeDefined();
    expect(newPostInFeed?.authorUsername).toBe('Alicia Keys');

    const oldPostInFeed = feedItems.find(item => item.postId === 'post1');
    expect(oldPostInFeed).toBeDefined();
    expect(oldPostInFeed?.authorUsername).toBe('Alice'); 
  });

  it('should handle UserDeleted events by removing username from cache for future posts', async () => {
    await feedService.processUserLifecycleEvent(user1);
    
    const user1Deleted: UserLifecycleEvent = {
        ...user1,
        eventType: 'UserDeleted',
        timestamp: new Date().toISOString()
    };
    await feedService.processUserLifecycleEvent(user1Deleted);

    const postAfterDelete: PostCreatedEventData = {
      postId: 'post5',
      userId: 'user1',
      title: 'Post after delete',
      content: 'Should have unknown author',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      eventType: 'PostCreated',
      eventTimestamp: new Date().toISOString(),
    };
    await feedService.processNewPostEvent(postAfterDelete);

    const response = await agent.get('/feed');
    const feedItems = response.body as FeedItemApiResponse[];
    const orphanedPost = feedItems.find(item => item.postId === 'post5');
    expect(orphanedPost).toBeDefined();
    expect(orphanedPost?.authorUsername).toBe('Unknown User');
  });
});