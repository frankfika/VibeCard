import { resolve } from 'node:path';
import { listenManaged } from './gateway.ts';
import { createHttpModerationHook } from '../../server/src/moderation.ts';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8790);
const dataDir = resolve(process.env.VIBECARD_CLOUD_DATA || './data/cloud');
const masterSecret = process.env.VIBECARD_CLOUD_MASTER_SECRET;
if (!masterSecret || masterSecret.length < 32) throw new Error('VIBECARD_CLOUD_MASTER_SECRET must be at least 32 characters');
const moderationUrl = process.env.VIBECARD_CLOUD_MODERATION_API_URL?.trim() || process.env.MODERATION_API_URL?.trim();
const moderation = moderationUrl ? createHttpModerationHook({
  url: moderationUrl,
  apiKey: process.env.VIBECARD_CLOUD_MODERATION_API_KEY?.trim() || process.env.MODERATION_API_KEY?.trim() || null,
  timeoutMs: Number(process.env.VIBECARD_CLOUD_MODERATION_TIMEOUT_MS || process.env.MODERATION_TIMEOUT_MS || 5_000),
}) : null;

const { gateway, server } = await listenManaged({
  dataDir, masterSecret,
  ...(moderation ? { moderatePublicText: async (text: string) => (await moderation(text)).ok } : {}),
}, host, port);
console.log(`[vibecard-cloud] listening on http://${host}:${port}`);
if (!moderation) console.warn('[vibecard-cloud] public stranger-content endpoints fail closed until VIBECARD_CLOUD_MODERATION_API_URL is configured');
const close = () => server.close(() => { void gateway.close().then(() => process.exit(0)); });
process.on('SIGINT', close);
process.on('SIGTERM', close);
