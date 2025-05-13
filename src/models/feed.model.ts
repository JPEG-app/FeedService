export interface FeedItem {
  postId: string;
  userId: string;
  authorUsername: string;
  postTitle: string;
  postContent: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Feed {
  userId: string;
  items: FeedItem[];
}