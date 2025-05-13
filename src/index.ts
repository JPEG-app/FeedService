// feed-service/src/index.ts
import { App } from './app';
import * as dotenv from 'dotenv';
import { startFeedConsumers, stopFeedConsumers } from './kafka/consumer';

dotenv.config();

const port = process.env.PORT || 3003;

const startService = async () => {
  try {
    // App constructor now creates FeedService and initializes the Kafka consumer module with it.
    const appInstance = new App();
    const expressApp = appInstance.app;

    // Start Kafka consumers. FeedService instance is already known to the consumer module.
    await startFeedConsumers();
    console.log('Feed service Kafka consumers started successfully.');

    const server = expressApp.listen(port, () => {
      console.log(`Feed Service is running on port ${port}`);
    });

    const shutdown = async (signal: string) => {
      console.log(`${signal} received. Shutting down Feed Service gracefully.`);
      // Attempt to close HTTP server first
      server.close(async () => {
        console.log('HTTP server closed.');
        // Then stop Kafka consumers
        await stopFeedConsumers();
        console.log('Feed service Kafka consumers stopped.');
        process.exit(0);
      });

      // Force shutdown if graceful period exceeds
      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1); // Exit with error code
      }, 10000); // 10 seconds timeout
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start Feed Service or its Kafka consumers:', error);
    // Attempt to stop consumers even on startup failure
    await stopFeedConsumers().catch(e => console.error("Error stopping consumers during failed startup:", e));
    process.exit(1);
  }
};

startService();