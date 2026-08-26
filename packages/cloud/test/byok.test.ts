import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinnedByokProvider, isPublicProviderAddress, resolvePublicByokBase } from '../src/byok.ts';

test('BYOK endpoint policy rejects credentials, non-HTTPS, local, metadata, private and mixed DNS answers', async () => {
  const never = async () => { throw new Error('DNS must not be reached'); };
  for (const value of [
    'http://provider.example/v1',
    'https://user:secret@provider.example/v1',
    'https://provider.example/v1?target=x',
    'https://provider.example/v1#secret',
    'https://localhost/v1',
    'https://model.local/v1',
    'https://metadata.google.internal/v1',
    'https://127.0.0.1/v1',
    'https://169.254.169.254/latest/meta-data',
    'https://10.1.2.3/v1',
    'https://[::1]/v1',
    'https://[0:0:0:0:0:ffff:7f00:1]/v1',
    'https://[::ffff:7f00:1]/v1',
    'https://[::7f00:1]/v1',
  ]) {
    await assert.rejects(resolvePublicByokBase(value, never), /public HTTPS|private|reserved/);
  }
  await assert.rejects(
    resolvePublicByokBase('https://provider.example/v1', async () => [
      { address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 },
    ]),
    /private or reserved/,
  );
  for (const address of ['0:0:0:0:0:ffff:7f00:1', '::ffff:7f00:1', '::7f00:1', '::ffff:169.254.169.254']) {
    await assert.rejects(
      resolvePublicByokBase('https://provider.example/v1', async () => [{ address, family: 6 }]),
      /private or reserved/,
      `DNS answer must reject canonical IPv4-mapped/compatible address ${address}`,
    );
    assert.equal(isPublicProviderAddress(address), false);
  }
  assert.equal(isPublicProviderAddress('8.8.8.8'), true);
  assert.equal(isPublicProviderAddress('100.64.0.1'), false);
  assert.equal(isPublicProviderAddress('255.255.255.255'), false);
  assert.equal(isPublicProviderAddress('fe80::1'), false);
  assert.equal(isPublicProviderAddress('64:ff9b::a00:1'), false);
  assert.equal(isPublicProviderAddress('2002:0a00:0001::1'), false);
  assert.equal(isPublicProviderAddress('::ffff:808:808'), true, 'mapped public IPv4 is classified by its final 32 bits');
});

test('BYOK DNS is revalidated for every call before any socket can be opened', async () => {
  let calls = 0;
  const provider = createPinnedByokProvider({
    base: 'https://provider.example/v1', model: 'test', apiKey: 'secret', timeoutMs: 100,
    resolver: async () => {
      calls += 1;
      return [{ address: '127.0.0.1', family: 4 }];
    },
  });
  await assert.rejects(provider.complete({ messages: [{ role: 'user', content: 'hello' }] }), /private or reserved/);
  await assert.rejects(provider.complete({ messages: [{ role: 'user', content: 'again' }] }), /private or reserved/);
  assert.equal(calls, 2, 'resolver is not cached across calls, closing the rebinding window');
});
