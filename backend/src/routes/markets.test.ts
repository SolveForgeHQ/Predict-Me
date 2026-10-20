import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

describe('GET /markets', () => {
  it('rejects an unknown chain value with 400', async () => {
    const { default: markets } = await import('./markets');
    const app = new Hono();
    app.route('/markets', markets);

    const res = await app.request('/markets?chain=ethereum', undefined, {} as any);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('Invalid chain parameter');
    expect(body.error).toContain('ethereum');
  });

  it('accepts chain=sonic and returns an array (possibly empty)', async () => {
    const { default: markets } = await import('./markets');
    const app = new Hono();
    app.route('/markets', markets);

    const res = await app.request('/markets?chain=sonic', undefined, {} as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.chain).toBe('sonic');
    expect(Array.isArray(body.markets)).toBe(true);
  });

  it('accepts chain=all and returns all three chains', async () => {
    const { default: markets } = await import('./markets');
    const app = new Hono();
    app.route('/markets', markets);

    const res = await app.request('/markets?chain=all', undefined, {} as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.chain).toBe('all');
    expect(Array.isArray(body.markets)).toBe(true);
  });

  it('falls back to cached data on RPC failure (empty env = no contract = empty markets, no crash)', async () => {
    const { default: markets } = await import('./markets');
    const app = new Hono();
    app.route('/markets', markets);

    const res = await app.request('/markets?chain=sonic', undefined, {
      SONIC_RPC_URL: 'https://invalid-rpc.example.com',
      SONIC_CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000000',
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.cached).toBe(true);
    expect(Array.isArray(body.markets)).toBe(true);
  });
});

describe('GET /markets/:id', () => {
  it('rejects an unknown chain value with 400', async () => {
    const { default: markets } = await import('./markets');
    const app = new Hono();
    app.route('/markets', markets);

    const res = await app.request('/markets/1?chain=polygon', undefined, {} as any);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('Invalid chain parameter');
  });
});
