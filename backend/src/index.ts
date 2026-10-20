import { Hono } from 'hono';
import { cors } from 'hono/cors';
import markets from './routes/markets';
import auth from './routes/auth';

const app = new Hono();

// Allow requests from the Next.js dev server and any deployed frontend
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', '*'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/health', (c) => {
  return c.text('OK');
});

app.route('/markets', markets);
app.route('/auth', auth);

export default app;
