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
    initialRetryTime: 3000,
    retries: 30,
    maxRetryTime: 30000,
    factor: 2,
    multiplier: 2,
  }
});

let postConsumer: Consumer | null = null;
let userConsumer: Consumer | null = null;
let feedServiceInstance: FeedService | null = null;
let kafkaLogger: winston.Logger | null = null;

export const initializeFeedServiceForConsumer = (service: FeedService, loggerInstance: winston.Logger) => {
  feedServiceInstance = service;
  kafkaLogger = loggerInstance;
};

const handleMessage = async ({ topic, partition, message }: EachMessagePayload): Promise<void> => {
  const correlationId = message.headers?.['X-Correlation-ID']?.toString() ||
                        message.headers?.['correlationId']?.toString() ||
                        uuidv4();

  const messageLogInfo = {
    topic,
    partition,
    offset: message.offset,
    messageKey: message.key?.toString(),
    correlationId,
    type: 'KafkaConsumerLog.MessageReceived'
  };

  const currentLogger = kafkaLogger || console;

  if (!feedServiceInstance) {
    currentLogger.error('FeedService instance not initialized for Kafka consumer. Message skipped.', messageLogInfo);
    return;
  }
  if (!message.value) {
    currentLogger.warn(`Kafka consumer received message with no value.`, messageLogInfo);
    return;
  }

  const eventDataString = message.value.toString();
  currentLogger.info(`Processing Kafka message.`, { ...messageLogInfo, dataPreview: eventDataString.substring(0, 200) + '...' });

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
        default:
          currentLogger.warn(`Received unknown eventType on post_events topic.`, { ...messageLogInfo, eventType: genericEvent.eventType, topic: postEventsTopic, type: 'KafkaConsumerLog.UnknownEventType' });
      }
    } else if (topic === userLifecycleTopic) {
      const event: UserLifecycleEvent = genericEvent;
      if (event.userId && event.eventType) {
        await feedServiceInstance.processUserLifecycleEvent(event, correlationId);
      } else {
        currentLogger.warn(`Received malformed user event.`, { ...messageLogInfo, topic: userLifecycleTopic, eventData: eventDataString, type: 'KafkaConsumerLog.MalformedEvent' });
      }
    } else {
      currentLogger.warn(`Received message from unhandled topic.`, { ...messageLogInfo, topic, type: 'KafkaConsumerLog.UnhandledTopic' });
    }

    currentLogger.info(`Successfully processed Kafka message.`, { ...messageLogInfo, type: 'KafkaConsumerLog.MessageProcessed' });
  } catch (error: any) {
    currentLogger.error(`Error processing Kafka event.`, {
        ...messageLogInfo,
        error: error.message,
        stack: error.stack,
        eventData: eventDataString,
        type: 'KafkaConsumerLog.ProcessingError'
    });
  }
};

export const startFeedConsumers = async (): Promise<void> => {
    const currentLogger = kafkaLogger || console;
    if (postConsumer || userConsumer) {
      currentLogger.info('Feed service Kafka consumers already running.', { type: 'KafkaConsumerControlLog.Start' });
      return;
    }
    if (!feedServiceInstance) {
      const errMsg = 'FeedService instance must be initialized before starting consumers.';
      currentLogger.error(errMsg, { type: 'KafkaConsumerControlLog.StartError' });
      throw new Error(errMsg);
    }
    if (!kafkaLogger) {
      const errMsg = 'Logger not initialized for Kafka consumers.';
      console.error(errMsg);
      throw new Error(errMsg);
    }

    postConsumer = kafka.consumer({ groupId: postConsumerGroupId });
    userConsumer = kafka.consumer({ groupId: userConsumerGroupId });

    try {
        await postConsumer.connect();
        currentLogger.info(`Kafka Consumer connected for group ${postConsumerGroupId}`, { groupId: postConsumerGroupId });
        await postConsumer.subscribe({ topic: postEventsTopic, fromBeginning: true });
        currentLogger.info(`Subscribed to topic [${postEventsTopic}] from beginning.`, { topic: postEventsTopic });
        await postConsumer.run({ eachMessage: handleMessage });

        await userConsumer.connect();
        currentLogger.info(`Kafka Consumer connected for group ${userConsumerGroupId}`, { groupId: userConsumerGroupId });
        await userConsumer.subscribe({ topic: userLifecycleTopic, fromBeginning: true });
        currentLogger.info(`Subscribed to topic [${userLifecycleTopic}] from beginning.`, { topic: userLifecycleTopic });
        await userConsumer.run({ eachMessage: handleMessage });

        currentLogger.info('All Feed service Kafka consumers are now running...', { type: 'KafkaConsumerControlLog.Running' });
    } catch (error: any) {
        currentLogger.error(`Failed to start Kafka Consumers.`, { error: (error as Error).message, stack: (error as Error).stack });
        await stopFeedConsumers();
        throw error;
    }
};

export const stopFeedConsumers = async (): Promise<void> => {
    const currentLogger = kafkaLogger || console;
    const consumersToStop = [
        { consumer: postConsumer, name: 'Posts' },
        { consumer: userConsumer, name: 'Users' }
    ];

    for (const item of consumersToStop) {
        if (item.consumer) {
            try {
                currentLogger.info(`Disconnecting ${item.name} consumer...`);
                await item.consumer.disconnect();
                currentLogger.info(`${item.name} consumer disconnected successfully.`);
            } catch (error) {
                currentLogger.error(`Error disconnecting ${item.name} consumer`, { error: (error as Error).message });
            }
        }
    }
    postConsumer = null;
    userConsumer = null;
};