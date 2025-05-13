// feed-service/src/controllers/feed.controller.ts
import { Request, Response } from 'express';
import { FeedService } from '../services/feed.service';

export class FeedController {
  private feedService: FeedService;

  constructor(feedService: FeedService) {
    this.feedService = feedService;
  }

  async getFeed(req: Request, res: Response) {
    try {
      const feedItems = await this.feedService.getFeed();
      res.json(feedItems); // Returns an array of FeedItem
    } catch (error: any) {
      console.error('Error in FeedController getFeed:', error);
      res.status(500).json({ message: 'Internal server error retrieving feed' });
    }
  }
}