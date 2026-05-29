import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './lib/web3/config';
import { uploadToIPFS, fetchFromIPFS, computeContentHash, type ChainContent } from './lib/web3/ipfs';
import { emit as chainEmit } from './lib/chain/chain';

export interface Profile {
  name: string;
  handle: string;
  avatar: string;
  bio: string;
  tags: { label: string; icon: string }[];
  lookingFor: string;
  highlights: { id: number; title: string; type: string; icon: string; link: string }[];
  verified: {
    wallet: string;
    twitter: string;
    discord: string;
    wechat: string;
  };
  event: string;
}

export interface GameSession {
  presetId: string | null;
  selectedTags: string[];
  history: string[];
  favorites: string[];
}

export interface Activity {
  id: string;
  title: string;
  category: string;
  subcategory: string;
  location: string;
  time: string;
  participants: number;
  maxParticipants: number;
  creator: string;
  avatar: string;
  description: string;
  joined: boolean;
}

export interface SyncStatus {
  isSynced: boolean;
  lastSyncAt: number | null;
  ipfsHash: string | null;
  txHash: string | null;
  chainId: number | null;
}

const DEFAULT_PROFILE: Profile = {
  name: '',
  handle: '',
  avatar: '',
  bio: '',
  tags: [],
  lookingFor: '',
  highlights: [],
  verified: { wallet: '', twitter: '', discord: '', wechat: '' },
  event: '',
};

const DEFAULT_GAME_SESSION: GameSession = {
  presetId: null,
  selectedTags: [],
  history: [],
  favorites: [],
};

