import { App } from './app';
import * as dotenv from 'dotenv';
import { stopFeedConsumers } from './kafka/consumer';

dotenv.config();

const port = process.env.PORT || 3003;

const startService = async () => {
  try {
    const appInstance = new App();
    
    await appInstance.bootstrap();
    
    const expressApp = appInstance.app;
    
    const server = expressApp.listen(port, () => {
      console.log(`Feed Service is ready and listening on port ${port}`);
    });

    const shutdown = async (signal: string) => {
      console.log(`${signal} received. Shutting down Feed Service gracefully.`);
      server.close(async () => {
        console.log('HTTP server closed.');
        await stopFeedConsumers();
        console.log('Feed service Kafka consumers stopped.');
        process.exit(0);
      });

      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1); 
      }, 10000); 
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start Feed Service or its Kafka consumers:', error);
    await stopFeedConsumers().catch(e => console.error("Error stopping consumers during failed startup:", e));
    process.exit(1);
  }
};

startService();