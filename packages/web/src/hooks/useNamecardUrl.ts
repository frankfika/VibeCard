import { useEffect, useState } from 'react';
import type { Profile } from '../store';
import { latestActiveNow, loadNowItems } from '../lib/now';
import { loadRuntimeConfig, publicRuntimeEndpoint } from '../lib/runtime';

const STORAGE_KEY = 'vibecard_namecard_id';
let snapshotMutationQueue: Promise<void> = Promise.resolve();

function enqueueSnapshotMutation(operation: () => Promise<void>): Promise<void> {
  const run = snapshotMutationQueue.then(operation, operation);
  snapshotMutationQueue = run.catch(() => {});
  return run;
}

/**
 * Stable short share URL for a profile.
 *
 * - Local mode embeds the strict public projection in the URL, so sharing
 *   creates no server-side copy that could outlive browser revocation state.
 * - Remote runtimes use their canonical Card endpoint and never create an
 *   extra static copy.
 * - Any capability-based snapshot cached by an older client is revoked.
 */
export function useNamecardUrl(profile: Profile): {
  id: string | null;
  url: string;
  legacyBase64: string;
  loading: boolean;
  error: string | null;
} {
  const id = null;
  const [error, setError] = useState<string | null>(null);
  const loading = false;
  const [runtime, setRuntime] = useState(() => loadRuntimeConfig());

  useEffect(() => {
    const refreshRuntime = () => setRuntime(loadRuntimeConfig());
    window.addEventListener('vibecard-runtime-change', refreshRuntime);
    return () => window.removeEventListener('vibecard-runtime-change', refreshRuntime);
  }, []);

  // The snapshot is a strict public projection. Private contacts, provider
  // credentials, legacy wallet proof, and private memories never enter the
  // request body or fallback URL.
  const publicProfile = makePublicProfile(profile);
  const publicPayload = JSON.stringify(publicProfile);
  const legacyBase64 = makeLegacyBase64(publicProfile);
  const remoteSource = runtime && runtime.mode !== 'local' ? publicRuntimeEndpoint(runtime) : '';
  const explicitDemo = !remoteSource && typeof window !== 'undefined' && localStorage.getItem('vibecard_demo_mode') === '1';
  const url = remoteSource
    ? `${legacyBase64}&source=${encodeURIComponent(remoteSource)}`
    : explicitDemo
      ? `${legacyBase64}&demo=1`
      : legacyBase64;

  const profileKey = publicPayload;
  useEffect(() => {
    let cancelled = false;
    setError(null);

    void enqueueSnapshotMutation(async () => {
      try {
        // Current local shares are embedded projections and remote shares use
        // the canonical runtime. Clean up any capability-based snapshot left
        // by an older client, but never create a new server-side copy.
        await revokeCachedNamecard();
      } catch (e) {
        if (!cancelled) setError(String((e as { message?: unknown })?.message || e));
      }
    });

    return () => {
      cancelled = true;
    };
    // re-run when the public identity changes
  }, [profileKey, remoteSource]);

  return { id, url, legacyBase64, loading, error };
}

export async function revokeCachedNamecard(): Promise<void> {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  let cached: { id?: unknown; revokeToken?: unknown };
  try { cached = JSON.parse(raw); } catch { window.localStorage.removeItem(STORAGE_KEY); return; }
  if (typeof cached.id === 'string' && typeof cached.revokeToken === 'string') {
    await revokeNamecard(cached.id, cached.revokeToken);
  }
  // Do not erase a newer capability written while this DELETE was in flight.
  if (window.localStorage.getItem(STORAGE_KEY) === raw) window.localStorage.removeItem(STORAGE_KEY);
}

async function revokeNamecard(id: string, revokeToken: string): Promise<void> {
  const response = await fetch(`/api/cards/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${revokeToken}` },
  });
  if (!response.ok && response.status !== 404) throw new Error('公开 Card 快照撤回失败，请重试。');
}

export function makePublicProfile(profile: Profile) {
  const nowItems = latestActiveNow(loadNowItems(), Date.now(), 3);
  const explicitDemo = typeof window !== 'undefined' && localStorage.getItem('vibecard_demo_mode') === '1';
  return {
    ...(explicitDemo ? { demoFixtureId: 'vibecard-official-fixture-v1' } : {}),
    schemaVersion: 1,
    name: profile.name,
    handle: profile.handle,
    avatar: profile.avatar,
    bio: profile.bio,
    mbti: profile.mbti,
    zodiac: profile.zodiac,
    age: profile.age,
    location: profile.location,
    tags: profile.tags,
    canHelpWith: profile.canHelpWith || [],
    lookingFor: profile.lookingFor,
    highlights: profile.highlights.filter(item => item.title).slice(0, 6),
    event: profile.event,
    agentEnabled: true,
    nowItems,
    // Kept for v1 public renderer compatibility, but never populated from
    // the legacy social feed.
    threads: [],
  };
}

function makeLegacyBase64(profile: ReturnType<typeof makePublicProfile>): string {
  if (typeof window === 'undefined') return '';
  try {
    const b = btoa(encodeURIComponent(JSON.stringify(profile)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '.');
    return `${window.location.origin}/?c=${b}`;
  } catch {
    return window.location.href;
  }
}
