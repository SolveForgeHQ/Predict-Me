import { Hono } from 'hono';
import markets from './routes/markets';
import auth from './routes/auth';

const app = new Hono();

app.get('/health', (c) => {
  return c.text('OK');
});

app.route('/markets', markets);
app.route('/auth', auth);

export default app;
