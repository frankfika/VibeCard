import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin, Zap, Sparkles, Check, Wallet,
  ArrowRight, User, MessageCircle,
} from 'lucide-react';
import { useAccount } from 'wagmi';

import VisitorVibeChat from '../components/vibe/VisitorVibeChat';
import type { NowItem } from '@shared';
import { vibeFixtures } from '@shared';
import { NOW_TOPIC_LABELS, latestActiveNow, loadNowItems } from '../lib/now';

interface SharedProfile {
  name: string;
  handle: string;
  avatar: string;
  bio: string;
  mbti?: string;
  zodiac?: string;
  age?: string;
  location?: string;
  tags: { label: string; icon: string }[];
  lookingFor: string;
  event: string;
  /** Task 3.4: absent means enabled (backward compatible with old share links). */
  agentEnabled?: boolean;
  /**
   * Task 4.5: optional owner-published Now snapshot embedded at share time.
   * When absent (older links), the fixture demo falls back to the local
   * demo store; either way only published, non-expired items are shown.
   */
  nowItems?: NowItem[];
  /** Optional public current-focus text used for visitor Vibe grounding. */
  currentFocus?: string;
  highlights: { id: number; title: string; type: string; icon: string; link: string }[];
  threads: { id: string; content: string; images?: string[]; tags: string[]; timestamp: number }[];
  contacts?: { id?: string; platform: string; value: string; url: string }[];
  verified: {
    wallet: string;
    walletProof?: { address: string; message: string; signature: string; signedAt: number };
    twitter: string;
    discord: string;
    wechat: string;
    telegram: string;
  };
}

function decodeSharedProfile(param: string): SharedProfile | null {
  try {
    const base64 = param
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .replace(/\./g, '=');
    return JSON.parse(decodeURIComponent(atob(base64)));
  } catch {
    return null;
  }
}

function shortAddress(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function formatTime(ts: number) {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

function useSharedProfile() {
  const [profile, setProfile] = useState<SharedProfile | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [isFull, setIsFull] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isFullParam = params.get('view') === 'full';
    setIsFull(isFullParam);
    const idParam = params.get('id');
    const cParam = params.get('c');
    if (idParam) {
      setId(idParam);
      setLoadError(null);
      fetch(`/api/cards/${encodeURIComponent(idParam)}`)
        .then((r) => {
          if (r.status === 404) throw new Error('not_found');
          if (!r.ok) throw new Error(`http_${r.status}`);
          return r.json();
        })
        .then((data: { profile: SharedProfile }) => {
          if (data && data.profile) setProfile(data.profile);
          else setLoadError('invalid_payload');
        })
        .catch((e) => setLoadError(String(e?.message || e)));
    } else if (cParam) {
      setRaw(cParam);
      setProfile(decodeSharedProfile(cParam));
    }
  }, []);

  const buildUrl = (full?: boolean) => {
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set('id', id);
      url.searchParams.delete('c');
    } else if (raw) {
      url.searchParams.set('c', raw);
    } else {
      return '/';
    }
    if (full) url.searchParams.set('view', 'full');
    else url.searchParams.delete('view');
    return url.pathname + url.search;
  };

  return { profile, id, raw, isFull, buildUrl, loadError };
}

