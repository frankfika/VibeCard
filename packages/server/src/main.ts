/**
 * Server entrypoint (task 5.7). One command:
 *
 *   VIBECARD_OWNER_TOKEN=change-me npm start --prefix packages/server
 *
 * No VibeCard Cloud account or key is required. Defaults: mock model,
 * SQLite at ./data/vibecard.db, localhost-only bind.
 */

import { loadConfig } from './config';
import { selectProvider } from './provider';
import { createApp, listen } from './app';
import { redactSecrets } from './redact';
import { createHttpModerationHook } from './moderation';

const config = loadConfig();
if (process.env.NODE_ENV === 'production') {
  if (config.ownerTokenGenerated || config.ownerToken.startsWith('change-me')) {
    throw new Error('Production startup requires a non-placeholder VIBECARD_OWNER_TOKEN.');
  }
  if (config.requireModeration && !config.moderationApiUrl) {
    throw new Error('Production startup requires MODERATION_API_URL when REQUIRE_MODERATION=1.');
  }
}
const provider = selectProvider(config);
const moderate = config.moderationApiUrl
  ? createHttpModerationHook({
      url: config.moderationApiUrl,
      apiKey: config.moderationApiKey,
      timeoutMs: config.moderationTimeoutMs,
    })
  : undefined;
const app = createApp({ config, provider, moderate });
const server = await listen(app, config.host, config.port);

const address = server.address();
const bound = typeof address === 'object' && address ? `${config.host}:${address.port}` : `${config.host}:${config.port}`;
console.log(`vibecard-server listening on http://${bound}`);
console.log(`model provider: ${provider.name}${config.aiProvider === 'openai-compatible' ? ` (${redactSecrets(config.aiApiBase ?? '')})` : ' (deterministic, no key needed)'}`);
console.log(`database: ${config.dbPath}`);
if (config.ownerTokenGenerated) {
  console.log('WARNING: VIBECARD_OWNER_TOKEN is not set.');
  console.log(`An ephemeral owner token was generated for this run only: ${config.ownerToken}`);
  console.log('Set VIBECARD_OWNER_TOKEN in your environment for a stable owner credential.');
}

const shutdown = () => {
  server.close(() => {
    app.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
