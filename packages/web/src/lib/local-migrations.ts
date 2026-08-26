const STORAGE_VERSION_KEY = 'vibecard_storage_version';
export const RECOVERY_STORAGE_KEY = 'vibecard_recovery_v1';
const CURRENT_STORAGE_VERSION = 2;

const CANONICAL_KEYS = [
  'vibecard_profile',
  'vibecard_now',
  'vibecard_owner_memories',
  'vibecard_runtime_v1',
];

function recoverySnapshot(error: unknown) {
  const data = Object.fromEntries(CANONICAL_KEYS.map(key => [key, localStorage.getItem(key)]));
  localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    createdAt: Date.now(),
    reason: error instanceof Error ? error.message : 'migration_failed',
    data,
  }));
}

/**
 * Idempotent browser-state migrations. A failure never deletes the source;
 * it records a downloadable recovery snapshot and leaves the old keys intact.
 */
export function runLocalMigrations(): boolean {
  try {
    const rawVersion = localStorage.getItem(STORAGE_VERSION_KEY);
    let version = rawVersion === null ? 0 : Number(rawVersion);
    if (!Number.isInteger(version) || version < 0) throw new Error('invalid storage version');
    if (version > CURRENT_STORAGE_VERSION) throw new Error('this data was created by a newer VibeCard');

    if (version < 1) {
      // v1 formalizes the existing keys without destructively rewriting the
      // owner's legacy profile.
      version = 1;
      localStorage.setItem(STORAGE_VERSION_KEY, String(version));
    }
    if (version < 2) {
      const profileRaw = localStorage.getItem('vibecard_profile');
      if (profileRaw) {
        const profile = JSON.parse(profileRaw);
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('invalid profile data');
        localStorage.setItem('vibecard_profile', JSON.stringify({
          ...profile,
          tags: Array.isArray(profile.tags) ? profile.tags : [],
          highlights: Array.isArray(profile.highlights) ? profile.highlights : [],
          contacts: Array.isArray(profile.contacts) ? profile.contacts : [],
          threads: Array.isArray(profile.threads) ? profile.threads : [],
        }));
      }
      version = 2;
      localStorage.setItem(STORAGE_VERSION_KEY, String(version));
    }
    return true;
  } catch (error) {
    try { recoverySnapshot(error); } catch {}
    return false;
  }
}

export function loadRecoverySnapshot(): unknown | null {
  try { return JSON.parse(localStorage.getItem(RECOVERY_STORAGE_KEY) || 'null'); } catch { return null; }
}
