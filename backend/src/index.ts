import { Hono } from 'hono';
import markets from './routes/markets';

const app = new Hono();

app.get('/health', (c) => {
  return c.text('OK');
});

app.route('/markets', markets);

export default app;
