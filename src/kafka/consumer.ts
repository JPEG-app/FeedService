import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import * as dotenv from 'dotenv';
import { FeedService } from '../services/feed.service';
import { PostCreatedEventData, PostLikedEventData, PostUnlikedEventData, UserLifecycleEvent } from '../models/feed.model';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const kafkaBroker = process.env.KAFKA_BROKER || 'kafka.kafka-ca1.svc.cluster.local:9092';
const clientId = process.env.KAFKA_CLIENT_ID_FEED || 'feed-service-consumer';
const postEventsTopic = process.env.POST_EVENTS_TOPIC || 'post_events';
const userLifecycleTopic = process.env.USER_LIFECYCLE_TOPIC || 'user_lifecycle_events';
const postConsumerGroupIdBase = process.env.KAFKA_CONSUMER_GROUP_FEED_POSTS || 'feed-service-post-events-group';
const userConsumerGroupIdBase = process.env.KAFKA_CONSUMER_GROUP_FEED_USERS || 'feed-service-user-events-group';

const postConsumerGroupId = `${postConsumerGroupIdBase}-${uuidv4()}`;
const userConsumerGroupId = `${userConsumerGroupIdBase}-${uuidv4()}`;

const kafka = new Kafka({
  clientId: clientId,
  brokers: [kafkaBroker],
  retry: {
    initialRetryTime: 3000, retries: 30, maxRetryTime: 30000, factor: 2, multiplier: 2,
  }
});

let postConsumer: Consumer | null = null;
let userConsumer: Consumer | null = null;
let feedServiceInstance: FeedService | null = null;
let kafkaLogger: winston.Logger | null = null;

let idleTimeout: NodeJS.Timeout;
let replayFinishedResolver: (value: void | PromiseLike<void>) => void;

export const initializeFeedServiceForConsumer = (service: FeedService, loggerInstance: winston.Logger) => {
  feedServiceInstance = service;
  kafkaLogger = loggerInstance;
};

const setIdleTimer = () => {
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
        const currentLogger = kafkaLogger || console;
        currentLogger.info('Kafka consumer idle, assuming historical replay is complete. Feed is ready.');
        if(replayFinishedResolver) {
            replayFinishedResolver();
        }
    }, 5000);
};

const handleMessage = async ({ topic, partition, message }: EachMessagePayload): Promise<void> => {
  setIdleTimer();
  const correlationId = message.headers?.['X-Correlation-ID']?.toString() || uuidv4();
  const currentLogger = kafkaLogger || console;

  if (!feedServiceInstance || !message.value) return;

  const eventDataString = message.value.toString();

  try {
    const genericEvent = JSON.parse(eventDataString);

    if (topic === postEventsTopic) {
      switch (genericEvent.eventType) {
        case 'PostCreated':
          await feedServiceInstance.processNewPostEvent(genericEvent as PostCreatedEventData, correlationId);
          break;
        case 'PostLiked':
          await feedServiceInstance.processPostLikedEvent(genericEvent as PostLikedEventData, correlationId);
          break;
        case 'PostUnliked':
          await feedServiceInstance.processPostUnlikedEvent(genericEvent as PostUnlikedEventData, correlationId);
          break;
      }
    } else if (topic === userLifecycleTopic) {
        await feedServiceInstance.processUserLifecycleEvent(genericEvent as UserLifecycleEvent, correlationId);
    }
  } catch (error: any) {
    currentLogger.error(`Error processing Kafka event.`, {
      error: error.message, stack: error.stack, eventData: eventDataString,
    });
  }
};

export const startFeedConsumers = async (): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        replayFinishedResolver = resolve;
        const currentLogger = kafkaLogger || console;
        
        if (postConsumer || userConsumer) {
            currentLogger.info('Feed service Kafka consumers already running.');
            return resolve();
        }
        if (!feedServiceInstance || !kafkaLogger) {
            return reject(new Error('FeedService or Logger not initialized.'));
        }

        postConsumer = kafka.consumer({ groupId: postConsumerGroupId });
        userConsumer = kafka.consumer({ groupId: userConsumerGroupId });

        try {
            currentLogger.info('Starting historical data replay from Kafka...');
            
            await Promise.all([postConsumer.connect(), userConsumer.connect()]);
            
            await postConsumer.subscribe({ topic: postEventsTopic, fromBeginning: true });
            await userConsumer.subscribe({ topic: userLifecycleTopic, fromBeginning: true });

            setIdleTimer();

            await postConsumer.run({ eachMessage: handleMessage });
            await userConsumer.run({ eachMessage: handleMessage });

        } catch (error: any) {
            currentLogger.error(`Failed to start Kafka Consumers.`, { error: error.message });
            await stopFeedConsumers();
            reject(error);
        }
    });
};

export const stopFeedConsumers = async (): Promise<void> => {
    if (postConsumer) await postConsumer.disconnect();
    if (userConsumer) await userConsumer.disconnect();
    postConsumer = null;
    userConsumer = null;
};