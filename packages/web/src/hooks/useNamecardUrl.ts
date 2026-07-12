import { useEffect, useState } from 'react';
import type { Profile } from '../store';

const STORAGE_KEY = 'vibecard_namecard_id';

/**
 * Stable short share URL for a profile.
 *
 * - On mount, checks localStorage for a previously issued id for this
 *   handle/wallet. If absent (or the profile identity changed), calls
 *   POST /api/cards to upsert and caches the returned id.
 * - Falls back to the legacy base64 ?c= URL if the server is unreachable,
 *   so a brief outage doesn't break sharing.
 */
export function useNamecardUrl(profile: Profile): {
  id: string | null;
  url: string;
  legacyBase64: string;
  loading: boolean;
  error: string | null;
} {
  const [id, setId] = useState<string | null>(() => readCachedId());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // legacy base64 (for fallback) — kept short by trimming threads
  const legacyBase64 = makeLegacyBase64(profile);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = id ? `${origin}/?id=${encodeURIComponent(id)}` : legacyBase64;

  const profileKey = identityKey(profile);
  useEffect(() => {
    let cancelled = false;
    const cachedKey = readCachedKey();
    if (cachedKey === profileKey && id) return; // same identity, no upsert needed

    setLoading(true);
    setError(null);
    fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`http ${r.status}`);
        return r.json() as Promise<{ id: string }>;
      })
      .then((data) => {
        if (cancelled) return;
        setId(data.id);
        writeCachedId(data.id, profileKey);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e?.message || e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // re-run when the identity (handle or wallet) changes
  }, [profileKey]);

  return { id, url, legacyBase64, loading, error };
}

function identityKey(profile: Profile): string {
  if (profile.handle) return `h:${profile.handle.trim().toLowerCase()}`;
  if (profile.verified?.wallet) return `w:${profile.verified.wallet.toLowerCase()}`;
  return 'n:';
}

function readCachedId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return typeof obj.id === 'string' ? obj.id : null;
  } catch {
    return null;
  }
}

function readCachedKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return typeof obj.key === 'string' ? obj.key : null;
  } catch {
    return null;
  }
}

function writeCachedId(id: string, key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, key }));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

function makeLegacyBase64(profile: Profile): string {
  if (typeof window === 'undefined') return '';
  try {
    // strip heavy fields to keep base64 short for fallback
    const lite = {
      name: profile.name,
      handle: profile.handle,
      avatar: profile.avatar,
      bio: profile.bio,
      mbti: (profile as Profile & { mbti?: string }).mbti,
      zodiac: (profile as Profile & { zodiac?: string }).zodiac,
      age: (profile as Profile & { age?: string }).age,
      location: (profile as Profile & { location?: string }).location,
      tags: profile.tags,
      lookingFor: profile.lookingFor,
      highlights: profile.highlights,
      contacts: (profile as Profile & { contacts?: unknown }).contacts,
      verified: profile.verified,
      event: profile.event,
    };
    const b = btoa(encodeURIComponent(JSON.stringify(lite)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '.');
    return `${window.location.origin}/?c=${b}`;
  } catch {
    return window.location.href;
  }
}
