import { App } from './app';
import * as dotenv from 'dotenv';

dotenv.config();

const port = process.env.PORT || 3003;
const postServiceUrl = process.env.POST_SERVICE_URL;

if (!postServiceUrl) {
  console.error('POST_SERVICE_URL environment variable is required.');
  process.exit(1);
}

const app = new App(postServiceUrl).app;

app.listen(port, () => {
  console.log(`Feed Service is running on port ${port}`);
});