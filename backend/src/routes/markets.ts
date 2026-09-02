import { Hono } from 'hono';

const markets = new Hono();

markets.get('/', (c) => {
  return c.json({ message: 'List of markets' });
});

markets.get('/:id', (c) => {
  const id = c.req.param('id');
  return c.json({ message: `Market ${id}` });
});

export default markets;
