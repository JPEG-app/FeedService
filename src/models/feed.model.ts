export interface FeedItem {
  postId: string;
  userId: string;
  authorUsername: string;
  postTitle: string;
  postContent: string;
  createdAt: Date;
  updatedAt: Date;
  likeCount: number;
  hasUserLiked?: boolean;
}

export interface Feed {
  userId: string;
  items: FeedItem[];
}

export interface PostCreatedEventData {
  eventType: 'PostCreated';
  eventTimestamp: string;
  postId: string;
  userId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  likeCount?: number;
}

export interface PostLikedEventData {
  eventType: 'PostLiked';
  eventTimestamp: string;
  postId: string;
  userId: string;
}

export interface PostUnlikedEventData {
  eventType: 'PostUnliked';
  eventTimestamp: string;
  postId: string;
  userId: string;
}

export interface UserLifecycleEvent {
    eventType: 'UserCreated' | 'UserUpdated' | 'UserDeleted';
    eventTimestamp: string;
    userId: string;
    username?: string;
}