export default function PublicCardPage() {
  const { profile, raw, isFull, buildUrl, loadError } = useSharedProfile();
  const { address } = useAccount();
  const [showVibeChat, setShowVibeChat] = useState(false);

  if (!profile) {
    return (
      <div className="min-h-dvh bg-[#050505] text-white flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-5">
          <User className="w-7 h-7 text-white/40" />
        </div>
        <h1 className="text-[20px] font-black text-white mb-2">这张名片找不到了</h1>
        <p className="text-[14px] font-medium text-white/55 max-w-[300px] leading-relaxed mb-8">
          {loadError === 'not_found'
            ? '该名片可能已被删除, 或者链接地址写错了。'
            : '链接格式有误, 名片内容无法解析。你可以问问分享者重新发一次。'}
        </p>
        <div className="flex flex-col gap-3 w-full max-w-[280px]">
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-black rounded-2xl font-bold text-[15px] hover:opacity-90 transition-opacity"
          >
            <Sparkles className="w-5 h-5" />
            创建我的名片
          </a>
          <button
            type="button"
            onClick={() => {
              const subject = encodeURIComponent('vibecard 名片链接失效');
              const body = encodeURIComponent(`我打开了这个链接发现名片失效: ${typeof window !== 'undefined' ? window.location.href : ''}`);
              window.location.href = `mailto:hi@opencsg.com?subject=${subject}&body=${body}`;
            }}
            className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-white/5 text-white/80 rounded-2xl font-semibold text-[13px] hover:bg-white/10 transition-colors border border-white/10"
          >
            举报失效链接
          </button>
        </div>
      </div>
    );
  }

  const isOwner =
    !!address &&
    !!profile.verified?.wallet &&
    address.toLowerCase() === profile.verified.wallet.toLowerCase();

  const agentEnabled = profile.agentEnabled !== false;

  // Task 4.5: the public Now snapshot — newest 3 published, non-expired.
  // Embedded share snapshots win; the fixture demo falls back to the local
  // demo store so owner and visitor surfaces show the same published state.
  const nowSource = Array.isArray(profile.nowItems) ? profile.nowItems : loadNowItems();
  const activeNow = latestActiveNow(nowSource, Date.now(), 3);
  const currentFocus =
    typeof profile.currentFocus === 'string'
      ? profile.currentFocus
      : vibeFixtures.fixtureOwnerCard.currentFocus;

  const avatarUrl =
    profile.avatar ||
    `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(profile.name)}&backgroundColor=transparent`;

  return (
    <div className="min-h-dvh bg-[#050505] text-white flex flex-col relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[120%] aspect-square rounded-full bg-white/[0.04] blur-[120px]" />
        <div className="absolute top-[30%] -right-[10%] w-[60%] aspect-square rounded-full bg-indigo-500/10 blur-[100px]" />
      </div>

      <header className="relative z-10 px-5 sm:px-6 py-4 flex items-center justify-between shrink-0">
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
            <User className="w-4 h-4 text-black" />
          </div>
          <span className="font-black text-lg tracking-tight text-white">vibecard</span>
        </a>
        <a
          href="/"
          className={`text-[13px] font-bold px-4 py-2 rounded-full transition-all ${
            isOwner
              ? 'text-white bg-white/10 hover:bg-white hover:text-black'
              : 'text-black bg-white hover:opacity-90'
          }`}
        >
          {isOwner ? '管理我的名片' : '创建我的'}
        </a>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 sm:px-6 py-6">
        {isFull ? (
          <FullCardView
            profile={profile}
            avatarUrl={avatarUrl}
            isOwner={isOwner}
            agentEnabled={agentEnabled}
            nowItems={activeNow}
            simpleHref={buildUrl(false)}
            onChat={() => setShowVibeChat(true)}
          />
        ) : (
          <SimpleCardView
            profile={profile}
            avatarUrl={avatarUrl}
            isOwner={isOwner}
            agentEnabled={agentEnabled}
            nowItems={activeNow}
            fullHref={buildUrl(true)}
            onChat={() => setShowVibeChat(true)}
          />
        )}
      </main>

      <AnimatePresence>
        {showVibeChat && (
          <VisitorVibeChat
            ownerName={profile.name || '他'}
            nowItems={activeNow}
            currentFocus={currentFocus}
            onClose={() => setShowVibeChat(false)}
          />
        )}
      </AnimatePresence>

      <footer className="relative z-10 shrink-0 px-5 sm:px-6 py-5">
        <a
          href="/"
          className="tap-target w-full py-4 bg-white rounded-2xl font-bold text-[15px] text-black active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-xl shadow-white/10"
        >
          <Sparkles className="w-5 h-5 text-black" />
          {isOwner ? '管理我的 Web3 社交名片' : '一键创建我的 Web3 社交名片'}
        </a>
      </footer>
    </div>
  );
}

/** Task 4.5: the public 最近动态 list. Empty state renders nothing — no
 *  invented recent activity. Items are pre-filtered to the active snapshot. */
