import express, { Application, Request as ExpressRequest, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { setupFeedRoutes } from './routes/feed.routes';
import { FeedService } from './services/feed.service';
import { FeedRepository } from './repositories/feed.repository';
import { initializeFeedServiceForConsumer } from './kafka/consumer';
import logger, { assignRequestId, requestLogger, logError, RequestWithId } from './utils/logger';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service-service:3001';
const POST_SERVICE_URL = process.env.POST_SERVICE_URL || 'http://post-service-service:3002';

export class App {
  public app: Application;
  public feedService: FeedService;

  constructor() {
    this.app = express();
    
    const feedRepository = new FeedRepository(POST_SERVICE_URL, USER_SERVICE_URL, logger);
    this.feedService = new FeedService(logger, feedRepository);

    initializeFeedServiceForConsumer(this.feedService, logger);
    this.config();
    this.routes();
    this.errorHandling();
  }

  private config(): void {
    this.app.use(assignRequestId);
    const allowedOrigins = [
      'https://jpegapp.lol',
      'https://www.jpegapp.lol'
    ];
    const corsOptions: cors.CorsOptions = {
      origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn('CORS blocked request', { origin, type: 'CorsErrorLog' });
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    };
    this.app.use(cors(corsOptions));
    this.app.options('*', cors(corsOptions));

    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
    this.app.use(requestLogger);
  }

  private routes(): void {
    this.app.use('/', setupFeedRoutes(this.feedService));
  }

  private errorHandling(): void {
    this.app.use((req: ExpressRequest, res: Response, next: NextFunction) => {
      const err: any = new Error('Not Found');
      err.status = 404;
      next(err);
    });

    this.app.use((err: any, req: ExpressRequest, res: Response, next: NextFunction) => {
      const typedReq = req as RequestWithId;

      logError(err, req, 'Unhandled error in Express request lifecycle');

      res.status(err.status || 500).json({
        message: err.message || 'Internal Server Error',
        correlationId: typedReq.id,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      });
    });
  }
}