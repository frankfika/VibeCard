import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  MapPin, Zap, ExternalLink, AlertCircle, Loader2,
  Check, Copy, User, Shield,
} from 'lucide-react';
import { fetchFromIPFS, type ChainContent } from '../lib/web3/ipfs';
import { fetchLatestProfileHashFromChain } from '../lib/web3/chain';
import { shortAddress } from '../lib/web3/identity';
import type { Profile } from '../store';

const SUPPORTED_EMBED_CHAIN_IDS = [1, 8453, 42161, 137, 11155111, 84532, 421614, 80002, 31337];

function updateMeta(profile: Profile, address: string | null, cid: string | null) {
  const title = profile.name ? `${profile.name} · vibecard` : 'vibecard · 去中心化社交名片';
  const description = profile.bio || '一张卡片，连接无限可能';
  document.title = title;

  const setMeta = (selector: string, content: string) => {
    let el = document.querySelector(selector) as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement('meta');
      const prop = selector.match(/property="([^"]+)"/)?.[1];
      const name = selector.match(/name="([^"]+)"/)?.[1];
      if (prop) el.setAttribute('property', prop);
      if (name) el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.content = content;
  };

  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[name="twitter:description"]', description);

  const pageUrl = address
    ? `${window.location.origin}${window.location.pathname}?address=${address}`
    : cid
    ? `${window.location.origin}${window.location.pathname}?cid=${cid}`
    : window.location.href;
  setMeta('meta[property="og:url"]', pageUrl);
}

export default function EmbedCardPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const address = params.get('address')?.toLowerCase();
  const cid = params.get('cid');
  const chainIdParam = params.get('chainId');
  const preferredChainId = chainIdParam ? parseInt(chainIdParam, 10) : SUPPORTED_EMBED_CHAIN_IDS[0];

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedCid, setResolvedCid] = useState<string | null>(cid ?? null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      if (cid) {
        const content = await fetchFromIPFS(cid);
        if (content?.type === 'profile') {
          const data = content.data as Profile;
          setProfile(data);
          updateMeta(data, address, cid);
          setLoading(false);
          return;
        }
        setError('无法从 IPFS 读取该名片');
        setLoading(false);
        return;
      }

      if (address) {
        for (const chainId of SUPPORTED_EMBED_CHAIN_IDS) {
          const result = await fetchLatestProfileHashFromChain(address, chainId);
          if (result.ok && result.ipfsHash) {
            const content = await fetchFromIPFS(result.ipfsHash);
            if (content?.type === 'profile') {
              if (!cancelled) {
                const data = content.data as Profile;
                setProfile(data);
                setResolvedCid(result.ipfsHash);
                updateMeta(data, address, result.ipfsHash);
                setLoading(false);
              }
              return;
            }
          }
        }
        if (!cancelled) {
          setError('未找到该地址的链上名片，或合约尚未部署');
          setLoading(false);
        }
        return;
      }

      setError('缺少地址或 CID 参数');
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [address, cid]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm font-medium">正在加载链上名片...</span>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return <EmbedError message={error || '名片加载失败'} />;
  }

  return <EmbedProfileCard profile={profile} address={address} cid={resolvedCid} chainId={preferredChainId} />;
}

function EmbedProfileCard({
  profile,
  address,
  cid,
  chainId,
}: {
  profile: Profile;
  address: string | null;
  cid: string | null;
  chainId: number;
}) {
  const avatarUrl = profile.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${profile.name || 'vibecard'}&backgroundColor=transparent`;
  const appUrl = `${window.location.origin}${window.location.pathname}`;
  const pageUrl = address
    ? `${appUrl}?address=${address}&chainId=${chainId}`
    : cid
    ? `${appUrl}?cid=${cid}`
    : appUrl;

  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 md:p-10">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md rounded-[32px] border border-border/60 bg-card/80 backdrop-blur-xl shadow-2xl overflow-hidden"
      >
        <div className="relative h-32 bg-gradient-to-br from-foreground to-foreground/80">
          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
            <div className="w-24 h-24 rounded-[28px] border-4 border-background bg-secondary overflow-hidden shadow-lg">
              <img src={avatarUrl} loading="lazy" decoding="async" alt={profile.name} className="w-full h-full object-cover" />
            </div>
          </div>
        </div>

        <div className="pt-14 pb-6 px-6 text-center">
          <h1 className="text-[22px] font-black tracking-tight text-foreground">{profile.name || 'Anonymous'}</h1>
          {profile.handle && (
            <div className="text-[13px] font-semibold text-muted-foreground mt-1">@{profile.handle}</div>
          )}

          {address && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-[11px] font-bold text-muted-foreground">
              <Shield className="w-3 h-3" />
              {shortAddress(address)}
            </div>
          )}

          {profile.event && (
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/70 text-[12px] font-semibold text-foreground">
              <MapPin className="w-3.5 h-3.5" />
              {profile.event}
            </div>
          )}

          {profile.bio && (
            <p className="mt-4 text-[14px] font-medium text-muted-foreground leading-relaxed">
              {profile.bio}
            </p>
          )}

          {profile.tags?.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {profile.tags.slice(0, 6).map(tag => (
                <span
                  key={tag.label}
                  className="px-3 py-1 rounded-full text-[11px] font-bold bg-secondary text-foreground"
                >
                  {tag.label}
                </span>
              ))}
            </div>
          )}

          {profile.verified?.wallet && (
            <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-600">
              <Check className="w-3.5 h-3.5" />
              已验证钱包
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <div className="grid grid-cols-2 gap-3">
            <a
              href={appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 h-11 rounded-2xl bg-foreground text-background text-[13px] font-bold hover:opacity-90 transition-opacity"
            >
              <Zap className="w-4 h-4" />
              制作我的名片
            </a>
            <button
              onClick={copyLink}
              className="inline-flex items-center justify-center gap-2 h-11 rounded-2xl border border-border bg-background text-foreground text-[13px] font-bold hover:bg-secondary transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? '已复制' : '复制链接'}
            </button>
          </div>
        </div>
      </motion.div>

      <div className="mt-6 flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
        <User className="w-3.5 h-3.5" />
        vibecard · 去中心化社交名片
      </div>
    </div>
  );
}

function EmbedError({ message }: { message: string }) {
  const appUrl = `${window.location.origin}${window.location.pathname}`;
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-[17px] font-bold text-foreground mb-2">加载失败</h2>
        <p className="text-[13px] font-medium text-muted-foreground mb-6">{message}</p>
        <a
          href={appUrl}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background text-[13px] font-bold"
        >
          <ExternalLink className="w-4 h-4" />
          去创建名片
        </a>
      </div>
    </div>
  );
}
