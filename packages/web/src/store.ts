import { useCallback, useEffect, useState } from 'react';

export interface Contact {
  id: string;
  platform: string;
  value: string;
  url: string;
}

export interface Thread {
  id: string;
  content: string;
  images?: string[];
  tags: string[];
  timestamp: number;
  likes?: number;
  isLiked?: boolean;
  proofId?: string;
}

export interface Profile {
  name: string;
  handle: string;
  avatar: string;
  bio: string;
  mbti?: string;
  zodiac?: string;
  age?: string;
  location?: string;
  tags: { label: string; icon: string }[];
  /** Public, owner-approved ways this person can help. Added in v1 compatibly. */
  canHelpWith?: string[];
  lookingFor?: string;
  highlights: { id: number; title: string; type: string; icon: string; link: string }[];
  contacts?: Contact[];
  /**
   * Legacy v1 account fields. Wallet data is retained only so an existing
   * local profile can still be loaded and exported; the current Web client
   * neither renders nor mutates it.
   */
  verified: {
    wallet: string;
    walletProof?: { address: string; message: string; signature: string; signedAt: number };
    twitter: string;
    discord: string;
    wechat: string;
    telegram: string;
  };
  event?: string;
  threads: Thread[];
}

const DEFAULT_PROFILE: Profile = {
  name: '',
  handle: '',
  avatar: '',
  bio: '',
  tags: [],
  canHelpWith: [],
  lookingFor: '',
  highlights: [],
  contacts: [],
  verified: { wallet: '', twitter: '', discord: '', wechat: '', telegram: '' },
  event: '',
  threads: [],
};

function loadProfileFromStorage(): Profile {
  try {
    const stored = localStorage.getItem('vibecard_profile');
    if (!stored) return DEFAULT_PROFILE;

    const parsed = JSON.parse(stored);
    // Preserve the existing v1 migration from verified social accounts to
    // contact methods. Legacy wallet fields are deliberately not projected.
    if (!parsed.contacts) {
      parsed.contacts = [];
      if (parsed.verified?.twitter) {
        parsed.contacts.push({ id: 'legacy_twitter', platform: 'twitter', value: parsed.verified.twitter, url: `https://x.com/${parsed.verified.twitter.replace('@', '')}` });
      }
      if (parsed.verified?.discord) {
        parsed.contacts.push({ id: 'legacy_discord', platform: 'discord', value: parsed.verified.discord, url: '' });
      }
      if (parsed.verified?.wechat) {
        parsed.contacts.push({ id: 'legacy_wechat', platform: 'wechat', value: parsed.verified.wechat, url: '' });
      }
      if (parsed.verified?.telegram) {
        parsed.contacts.push({ id: 'legacy_telegram', platform: 'telegram', value: parsed.verified.telegram, url: `https://t.me/${parsed.verified.telegram.replace('@', '')}` });
      }
    }

    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      verified: { ...DEFAULT_PROFILE.verified, ...(parsed.verified ?? {}) },
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(loadProfileFromStorage);
  const [isSetup, setIsSetup] = useState(() => !!loadProfileFromStorage().name);

  useEffect(() => {
    localStorage.setItem('vibecard_profile', JSON.stringify(profile));
    setIsSetup(!!profile.name);
  }, [profile]);

  const updateProfile = useCallback((updates: Partial<Profile>) => {
    setProfile(previous => {
      const next = { ...previous, ...updates };
      // Owner-confirmed publishes must survive an immediate tab switch or
      // refresh, even if this hook instance unmounts right after the click.
      localStorage.setItem('vibecard_profile', JSON.stringify(next));
      setIsSetup(!!next.name);
      return next;
    });
  }, []);

  return { profile, updateProfile, isSetup };
}
