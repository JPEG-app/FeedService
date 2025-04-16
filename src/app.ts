import express, { Application } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { setupFeedRoutes } from './routes/feed.routes';

export class App {
  public app: Application;
  private postServiceUrl: string;

  constructor(postServiceUrl: string) {
    this.app = express();
    this.postServiceUrl = postServiceUrl;
    this.config();
    this.routes();
  }

  private config(): void {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173'
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
    this.app.use('/', setupFeedRoutes(this.postServiceUrl));
  }
}