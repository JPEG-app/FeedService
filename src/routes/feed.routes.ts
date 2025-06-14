import express, { Request as ExpressRequest, Response, NextFunction } from 'express';
import { FeedController } from '../controllers/feed.controller';
import { FeedService } from '../services/feed.service';
import logger, { RequestWithId } from '../utils/logger';

const router = express.Router();

const identifyUserMiddleware = (req: ExpressRequest, res: Response, next: NextFunction) => {
    const typedReq = req as RequestWithId;
    const userId = req.headers['x-user-id'] as string;
    if (userId) {
        typedReq.authUserId = userId;
    }
    next();
};

export const setupFeedRoutes = (feedServiceInstance: FeedService) => {
  const feedController = new FeedController(feedServiceInstance);
  
  router.get('/feed', identifyUserMiddleware, feedController.getFeed.bind(feedController));

  router.post('/feed/admin/clear-cache', (req: ExpressRequest, res: Response) => {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;

    if (feedServiceInstance && typeof feedServiceInstance.clearAllCaches === 'function') {
      try {
        feedServiceInstance.clearAllCaches(correlationId);
        logger.info('Feed caches cleared successfully via admin endpoint.', { correlationId, type: 'AdminActionLog.ClearCacheSuccess' });
        res.status(200).send({ message: 'Feed caches cleared successfully.', correlationId });
      } catch (e: any) {
        logger.error('Error clearing cache via admin endpoint.', { correlationId, error: e.message, stack: e.stack, type: 'AdminActionLog.ClearCacheError' });
        res.status(500).send({ message: 'Error clearing caches.', correlationId });
      }
    } else {
      logger.error('Feed service or clearAllCaches method not available for admin endpoint.', { correlationId, type: 'AdminActionLog.ClearCacheFail' });
      res.status(500).send({ message: 'Feed service or clear cache method not available.', correlationId });
    }
  });

  return router;
};