import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI, chainNames } from './lib/web3/config';
import { uploadToIPFS, fetchFromIPFS, computeContentHash, type ChainContent } from './lib/web3/ipfs';
import { emit as chainEmit } from './lib/chain/chain';
import { award as awardPoints } from './lib/web3/points';
import { useToast } from './components/ui/ToastProvider';

export interface Contact {
  id: string;
  platform: string;
  value: string;
  url: string;
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
  lookingFor?: string;
  highlights: { id: number; title: string; type: string; icon: string; link: string }[];
  contacts?: Contact[];
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
  contacts: [],
  verified: { wallet: '', walletProof: undefined, twitter: '', discord: '', wechat: '', telegram: '' },
  event: '',
  threads: [],
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

function loadProfileFromStorage(): Profile {
  try {
    const stored = localStorage.getItem('vibecard_profile');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Migration: migrate old verified to contacts
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
      return { ...DEFAULT_PROFILE, ...parsed };
    }
  } catch {}
  return DEFAULT_PROFILE;
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(() =>
    loadProfileFromStorage()
  );
  const [isSetup, setIsSetup] = useState(() => {
    return !!loadProfileFromStorage().name;
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    loadFromStorage('vibecard_profile_sync', DEFAULT_SYNC_STATUS)
  );
  const initialNameRef = useRef(profile.name);

  const { address, chainId } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const toast = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('vibecard_profile', JSON.stringify(profile));
      setIsSetup(!!profile.name);
    }, 300);
    return () => clearTimeout(timer);
  }, [profile]);

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('vibecard_profile_sync', JSON.stringify(syncStatus));
    }, 300);
    return () => clearTimeout(timer);
  }, [syncStatus]);

  const updateProfile = useCallback((updates: Partial<Profile>) => {
    setProfile(prev => {
      const next = { ...prev, ...updates };
      const isFirstCreate = !initialNameRef.current && next.name;
      if (isFirstCreate) {
        initialNameRef.current = next.name;
        chainEmit('profile.create', { name: next.name }).catch(() => {});
        awardPoints('create_profile');
      } else if (initialNameRef.current) {
        const changedKeys = Object.keys(updates);
        chainEmit('profile.update', { fields: changedKeys }).catch(() => {});
      }
      return next;
    });
    setSyncStatus(prev => ({ ...prev, isSynced: false }));
  }, []);

  const syncToChain = useCallback(async (): Promise<boolean> => {
    if (!address || !chainId) {
      toast.show({ title: '未连接钱包', message: '请先连接钱包后再同步到链上。', type: 'error' });
      return false;
    }
    const contractAddr = CONTRACT_ADDRESS[chainId];
    if (!isChainConfigured(chainId, contractAddr)) {
      toast.show({
        title: '网络未部署',
        message: `${chainNames[chainId] ?? '当前网络'} 尚未部署合约，请切换到已部署的测试网。`,
        type: 'error',
      });
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

      const txHash = await toast.promise(
        writeContractAsync({
          address: contractAddr,
          abi: CONTRACT_ABI as any,
          functionName: 'publish',
          args: ['profile', ipfsHash, contentHash],
        } as any),
        {
          loading: '正在将名片数据上传到 IPFS 并提交链上交易...',
          success: '名片已成功同步到链上！',
          error: (err) => `同步失败：${(err as Error)?.message ?? '未知错误'}`,
        }
      );

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
  }, [address, chainId, profile, writeContractAsync, toast]);

  const loadFromChain = useCallback(async (): Promise<boolean> => {
    if (!address || !chainId) {
      toast.show({ title: '未连接钱包', message: '请先连接钱包以读取链上名片。', type: 'error' });
      return false;
    }
    const contractAddr = CONTRACT_ADDRESS[chainId];
    if (!isChainConfigured(chainId, contractAddr)) {
      toast.show({
        title: '网络未部署',
        message: `${chainNames[chainId] ?? '当前网络'} 尚未部署合约。`,
        type: 'error',
      });
      return false;
    }

    const rpcUrl = getRpcUrl(chainId);
    if (!rpcUrl) {
      toast.show({ title: 'RPC 不可用', message: '当前网络没有可用的 RPC 节点。', type: 'error' });
      return false;
    }

    const toastId = toast.show({ message: '正在从链上读取名片...', type: 'loading', duration: 0 });

    try {
      const response = await fetch(rpcUrl, {
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

      if (!response.ok) {
        throw new Error(`RPC HTTP error: ${response.status}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(`RPC error: ${result.error.message || JSON.stringify(result.error)}`);
      }

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
            toast.update(toastId, { message: '链上名片已恢复', type: 'success', duration: 3000 });
            setTimeout(() => toast.dismiss(toastId), 3000);
            return true;
          }
        }
      }
      toast.update(toastId, { message: '链上暂无名片数据', type: 'info', duration: 3000 });
      setTimeout(() => toast.dismiss(toastId), 3000);
      return false;
    } catch (error) {
      console.error('Failed to load profile from chain:', error);
      toast.update(toastId, {
        message: `读取失败：${(error as Error)?.message ?? '未知错误'}`,
        type: 'error',
        duration: 5000,
      });
      setTimeout(() => toast.dismiss(toastId), 5000);
      return false;
    }
  }, [address, chainId, toast]);

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
    awardPoints('interaction'); // cooldown + daily limit enforced internally
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
  const toast = useToast();

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
    awardPoints('activity_host');
    return newActivity;
  }, []);

  const joinActivity = useCallback((id: string) => {
    setActivities(prev => prev.map(a =>
      a.id === id && !a.joined
        ? { ...a, participants: a.participants + 1, joined: true }
        : a
    ));
    chainEmit('activity.join', { id }).catch(() => {});
    awardPoints('activity_join');
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
    if (!address || !chainId) {
      toast.show({ title: '未连接钱包', message: '请先连接钱包后再同步到链上。', type: 'error' });
      return false;
    }
    const contractAddr = CONTRACT_ADDRESS[chainId];
    if (!isChainConfigured(chainId, contractAddr)) {
      toast.show({
        title: '网络未部署',
        message: `${chainNames[chainId] ?? '当前网络'} 尚未部署合约，请切换到已部署的测试网。`,
        type: 'error',
      });
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

      const txHash = await toast.promise(
        writeContractAsync({
          address: contractAddr,
          abi: CONTRACT_ABI as any,
          functionName: 'publish',
          args: ['activity', ipfsHash, contentHash],
        } as any),
        {
          loading: '正在将活动数据上传到 IPFS 并提交链上交易...',
          success: '活动列表已成功同步到链上！',
          error: (err) => `同步失败：${(err as Error)?.message ?? '未知错误'}`,
        }
      );

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
  }, [address, chainId, activities, writeContractAsync, toast]);

  return { activities, addActivity, joinActivity, leaveActivity, syncStatus, syncToChain };
}

function getRpcUrl(chainId: number): string {
  const alchemyKey = import.meta.env?.VITE_ALCHEMY_KEY as string | undefined;
  const urls: Record<number, string> = {
    11155111: alchemyKey
      ? `https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`
      : 'https://rpc.sepolia.org',
    84532: alchemyKey
      ? `https://base-sepolia.g.alchemy.com/v2/${alchemyKey}`
      : 'https://sepolia.base.org',
    421614: alchemyKey
      ? `https://arb-sepolia.g.alchemy.com/v2/${alchemyKey}`
      : 'https://sepolia-rollup.arbitrum.io/rpc',
    80002: alchemyKey
      ? `https://polygon-amoy.g.alchemy.com/v2/${alchemyKey}`
      : 'https://rpc-amoy.polygon.technology',
    31337: 'http://127.0.0.1:8545',
  };
  return urls[chainId] || '';
}

function isChainConfigured(chainId: number, contractAddr?: string): boolean {
  if (!contractAddr) return false;
  if (contractAddr === '0x0000000000000000000000000000000000000000') return false;
  return !!getRpcUrl(chainId);
}

function encodeGetLatestProfile(address: string): string {
  const methodId = '0x9bd2c0e7';
  const paddedAddress = address.toLowerCase().replace('0x', '').padStart(64, '0');
  return methodId + paddedAddress;
}

function decodeStringResult(hex: string): string | null {
  try {
    if (hex === '0x' || hex.length < 130) return null;
    const offsetBytes = parseInt(hex.slice(2, 66), 16);
    const lengthBytes = parseInt(hex.slice(66, 130), 16);
    const dataStartHex = 2 + (offsetBytes + 32) * 2;
    const dataLengthHex = lengthBytes * 2;
    if (dataStartHex + dataLengthHex > hex.length) return null;
    const strHex = hex.slice(dataStartHex, dataStartHex + dataLengthHex);
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
