import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import * as dotenv from 'dotenv';
import { FeedService } from '../services/feed.service';
import { UserLifecycleEvent } from '../models/feed.model';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const kafkaBroker = process.env.KAFKA_BROKER || 'kafka.kafka-ca1.svc.cluster.local:9092';
const clientId = process.env.KAFKA_CLIENT_ID_FEED || 'feed-service-consumer';
const userLifecycleTopic = process.env.USER_LIFECYCLE_TOPIC || 'user_lifecycle_events';
const consumerGroupId = process.env.KAFKA_CONSUMER_GROUP_FEED_USERS || 'feed-service-user-events-group';

const kafka = new Kafka({ clientId, brokers: [kafkaBroker] });
let consumer: Consumer | null = null;
let feedServiceInstance: FeedService | null = null;
let kafkaLogger: winston.Logger | null = null;

export const initializeFeedServiceForConsumer = (service: FeedService, loggerInstance: winston.Logger) => {
  feedServiceInstance = service;
  kafkaLogger = loggerInstance;
};

const handleMessage = async ({ message }: EachMessagePayload): Promise<void> => {
  const correlationId = message.headers?.['X-Correlation-ID']?.toString() || uuidv4();
  const currentLogger = kafkaLogger || console;

  if (!feedServiceInstance || !message.value) return;

  try {
    const event: UserLifecycleEvent = JSON.parse(message.value.toString());
    if (event.userId && event.eventType) {
      await feedServiceInstance.processUserLifecycleEvent(event, correlationId);
    }
  } catch (error: any) {
    currentLogger.error(`Error processing UserLifecycleEvent`, { error: error.message });
  }
};

export const startFeedConsumers = async (): Promise<void> => {
  const currentLogger = kafkaLogger || console;
  if (consumer || !feedServiceInstance) return;

  consumer = kafka.consumer({ groupId: consumerGroupId });

  try {
    await consumer.connect();
    await consumer.subscribe({ topic: userLifecycleTopic, fromBeginning: true });
    await consumer.run({ eachMessage: handleMessage });
    currentLogger.info(`User event consumer started for group [${consumerGroupId}]`);
  } catch (error: any) {
    currentLogger.error(`Failed to start user event consumer`, { error: error.message });
    throw error;
  }
};

export const stopFeedConsumers = async (): Promise<void> => {
  if (consumer) {
    await consumer.disconnect();
    consumer = null;
  }
};