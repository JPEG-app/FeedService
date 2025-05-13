// feed-service/src/app.ts
import express, { Application } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { setupFeedRoutes } from './routes/feed.routes';
import { FeedService } from './services/feed.service';
import { initializeFeedServiceForConsumer } from './kafka/consumer';

export class App {
  public app: Application;
  public feedService: FeedService;

  constructor() {
    this.app = express();
    this.feedService = new FeedService(); // Create FeedService instance

    // Pass the FeedService instance to the Kafka consumer module
    // This allows the consumer to call methods on the FeedService instance.
    initializeFeedServiceForConsumer(this.feedService);

    this.config();
    this.routes();
  }

  private config(): void {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ];
    const corsOptions: cors.CorsOptions = {
      origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    };
    this.app.use(cors(corsOptions));
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
  }

  private routes(): void {
    // Pass the feedService instance to setupFeedRoutes
    this.app.use('/', setupFeedRoutes(this.feedService));
  }
}