function PublicNowList({ items }: { items: NowItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-5 text-left" data-testid="public-now-section">
      <h3 className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-2">最近动态</h3>
      <ul className="space-y-2">
        {items.map(item => (
          <li
            key={item.id}
            data-testid="public-now-item"
            className="flex items-start gap-2.5 rounded-[14px] bg-white/[0.05] border border-white/10 px-3 py-2.5"
          >
            <span className="shrink-0 mt-0.5 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/60">
              {NOW_TOPIC_LABELS[item.topic]}
            </span>
            <span className="text-[13px] font-medium text-white/90 leading-relaxed">{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SimpleCardView({
  profile,
  avatarUrl,
  isOwner,
  agentEnabled,
  nowItems,
  fullHref,
  onChat,
}: {
  profile: SharedProfile;
  avatarUrl: string;
  isOwner: boolean;
  agentEnabled: boolean;
  nowItems: NowItem[];
  fullHref: string;
  onChat: () => void;
}) {
  const tags = profile.tags?.slice(0, 4) ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full max-w-sm"
    >
      <div className="rounded-[32px] border border-white/10 bg-white/[0.06] backdrop-blur-2xl shadow-2xl overflow-hidden">
        <div className="relative h-28 bg-gradient-to-br from-white/15 to-white/5">
          <div className="absolute -bottom-14 left-1/2 -translate-x-1/2">
            <div className="w-28 h-28 rounded-[30px] border-[4px] border-[#050505] bg-[#111] overflow-hidden shadow-xl">
              <img
                src={avatarUrl}
                alt={profile.name}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </div>

        <div className="pt-16 pb-7 px-6 text-center">
          <h1 className="text-[26px] font-black tracking-tight text-white mb-1">
            {profile.name || 'Anonymous'}
          </h1>
          {profile.handle && (
            <div className="text-[14px] font-semibold text-white/55">@{profile.handle}</div>
          )}

          {profile.verified?.wallet && profile.verified.walletProof && (
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-400 border border-emerald-500/25" title="该钱包已通过签名验证">
              <Check className="w-3 h-3" />
              <Wallet className="w-3 h-3" />
              {shortAddress(profile.verified.wallet)}
            </div>
          )}

          {/* Task 0.4 privacy: contact details are never shown on the public
              card. They unlock only after the owner accepts a connection
              (the server-side public projection lands in task 2.1). */}

          {tags.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {tags.map(tag => (
                <span
                  key={tag.label}
                  className="px-3 py-1.5 rounded-full text-[12px] font-bold bg-white/8 border border-white/10 text-white/90"
                >
                  {tag.label}
                </span>
              ))}
            </div>
          )}

          {profile.bio && (
            <p className="mt-5 text-[14px] font-medium text-white/60 leading-relaxed line-clamp-3">
              {profile.bio}
            </p>
          )}

          <PublicNowList items={nowItems} />
        </div>

        <div className="px-5 pb-6 space-y-2.5">
          {agentEnabled ? (
            <button
              type="button"
              onClick={onChat}
              data-testid="chat-with-vibe"
              className="tap-target w-full py-4 bg-white rounded-2xl font-bold text-[15px] text-black active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              先和我的分身聊聊
            </button>
          ) : (
            <div
              data-testid="vibe-disabled"
              className="w-full py-4 rounded-2xl border border-white/10 bg-white/[0.04] text-center text-[13px] font-semibold text-white/45"
            >
              他的分身暂时在休息，改天再来吧。
            </div>
          )}
          <a
            href={fullHref}
            className="tap-target w-full py-3.5 bg-white/10 border border-white/10 rounded-2xl font-bold text-[14px] text-white active:scale-[0.98] transition-all flex items-center justify-center gap-2 hover:bg-white/15"
          >
            查看完整名片
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>

      <p className="text-center text-[12px] font-medium text-white/30 mt-4">扫码或点击卡片查看完整身份与高光时刻</p>
    </motion.div>
  );
}

function FullCardView({
  profile,
  avatarUrl,
  isOwner,
  agentEnabled,
  nowItems,
  simpleHref,
  onChat,
}: {
  profile: SharedProfile;
  avatarUrl: string;
  isOwner: boolean;
  agentEnabled: boolean;
  nowItems: NowItem[];
  simpleHref: string;
  onChat: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="w-full max-w-md"
    >
      <div className="rounded-[32px] border border-white/10 bg-white/[0.06] backdrop-blur-2xl shadow-2xl overflow-hidden">
        <div className="relative h-32 bg-gradient-to-br from-white/15 to-white/5">
          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
            <div className="w-24 h-24 rounded-[28px] border-[4px] border-[#050505] bg-[#111] overflow-hidden shadow-xl">
              <img
                src={avatarUrl}
                alt={profile.name}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </div>

        <div className="pt-14 pb-6 px-6 text-center">
          <h1 className="text-[22px] font-black tracking-tight text-white mb-1">{profile.name || 'Anonymous'}</h1>
          {profile.handle && (
            <div className="text-[13px] font-semibold text-white/55 mt-1">@{profile.handle}</div>
          )}

          {profile.verified?.wallet && profile.verified.walletProof && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-400 border border-emerald-500/25" title="该钱包已通过签名验证">
              <Check className="w-3 h-3" />
              <Wallet className="w-3 h-3" />
              {shortAddress(profile.verified.wallet)}
            </div>
          )}

          {profile.event && (
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/8 text-[12px] font-semibold text-white/80">
              <MapPin className="w-3.5 h-3.5" />
              {profile.event}
            </div>
          )}

          {/* Task 0.4 privacy: no contact details on the public card; see
              SimpleCardView note. */}

          {profile.bio && (
            <p className="mt-4 text-[14px] font-medium text-white/65 leading-relaxed">{profile.bio}</p>
          )}

          {profile.tags?.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {profile.tags.map(tag => (
                <span
                  key={tag.label}
                  className="px-3 py-1 rounded-full text-[12px] font-bold bg-white/8 border border-white/10 text-white/90"
                >
                  {tag.label}
                </span>
              ))}
            </div>
          )}

          {(profile.mbti || profile.zodiac || profile.age || profile.location) && (
            <div className="mt-5 flex flex-wrap justify-start gap-2">
              {profile.mbti && (
                <span className="px-3 py-1.5 rounded-full text-[12px] font-black bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm border border-indigo-400/20">
                  {profile.mbti}
                </span>
              )}
              {profile.zodiac && (
                <span className="px-3 py-1.5 rounded-full text-[12px] font-bold bg-white/10 text-white border border-white/5 shadow-sm backdrop-blur-sm">
                  {profile.zodiac}
                </span>
              )}
              {profile.age && (
                <span className="px-3 py-1.5 rounded-full text-[12px] font-bold bg-white/10 text-white border border-white/5 shadow-sm backdrop-blur-sm">
                  {profile.age}
                </span>
              )}
              {profile.location && (
                <span className="px-3 py-1.5 rounded-full text-[12px] font-bold bg-white/10 text-white border border-white/5 shadow-sm backdrop-blur-sm flex items-center gap-1">
                  <MapPin className="w-3 h-3 opacity-70" />
                  {profile.location.replace('📍 ', '')}
                </span>
              )}
            </div>
          )}

          {profile.highlights?.length > 0 && (
            <div className="mt-5 text-left">
              <h3 className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-2">Highlights</h3>
              <div className="space-y-2">
                {profile.highlights.filter(h => h.title).map(item => (
                  <div
                    key={item.id}
                    className="bg-white/[0.05] rounded-[14px] p-3 flex items-center gap-3 border border-white/10"
                  >
                    <div className="w-9 h-9 rounded-[10px] bg-white/10 flex items-center justify-center text-[16px]">
                      {item.icon}
                    </div>
                    <div className="text-[13px] font-semibold text-white">{item.title}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Task 4.5: owner-confirmed recent updates, before legacy threads. */}
          <PublicNowList items={nowItems} />

          {/* Threads Box */}
          {profile.threads?.length > 0 && (
            <div className="md:col-span-2 bg-white/[0.04] backdrop-blur-2xl border border-white/10 shadow-sm rounded-[24px] p-5 sm:p-6">
              <h3 className="text-[11px] sm:text-[12px] font-bold uppercase tracking-widest text-white/50 mb-5">个人动态</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {profile.threads.slice(0, 2).map(thread => (
                  <div key={thread.id} className="bg-white/[0.04] rounded-[18px] p-5 border border-white/10 relative group hover:bg-white/[0.06] transition-colors">
                    <div className="flex items-center gap-2 mb-3">
                    <img 
                      src={profile.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${profile.name || 'default'}&backgroundColor=transparent`} 
                      alt={profile.name} 
                      className="w-6 h-6 rounded-full bg-white/10 border border-white/10" 
                    />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-bold text-white/90">{profile.name || 'Anonymous'}</span>
                      <span className="text-[10px] font-bold text-white/40 bg-white/5 px-2 py-0.5 rounded-md">{formatTime(thread.timestamp)}</span>
                    </div>
                  </div>
                    <p className="text-[14px] font-medium text-white/90 leading-relaxed line-clamp-3 mb-4 whitespace-pre-wrap">
                      {thread.content}
                    </p>
                    {thread.images && thread.images.length > 0 && (
                      <div className={`grid gap-2 mb-4 ${thread.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {thread.images.slice(0, 2).map((img, idx) => (
                          <div key={idx} className={`rounded-[14px] overflow-hidden bg-white/5 border border-white/5 ${thread.images!.length === 1 ? 'aspect-video' : 'aspect-square'}`}>
                            <img src={img} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" decoding="async" />
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 mt-auto">
                      {thread.tags?.map(tag => (
                        <span key={tag} className="text-[10px] font-bold text-white/60 bg-white/10 px-2 py-1 rounded-md">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-6 space-y-2.5">
          {agentEnabled ? (
            <button
              type="button"
              onClick={onChat}
              data-testid="chat-with-vibe-full"
              className="tap-target w-full py-4 bg-white rounded-2xl font-bold text-[15px] text-black active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              先和我的分身聊聊
            </button>
          ) : (
            <div
              data-testid="vibe-disabled"
              className="w-full py-4 rounded-2xl border border-white/10 bg-white/[0.04] text-center text-[13px] font-semibold text-white/45"
            >
              他的分身暂时在休息，改天再来吧。
            </div>
          )}
          <a
            href={simpleHref}
            className="tap-target w-full py-3.5 bg-white/10 border border-white/10 rounded-2xl font-bold text-[14px] text-white active:scale-[0.98] transition-all flex items-center justify-center gap-2 hover:bg-white/15"
          >
            切换简洁名片视图
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}
