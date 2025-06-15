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

export interface User {
  id?: string;
  username: string;
  email: string;
  passwordhash: string;
  createdAt?: Date;
  updatedAt?: Date;
}