const DEFAULT_SYNC_STATUS: SyncStatus = {
  isSynced: false,
  lastSyncAt: null,
  ipfsHash: null,
  txHash: null,
  chainId: null,
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored);
  } catch {}
  return fallback;
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(() =>
    loadFromStorage('vibecard_profile', DEFAULT_PROFILE)
  );
  const [isSetup, setIsSetup] = useState(() => {
    return !!loadFromStorage('vibecard_profile', DEFAULT_PROFILE).name;
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    loadFromStorage('vibecard_profile_sync', DEFAULT_SYNC_STATUS)
  );
  const initialNameRef = useRef(profile.name);

  const { address, chainId } = useAccount();
  const { writeContractAsync } = useWriteContract();

  useEffect(() => {
    localStorage.setItem('vibecard_profile', JSON.stringify(profile));
    setIsSetup(!!profile.name);
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('vibecard_profile_sync', JSON.stringify(syncStatus));
  }, [syncStatus]);

  const updateProfile = useCallback((updates: Partial<Profile>) => {
    setProfile(prev => {
      const next = { ...prev, ...updates };
      const isFirstCreate = !initialNameRef.current && next.name;
      if (isFirstCreate) {
        initialNameRef.current = next.name;
        chainEmit('profile.create', { name: next.name }).catch(() => {});
      } else if (initialNameRef.current) {
        const changedKeys = Object.keys(updates);
        chainEmit('profile.update', { fields: changedKeys }).catch(() => {});
      }
      return next;
    });
    setSyncStatus(prev => ({ ...prev, isSynced: false }));
  }, []);

  const syncToChain = useCallback(async (): Promise<boolean> => {
    if (!address || !chainId) return false;
    const contractAddr = CONTRACT_ADDRESS[chainId];
    if (!contractAddr || contractAddr === '0x0000000000000000000000000000000000000000') {
      console.warn('Contract not deployed on chain', chainId);
      return false;
    }

    try {
      const content: ChainContent = {
        version: '1.0',
        app: 'vibecard',
        type: 'profile',
        data: profile,
        timestamp: Date.now(),
      };

      const contentJson = JSON.stringify(content);
      const [ipfsHash, contentHash] = await Promise.all([
        uploadToIPFS(content),
        computeContentHash(contentJson),
      ]);

      const txHash = await writeContractAsync({
        address: contractAddr,
        abi: CONTRACT_ABI as any,
        functionName: 'publish',
        args: ['profile', ipfsHash, contentHash],
      } as any);

      setSyncStatus({
        isSynced: true,
        lastSyncAt: Date.now(),
        ipfsHash,
        txHash,
        chainId,
      });

      return true;
    } catch (error) {
      console.error('Failed to sync profile to chain:', error);
      return false;
    }
  }, [address, chainId, profile, writeContractAsync]);

  const loadFromChain = useCallback(async (): Promise<boolean> => {
    if (!address || !chainId) return false;
    const contractAddr = CONTRACT_ADDRESS[chainId];
    if (!contractAddr || contractAddr === '0x0000000000000000000000000000000000000000') {
      return false;
    }

    try {
      const response = await fetch(`${getRpcUrl(chainId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [
            {
              to: contractAddr,
              data: encodeGetLatestProfile(address),
            },
            'latest',
          ],
        }),
      });

      const result = await response.json();
      if (result.result && result.result !== '0x') {
        const ipfsHash = decodeStringResult(result.result);
        if (ipfsHash) {
          const content = await fetchFromIPFS(ipfsHash);
          if (content && content.type === 'profile') {
            setProfile(content.data as Profile);
            setSyncStatus({
              isSynced: true,
              lastSyncAt: Date.now(),
              ipfsHash,
              txHash: null,
              chainId,
            });
            return true;
          }
        }
      }
      return false;
    } catch (error) {
      console.error('Failed to load profile from chain:', error);
      return false;
    }
  }, [address, chainId]);

  return { profile, updateProfile, isSetup, syncStatus, syncToChain, loadFromChain };
}

export function useGameSession() {
  const [session, setSession] = useState<GameSession>(() =>
    loadFromStorage('vibecard_game', DEFAULT_GAME_SESSION)
  );

  useEffect(() => {
    localStorage.setItem('vibecard_game', JSON.stringify(session));
  }, [session]);

  const addToHistory = useCallback((cardId: string) => {
    setSession(prev => ({
      ...prev,
      history: [...prev.history.filter(id => id !== cardId), cardId],
    }));
    chainEmit('card.draw', { cardId }).catch(() => {});
  }, []);

  const toggleFavorite = useCallback((cardId: string) => {
    setSession(prev => ({
      ...prev,
      favorites: prev.favorites.includes(cardId)
        ? prev.favorites.filter(id => id !== cardId)
        : [...prev.favorites, cardId],
    }));
    chainEmit('card.favorite', { cardId }).catch(() => {});
  }, []);

  const resetHistory = useCallback(() => {
    setSession(prev => ({ ...prev, history: [] }));
  }, []);

  return { session, setSession, addToHistory, toggleFavorite, resetHistory };
}

export function useActivities() {
  const [activities, setActivities] = useState<Activity[]>(() =>
    loadFromStorage('vibecard_activities', [])
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    loadFromStorage('vibecard_activities_sync', DEFAULT_SYNC_STATUS)
  );

  const { address, chainId } = useAccount();
  const { writeContractAsync } = useWriteContract();

  useEffect(() => {
    localStorage.setItem('vibecard_activities', JSON.stringify(activities));
  }, [activities]);

  useEffect(() => {
    localStorage.setItem('vibecard_activities_sync', JSON.stringify(syncStatus));
  }, [syncStatus]);

  const addActivity = useCallback((activity: Omit<Activity, 'id' | 'participants' | 'joined'>) => {
    const newActivity: Activity = {
      ...activity,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      participants: 1,
      joined: true,
    };
    setActivities(prev => [newActivity, ...prev]);
    setSyncStatus(prev => ({ ...prev, isSynced: false }));
    chainEmit('activity.create', { id: newActivity.id, title: newActivity.title, category: newActivity.category }).catch(() => {});
    return newActivity;
  }, []);

  const joinActivity = useCallback((id: string) => {
    setActivities(prev => prev.map(a =>
      a.id === id && !a.joined
        ? { ...a, participants: a.participants + 1, joined: true }
        : a
    ));
    chainEmit('activity.join', { id }).catch(() => {});
  }, []);

  const leaveActivity = useCallback((id: string) => {
    setActivities(prev => prev.map(a =>
      a.id === id && a.joined
        ? { ...a, participants: Math.max(0, a.participants - 1), joined: false }
        : a
    ));
    chainEmit('activity.leave', { id }).catch(() => {});
  }, []);

  const syncToChain = useCallback(async (): Promise<boolean> => {
    if (!address || !chainId) return false;
    const contractAddr = CONTRACT_ADDRESS[chainId];
    if (!contractAddr || contractAddr === '0x0000000000000000000000000000000000000000') {
      return false;
    }

    try {
      const content: ChainContent = {
        version: '1.0',
        app: 'vibecard',
        type: 'activity',
        data: activities,
        timestamp: Date.now(),
      };

      const contentJson = JSON.stringify(content);
      const [ipfsHash, contentHash] = await Promise.all([
        uploadToIPFS(content),
        computeContentHash(contentJson),
      ]);

      const txHash = await writeContractAsync({
        address: contractAddr,
        abi: CONTRACT_ABI as any,
        functionName: 'publish',
        args: ['activity', ipfsHash, contentHash],
      } as any);

      setSyncStatus({
        isSynced: true,
        lastSyncAt: Date.now(),
        ipfsHash,
        txHash,
        chainId,
      });

      return true;
    } catch (error) {
      console.error('Failed to sync activities to chain:', error);
      return false;
    }
  }, [address, chainId, activities, writeContractAsync]);

  return { activities, addActivity, joinActivity, leaveActivity, syncStatus, syncToChain };
}

function getRpcUrl(chainId: number): string {
  const urls: Record<number, string> = {
    11155111: 'https://rpc.sepolia.org',
    84532: 'https://sepolia.base.org',
    421614: 'https://sepolia-rollup.arbitrum.io/rpc',
    80002: 'https://rpc-amoy.polygon.technology',
  };
  return urls[chainId] || '';
}

function encodeGetLatestProfile(address: string): string {
  const methodId = '0x9bd2c0e7';
  const paddedAddress = address.toLowerCase().replace('0x', '').padStart(64, '0');
  return methodId + paddedAddress;
}

function decodeStringResult(hex: string): string | null {
  try {
    if (hex === '0x' || hex.length < 130) return null;
    const offset = parseInt(hex.slice(2, 66), 16) * 2;
    const length = parseInt(hex.slice(66, 130), 16) * 2;
    if (offset + 64 + length > hex.length * 2) return null;
    const strHex = hex.slice(130 + offset, 130 + offset + length);
    if (!strHex) return null;
    const bytes = [];
    for (let i = 0; i < strHex.length; i += 2) {
      bytes.push(parseInt(strHex.slice(i, i + 2), 16));
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}
