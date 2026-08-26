import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpModerationHook, moderateOrThrow, ModerationError } from '../src/moderation';

test('HTTP moderation hook forwards text and bearer token', async (t) => {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    assert.equal(req.headers.authorization, 'Bearer moderation-secret');
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString('utf8')), { text: 'hello' });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('expected TCP address');

  const hook = createHttpModerationHook({
    url: `http://127.0.0.1:${address.port}/check`,
    apiKey: 'moderation-secret',
    timeoutMs: 1000,
  });
  await moderateOrThrow(hook, 'hello');
});

test('HTTP moderation hook fails closed on a malformed response', async (t) => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ result: 'maybe' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('expected TCP address');

  const hook = createHttpModerationHook({ url: `http://127.0.0.1:${address.port}/check` });
  await assert.rejects(
    moderateOrThrow(hook, 'hello'),
    (error: unknown) => error instanceof ModerationError && error.code === 'moderation_unavailable',
  );
});
