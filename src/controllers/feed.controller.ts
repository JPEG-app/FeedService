import { Request, Response } from 'express';
import { FeedService } from '../services/feed.service';

export class FeedController {
  private feedService: FeedService;

  constructor(feedService: FeedService) {
    this.feedService = feedService;
  }

  async getFeed(req: Request, res: Response) {
    try {
      const feed = await this.feedService.getFeed();
      res.json(feed);
    } catch (error: any) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}