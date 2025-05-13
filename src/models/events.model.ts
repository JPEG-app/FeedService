export interface PostCreatedEventData {
    postId: string;
    userId: string;
    title: string;
    content: string;
    createdAt: string | Date;
    updatedAt: string | Date;
  
    eventType: 'PostCreated';
    eventTimestamp: string;
  }
  
  export interface UserLifecycleEvent {
    eventType: 'UserCreated' | 'UserDeleted' | 'UserUpdated';
    userId: string;
    username?: string;
    timestamp: string;
  }