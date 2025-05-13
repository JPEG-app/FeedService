// feed-service/src/routes/feed.routes.ts
import express from 'express';
import { FeedController } from '../controllers/feed.controller';
import { FeedService } from '../services/feed.service';

const router = express.Router();

// The FeedService instance will be passed from app.ts/index.ts
export const setupFeedRoutes = (feedServiceInstance: FeedService) => {
  const feedController = new FeedController(feedServiceInstance);

  router.get('/feed', feedController.getFeed.bind(feedController));

  // Optional endpoint for testing cache clearing
  router.post('/feed/admin/clear-cache', (req, res) => {
    if (feedServiceInstance && typeof feedServiceInstance.clearAllCaches === 'function') {
      feedServiceInstance.clearAllCaches();
      res.status(200).send({ message: 'Feed caches cleared successfully.' });
    } else {
      res.status(500).send({ message: 'Feed service or clear cache method not available.'});
    }
  });

  return router;
};

// Remove 'export default router;' if you are only using the setupFeedRoutes function