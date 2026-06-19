import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  MapPin, Zap, Sparkles, Check, Wallet,
  ArrowRight, User,
} from 'lucide-react';
import { useAccount } from 'wagmi';

interface SharedProfile {
  name: string;
  handle: string;
  avatar: string;
  bio: string;
  tags: { label: string; icon: string }[];
  lookingFor: string;
  event: string;
  highlights: { id: number; title: string; type: string; icon: string; link: string }[];
  threads: { id: string; content: string; images?: string[]; tags: string[]; timestamp: number }[];
  verified: {
    wallet: string;
    twitter: string;
    discord: string;
    wechat: string;
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
  const [raw, setRaw] = useState<string | null>(null);
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get('c');
    setRaw(c);
    setIsFull(params.get('view') === 'full');
    if (c) {
      setProfile(decodeSharedProfile(c));
    }
  }, []);

  const buildUrl = (full?: boolean) => {
    if (!raw) return '/';
    const url = new URL(window.location.href);
    url.searchParams.set('c', raw);
    if (full) url.searchParams.set('view', 'full');
    else url.searchParams.delete('view');
    return url.pathname + url.search;
  };

  return { profile, raw, isFull, buildUrl };
}

export default function PublicCardPage() {
  const { profile, raw, isFull, buildUrl } = useSharedProfile();
  const { address } = useAccount();

  if (!profile) {
    return (
      <div className="min-h-dvh bg-[#050505] text-white flex flex-col items-center justify-center px-6">
        <div className="text-[48px] mb-4 opacity-20 font-black">?</div>
        <p className="text-[16px] font-semibold text-white/60">名片链接已失效或格式错误</p>
        <a
          href="/"
          className="mt-8 inline-flex items-center gap-2 px-7 py-3.5 bg-white text-black rounded-2xl font-bold text-[15px] hover:opacity-90 transition-opacity"
        >
          <Sparkles className="w-5 h-5" />
          创建我的名片
        </a>
      </div>
    );
  }

  const isOwner =
    !!address &&
    !!profile.verified?.wallet &&
    address.toLowerCase() === profile.verified.wallet.toLowerCase();

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
            simpleHref={buildUrl(false)}
          />
        ) : (
          <SimpleCardView
            profile={profile}
            avatarUrl={avatarUrl}
            isOwner={isOwner}
            fullHref={buildUrl(true)}
          />
        )}
      </main>

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

function SimpleCardView({
  profile,
  avatarUrl,
  isOwner,
  fullHref,
}: {
  profile: SharedProfile;
  avatarUrl: string;
  isOwner: boolean;
  fullHref: string;
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
            <div className="text-[14px] font-semibold text-white/55">{profile.handle}</div>
          )}

          {profile.verified?.wallet && (
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-400 border border-emerald-500/25">
              <Check className="w-3 h-3" />
              <Wallet className="w-3 h-3" />
              {shortAddress(profile.verified.wallet)}
            </div>
          )}

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
        </div>

        <div className="px-5 pb-6">
          <a
            href={fullHref}
            className="tap-target w-full py-4 bg-white rounded-2xl font-bold text-[15px] text-black active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {isOwner ? '查看完整名片' : '查看完整名片'}
            <ArrowRight className="w-5 h-5" />
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
  simpleHref,
}: {
  profile: SharedProfile;
  avatarUrl: string;
  isOwner: boolean;
  simpleHref: string;
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

          {profile.verified?.wallet && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-400 border border-emerald-500/25">
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

          {profile.lookingFor && (
            <div className="mt-5 bg-white/[0.06] rounded-[20px] p-4 flex gap-3 items-center border border-white/10">
              <div className="w-10 h-10 rounded-[14px] bg-white flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-black" />
              </div>
              <div className="text-left">
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-0.5">Looking for</div>
                <div className="text-[14px] font-bold text-white">{profile.lookingFor}</div>
              </div>
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

          {profile.threads?.length > 0 && (
            <div className="mt-5 text-left">
              <h3 className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-2">最新动态</h3>
              <div className="space-y-3">
                {profile.threads.slice(0, 2).map(thread => (
                  <div
                    key={thread.id}
                    className="bg-white/[0.05] rounded-[18px] p-4 border border-white/10"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] font-bold text-white/40">{formatTime(thread.timestamp)}</span>
                      {thread.tags?.map(tag => (
                        <span key={tag} className="text-[10px] font-bold text-white/50 bg-white/10 px-2 py-0.5 rounded-md">
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <p className="text-[14px] font-medium text-white/80 leading-relaxed line-clamp-4">
                      {thread.content}
                    </p>
                    {thread.images && thread.images.length > 0 && (
                      <div className={`grid gap-2 mt-3 ${thread.images.length === 1 ? 'grid-cols-1' : thread.images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        {thread.images.map((img, idx) => (
                          <div key={idx} className={`rounded-xl overflow-hidden bg-white/5 ${thread.images!.length === 1 ? 'aspect-video' : 'aspect-square'}`}>
                            <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-6">
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
