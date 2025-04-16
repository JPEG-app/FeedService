import express from 'express';
import { FeedController } from '../controllers/feed.controller';
import { FeedService } from '../services/feed.service';
import { FeedRepository } from '../repositories/feed.repository';
// import { authMiddleware } from '../middlewares/auth.middleware'; // Assuming you have auth middleware

const router = express.Router();

export const setupFeedRoutes = (postServiceUrl: string) => {
  const feedRepository = new FeedRepository(postServiceUrl);
  const feedService = new FeedService(feedRepository);
  const feedController = new FeedController(feedService);

  router.get('/feed', feedController.getFeed.bind(feedController)); // Protect with auth middleware

  return router;
};

export default router;