   import axios from 'axios';
   import { Feed, FeedItem } from '../models/feed.model';
   
   export class FeedRepository {
     private postServiceUrl: string;
   
     constructor(postServiceUrl: string) {
       this.postServiceUrl = postServiceUrl;
     }
   
     async getFeedItems(): Promise<FeedItem[]> {
       try {
         const postsResponse = await axios.get(`${this.postServiceUrl}/posts`);
         const posts = postsResponse.data;
   
         const feedItems: FeedItem[] = posts.map((post: any) => ({
           postId: post.post_id,
           userId: post.user_id,
           authorUsername: 'User #1',
           postTitle: post.title,
           postContent: post.content,
           createdAt: new Date(post.created_at),
           updatedAt: new Date(post.updated_at),
           commentCount: 0,
         }));
   
         feedItems.sort(
           (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
         );
   
         return feedItems;
       } catch (error: any) {
         console.error('Error getting feed items:', error);
         throw new Error('Error fetching feed data: ' + error.message);
       }
     }
   }
   