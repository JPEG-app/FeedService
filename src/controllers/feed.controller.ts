import { Request as ExpressRequest, Response } from 'express';
import { FeedService } from '../services/feed.service';
import logger, { RequestWithId } from '../utils/logger';

export class FeedController {
  private feedService: FeedService;

  constructor(feedService: FeedService) {
    this.feedService = feedService;
  }

  async getFeed(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const authorizationHeader = req.headers.authorization; 

    try {
      logger.info('FeedController: getFeed initiated', { correlationId, type: 'ControllerLog.getFeed' });
      const feedItems = await this.feedService.getFeed(correlationId, authorizationHeader);
      logger.info(`FeedController: getFeed successful, returning ${feedItems.length} items`, { correlationId, count: feedItems.length, type: 'ControllerLog.getFeed' });
      res.json(feedItems);
    } catch (error: any) {
      logger.error('Error in FeedController getFeed', {
        correlationId,
        error: error.message,
        stack: error.stack,
        type: 'ControllerErrorLog.getFeed'
      });
      res.status(500).json({ message: 'Internal server error retrieving feed', correlationId });
    }
  }
}