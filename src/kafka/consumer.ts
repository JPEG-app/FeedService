// feed-service/src/kafka/consumer.ts
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import * as dotenv from 'dotenv';
import { FeedService } from '../services/feed.service';
import { PostCreatedEventData, UserLifecycleEvent } from '../models/events.model';

dotenv.config();

const kafkaBroker = process.env.KAFKA_BROKER || 'kafka:9092';
const clientId = process.env.KAFKA_CLIENT_ID_FEED || 'feed-service-consumer';
const postEventsTopic = process.env.POST_EVENTS_TOPIC || 'post_events';
const userLifecycleTopic = process.env.USER_LIFECYCLE_TOPIC || 'user_lifecycle_events';
const consumerGroupId = process.env.KAFKA_CONSUMER_GROUP_FEED_MAIN || 'feed-service-main-group';

const kafka = new Kafka({
  clientId: clientId,
  brokers: [kafkaBroker],
  retry: {
    initialRetryTime: 300,
    retries: 5,
  },
});

let consumer: Consumer | null = null;
let feedServiceInstance: FeedService | null = null;

export const initializeFeedServiceForConsumer = (service: FeedService) => {
  feedServiceInstance = service;
};

const handleMessage = async ({ topic, partition, message }: EachMessagePayload): Promise<void> => {
  if (!feedServiceInstance) {
    console.error('FeedService instance not initialized for Kafka consumer. Message skipped.');
    return;
  }
  if (!message.value) {
    console.warn(`Kafka consumer received message with no value from topic ${topic}.`);
    return;
  }

  const eventDataString = message.value.toString();
  console.log(`FeedService Consumer: Received message from topic ${topic}, partition ${partition}`);

  try {
    if (topic === postEventsTopic) {
      const event: PostCreatedEventData = JSON.parse(eventDataString);
      if (event.eventType === 'PostCreated' && event.postId) {
        await feedServiceInstance.processNewPostEvent(event);
      } else {
        console.warn(`FeedService Consumer: Received non-PostCreated event or event missing postId from topic ${postEventsTopic}:`, eventDataString);
      }
    } else if (topic === userLifecycleTopic) {
      const event: UserLifecycleEvent = JSON.parse(eventDataString);
      if (event.userId && event.eventType) {
        await feedServiceInstance.processUserLifecycleEvent(event);
      } else {
        console.warn(`FeedService Consumer: Received malformed user event from topic ${userLifecycleTopic}:`, eventDataString);
      }
    } else {
      console.warn(`FeedService Consumer: Received message from unhandled topic ${topic}`);
    }
  } catch (error) {
    console.error(`FeedService Consumer: Error processing event from topic ${topic}. Error: ${error}. EventData: ${eventDataString}`);
  }
};

export const startFeedConsumers = async (): Promise<void> => {
  if (consumer) {
    console.log('Feed service Kafka consumers already running.');
    return;
  }
  if (!feedServiceInstance) {
    throw new Error('FeedService instance must be initialized via initializeFeedServiceForConsumer before starting consumers.');
  }

  consumer = kafka.consumer({ groupId: consumerGroupId });

  try {
    await consumer.connect();
    console.log(`FeedService Kafka Consumer [${clientId}] connected to ${kafkaBroker} for group ${consumerGroupId}`);

    await consumer.subscribe({ topic: postEventsTopic, fromBeginning: true });
    console.log(`FeedService Consumer: Subscribed to topic [${postEventsTopic}] from beginning.`);

    await consumer.subscribe({ topic: userLifecycleTopic, fromBeginning: true });
    console.log(`FeedService Consumer: Subscribed to topic [${userLifecycleTopic}] from beginning.`);

    await consumer.run({
      eachMessage: handleMessage,
    });
    console.log('Feed service Kafka consumers are now running...');
  } catch (error) {
    console.error(`Failed to start FeedService Kafka Consumer [${clientId}]:`, error);
    if (consumer) {
      await consumer.disconnect().catch(disconnectError => {
        console.error('Error disconnecting consumer after startup failure:', disconnectError);
      });
      consumer = null;
    }
    throw error; // Re-throw to allow main application to handle startup failure
  }
};

export const stopFeedConsumers = async (): Promise<void> => {
  if (consumer) {
    try {
      console.log(`FeedService Kafka Consumer [${clientId}] disconnecting...`);
      await consumer.disconnect();
      console.log(`FeedService Kafka Consumer [${clientId}] disconnected successfully.`);
    } catch (error) {
      console.error(`Error disconnecting FeedService Kafka Consumer [${clientId}]:`, error);
    } finally {
      consumer = null;
    }
  } else {
    console.log('Feed service Kafka consumers were not running or already stopped.');
  }
};