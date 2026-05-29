import { useState, useEffect, useRef, useMemo, type ChangeEvent, type RefObject } from 'react';
import {
  Share, MapPin, Sparkles, MessageCircle, Wallet, Twitter,
  Check, User, Zap, Plus, Trash2,
  CheckCircle2, Link2, ExternalLink, Edit3, Send, SmilePlus,
  Download, QrCode, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useProfile } from '../store';
import { useChain } from '../lib/chain/useChain';
import ProofPill from '../components/chain/ProofPill';
import { tierGradient } from '../lib/chain/reputation';
import { toPng } from 'html-to-image';
import QRCode from 'qrcode';
import { ShareCardTemplate } from '../components/ShareCardTemplate';

const AVATAR_SEEDS = ['Alex', 'Luna', 'Max', 'Zoe', 'Kai', 'Nova', 'Aria', 'Leo', 'Mia', 'Finn', 'Sage', 'River'];
const TAG_OPTIONS = [
  'Builder',
  'Designer',
  'Founder',
  'Developer',
  'Researcher',
  'Community',
  'Product',
  'AI',
  'Web3',
  'Creator',
  'Investor',
  'Indie Hacker',
  '🎨 Design',
  '🚀 Shipping',
  '🧠 Strategy',
  '💻 Full Stack',
  '📱 Mobile',
  '🌍 Remote',
  '🎤 Speaker',
  '☕ Coffee Chat',
];

const LOOKING_FOR_OPTIONS = [
  "🚀 找合伙人", "💼 寻找机会", "🤝 寻求投资",
  "☕️ 随便聊聊", "💡 交流想法", "👥 招募队友"
];

const EVENT_OPTIONS = [
  "ETHGlobal", "Devcon", "Token2049", "Hackathon", "Remote", "Local"
];

function createTag(label: string) {
  return { label: label.trim(), icon: '' };
}

function addTagItem(
  currentTags: { label: string; icon: string }[],
  rawLabel: string,
) {
  const label = rawLabel.trim();
  if (!label) return currentTags;
  const exists = currentTags.some(tag => tag.label.toLowerCase() === label.toLowerCase());
  if (exists) return currentTags;
  return [...currentTags, createTag(label)].slice(0, 5);
}

function removeTagItem(
  currentTags: { label: string; icon: string }[],
  rawLabel: string,
) {
  return currentTags.filter(tag => tag.label !== rawLabel);
}

export default function CardPage() {
  const [searchParams] = useState(() => new URLSearchParams(window.location.search));
  const sharedDataParam = searchParams.get('c');
  const isSharedView = !!sharedDataParam;

  const { profile: myProfile, updateProfile, isSetup } = useProfile();
  const { state: chainState, reputation } = useChain();
  const [sharedProfile, setSharedProfile] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showShareDiv, setShowShareDiv] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  const shareUrl = useMemo(() => {
    try {
      const profileData = btoa(encodeURIComponent(JSON.stringify(myProfile)));
      return `${window.location.origin}${window.location.pathname}?c=${profileData}`;
    } catch {
      return window.location.href;
    }
  }, [myProfile]);

  useEffect(() => {
    if (sharedDataParam) {
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(sharedDataParam)));
        setSharedProfile(decoded);
      } catch {
        setSharedProfile(null);
      }
    }
  }, [sharedDataParam]);

  const profile = isSharedView && sharedProfile ? sharedProfile : myProfile;
  const isMe = !isSharedView;

  if (!isSharedView && !isSetup) {
    return <OnboardingFlow onComplete={(data) => updateProfile(data)} />;
  }

  if (isSharedView && !sharedProfile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-[48px] mb-4 opacity-20 font-bold">?</div>
        <p className="text-[16px] font-semibold text-muted-foreground">名片链接已失效或格式错误</p>
      </div>
    );
  }

  const avatarUrl = profile.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${profile.name}&backgroundColor=transparent`;

  return (
    <div className="flex h-full min-h-0 flex-col relative">
      <header className="px-6 py-4 flex justify-center items-center z-20 shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground tracking-widest uppercase">
          {isMe ? '我的名片' : '名片预览'}
        </span>
      </header>

      <main className={`flex-1 overflow-y-auto px-5 sm:px-6 z-10 no-scrollbar relative w-full min-h-0 pb-[140px]`}>
        <div className="bg-background px-5 py-6 rounded-[28px]">
          {/* Profile Header */}
          <div className="flex flex-col items-center mb-8 pt-2">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }} className="w-[100px] h-[100px] rounded-[32px] mb-5 relative shadow-xl">
              <img src={avatarUrl} className="w-full h-full rounded-[32px] object-cover bg-gradient-to-br from-secondary to-muted border border-white/10" alt="avatar"/>
              {profile.verified?.wallet && isMe && (
                <div className="absolute -bottom-2 -right-2 w-7 h-7 bg-foreground rounded-full border-[3px] border-background flex items-center justify-center shadow-md">
                  <Check className="w-3.5 h-3.5 text-background stroke-[3]" />
                </div>
              )}
            </motion.div>
            <motion.h1 initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="text-[32px] font-black tracking-tight text-foreground mb-1">{profile.name}</motion.h1>
            {profile.handle && <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }} className="text-[15px] font-bold text-muted-foreground">{profile.handle}</motion.div>}
            {profile.event && (
              <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="mt-3 px-3 py-1.5 rounded-full bg-secondary/50 flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground backdrop-blur-sm">
                <MapPin className="w-3.5 h-3.5" />
                {profile.event}
              </motion.div>
            )}

            {/* On-chain identity strip — only on the owner's view */}
            {isMe && chainState && (
              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.22 }}
                className="mt-3 flex items-center gap-2 flex-wrap justify-center"
              >
                <ProofPill
                  hash={chainState.blocks[chainState.blocks.length - 1].hash}
                  label="On-Chain"
                  variant="glow"
                />
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide bg-gradient-to-r ${tierGradient(reputation.tier)} bg-clip-text text-transparent border border-border/60`}>
                  <span className="text-foreground">Lv.{reputation.level}</span>
                  <span className="opacity-60 text-foreground">·</span>
                  <span>{reputation.tier}</span>
                </span>
              </motion.div>
            )}
          </div>

          {/* Tags */}
          {profile.tags?.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="flex flex-wrap justify-center gap-2 mb-8">
              {profile.tags.map((tag: any) => (
                <span key={tag.label} className="px-3.5 py-1.5 rounded-full text-[12px] font-bold bg-white/5 border border-white/10 text-foreground backdrop-blur-md shadow-sm">
                  {tag.label}
                </span>
              ))}
            </motion.div>
          )}

          {/* Bio */}
          {profile.bio && (
            <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="bg-card/40 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)] rounded-[24px] p-6 mb-5">
              <p className="text-[16px] leading-relaxed font-medium text-foreground/80 text-center">{profile.bio}</p>
            </motion.div>
          )}

          {/* Looking For */}
          {profile.lookingFor && (
            <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 }} className="bg-gradient-to-br from-secondary/40 to-secondary/10 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)] rounded-[24px] p-5 mb-5 flex gap-4 items-center">
              <div className="w-10 h-10 rounded-[14px] bg-foreground flex items-center justify-center shrink-0 shadow-md">
                <Zap className="w-5 h-5 text-background" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Looking for</div>
                <span className="text-[15px] font-bold text-foreground">{profile.lookingFor}</span>
              </div>
            </motion.div>
          )}

          {/* Verified Accounts */}
          {(profile.verified?.wallet || profile.verified?.twitter || profile.verified?.discord) && (
            <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="bg-card/40 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)] rounded-[24px] p-6 flex justify-around mb-8">
              {profile.verified?.wallet && (
                <div className="flex flex-col items-center gap-2.5">
                  <div className="w-12 h-12 rounded-[16px] bg-secondary/80 flex items-center justify-center shadow-sm"><Wallet className="w-5 h-5 text-foreground" /></div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Wallet</span>
                </div>
              )}
              {profile.verified?.twitter && (
                <div className="flex flex-col items-center gap-2.5">
                  <div className="w-12 h-12 rounded-[16px] bg-secondary/80 flex items-center justify-center shadow-sm"><Twitter className="w-5 h-5 text-foreground" /></div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">X</span>
                </div>
              )}
              {profile.verified?.discord && (
                <div className="flex flex-col items-center gap-2.5">
                  <div className="w-12 h-12 rounded-[16px] bg-secondary/80 flex items-center justify-center shadow-sm"><MessageCircle className="w-5 h-5 text-foreground" /></div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Discord</span>
                </div>
              )}
            </motion.div>
          )}

          {/* Highlights */}
          {profile.highlights?.length > 0 && (
            <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45 }} className="w-full mb-8">
              <h3 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Highlights</h3>
              <div className="space-y-2">
                {profile.highlights.filter((h: any) => h.title).map((item: any) => (
                  <div key={item.id} className="w-full bg-card/40 backdrop-blur-xl border border-white/10 shadow-sm rounded-[16px] p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[12px] bg-secondary flex items-center justify-center text-[18px]">{item.icon}</div>
                      <div className="text-[14px] font-semibold text-foreground leading-tight">{item.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* Actions */}
      {isMe ? (
        <div
          className="fixed left-0 right-0 z-20 pointer-events-none md:bottom-0"
          style={{ bottom: 'calc(64px + env(safe-area-inset-bottom))' }}
        >
          <div className="h-12 bg-gradient-to-t from-background to-transparent" />
          <div className="bg-background px-5 sm:px-6 pt-2 pb-3 pointer-events-auto">
            <div className="flex gap-3 max-w-md mx-auto">
              <button
                onClick={() => setIsEditing(true)}
                className="tap-target flex-1 py-3 sm:py-3.5 bg-secondary rounded-xl font-semibold text-[14px] text-foreground active:bg-foreground active:text-background hover:bg-foreground hover:text-background transition-colors"
              >
                编辑名片
              </button>
              <button
                onClick={() => setShowShareDiv(true)}
                className="tap-target flex-1 py-3 sm:py-3.5 bg-foreground rounded-xl font-semibold text-[14px] text-background active:opacity-80 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <Share className="w-4 h-4" />
                分享我的名片
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="fixed left-0 right-0 z-20 pointer-events-none md:bottom-0"
          style={{ bottom: 'calc(24px + env(safe-area-inset-bottom))' }}
        >
          <div className="h-12 bg-gradient-to-t from-background to-transparent" />
          <div className="bg-background px-5 sm:px-6 pt-2 pb-6 pointer-events-auto">
            <div className="max-w-md mx-auto">
              <a href="/" className="tap-target w-full py-4 bg-foreground rounded-2xl font-bold text-[15px] text-background active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-xl shadow-foreground/20">
                <Sparkles className="w-5 h-5 text-background" />
                一键创建我的 Web3 社交名片
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Share Card for Image Generation */}
      <div className="fixed top-[-9999px] left-[-9999px] pointer-events-none overflow-hidden opacity-0">
        <ShareCardTemplate ref={shareCardRef} profile={profile} />
      </div>

      <AnimatePresence>{showShareDiv && <ShareDrawer onClose={() => setShowShareDiv(false)} shareUrl={shareUrl} profile={profile} shareCardRef={shareCardRef} />}</AnimatePresence>
      <AnimatePresence>{isEditing && <EditProfile profile={profile} onSave={(p) => { updateProfile(p); setIsEditing(false); }} onClose={() => setIsEditing(false)} />}</AnimatePresence>
    </div>
  );
}

function OnboardingFlow({ onComplete }: { onComplete: (data: Partial<import('../store').Profile>) => void }) {
  const [step, setStep] = useState(-1);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [selectedTags, setSelectedTags] = useState<{ label: string; icon: string }[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [lookingFor, setLookingFor] = useState('');
  const [avatarSeed, setAvatarSeed] = useState(AVATAR_SEEDS[0]);
  const [customAvatar, setCustomAvatar] = useState<string | null>(null);
  const [avatarMode, setAvatarMode] = useState<'generated' | 'custom'>('generated');

  const handleAvatarUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCustomAvatar(ev.target?.result as string);
      setAvatarMode('custom');
    };
    reader.readAsDataURL(file);
  };

  const toggleTag = (label: string) => {
    setSelectedTags(prev =>
      prev.find(t => t.label === label) ? removeTagItem(prev, label) : addTagItem(prev, label)
    );
  };

  const handleAddCustomTag = () => {
    setSelectedTags(prev => addTagItem(prev, customTag));
    setCustomTag('');
  };

  const currentAvatarUrl = avatarMode === 'custom' && customAvatar
    ? customAvatar
    : `https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=transparent`;

  const finish = () => {
    onComplete({
      name,
      handle,
      bio,
      tags: selectedTags,
      lookingFor,
      avatar: avatarMode === 'custom' && customAvatar ? customAvatar : `https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=transparent`,
    });
  };

  const totalSteps = 4;
  const currentStepIndex = step + 1;
  const progress = Math.max(0, Math.min(100, (currentStepIndex / totalSteps) * 100));

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative">
      {step >= 0 && (
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Step {currentStepIndex} / {totalSteps - 1}</span>
            <span className="text-[11px] font-semibold text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <div className="h-[2px] bg-secondary rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className="h-full bg-foreground rounded-full" />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 pb-[100px] no-scrollbar">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex-1">
          {step === -1 && (
            <div className="flex flex-col h-full min-h-[480px] pt-8">
              <div className="flex flex-col items-center space-y-8 flex-1">
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }}>
                  <div className="w-20 h-20 rounded-2xl bg-foreground flex items-center justify-center shadow-lg">
                    <User className="w-10 h-10 text-background" />
                  </div>
                </motion.div>
                
                <div className="text-center space-y-3">
                  <h1 className="text-[32px] font-black text-foreground leading-tight tracking-tight">vibecard</h1>
                  <p className="text-[15px] text-muted-foreground font-medium leading-relaxed max-w-[260px] mx-auto">
                    你的 Web3 社交名片。一张卡片，连接无限可能。
                  </p>
                </div>

                <div className="w-full max-w-[280px] bg-secondary/50 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-[13px] font-bold text-foreground shrink-0 shadow-sm">1</div>
                    <div className="text-[14px] font-semibold text-foreground">创建专属名片</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-[13px] font-bold text-foreground shrink-0 shadow-sm">2</div>
                    <div className="text-[14px] font-semibold text-foreground">完善身份信息</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-[13px] font-bold text-foreground shrink-0 shadow-sm">3</div>
                    <div className="text-[14px] font-semibold text-foreground">一键分享社交</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 0 && (
            <div className="flex flex-col h-full pt-4">
              <div className="flex-1 space-y-6">
                <div>
                  <h2 className="text-[24px] font-bold text-foreground mb-1 tracking-tight">你是谁</h2>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    名字和一句话介绍会显示在名片顶部。
                  </p>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full mb-4 overflow-hidden bg-secondary">
                    <img src={currentAvatarUrl} className="w-full h-full rounded-full bg-secondary object-cover" alt="avatar" />
                  </div>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setAvatarMode('generated')}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all border ${avatarMode === 'generated' ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:border-foreground'}`}
                    >
                      生成头像
                    </button>
                    <label className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all border cursor-pointer ${avatarMode === 'custom' ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:border-foreground'}`}>
                      <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                      上传头像
                    </label>
                  </div>
                  {avatarMode === 'generated' ? (
                    <div className="flex gap-2 flex-wrap justify-center max-w-[240px]">
                      {AVATAR_SEEDS.slice(0, 8).map(seed => (
                        <button key={seed} onClick={() => setAvatarSeed(seed)} className={`w-8 h-8 rounded-full overflow-hidden border transition-all ${avatarSeed === seed ? 'border-foreground scale-110' : 'border-transparent opacity-50 hover:opacity-80'}`}>
                          <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=transparent`} className="w-full h-full bg-secondary" alt={seed} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => { setCustomAvatar(null); setAvatarMode('generated'); }} className="text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
                      移除自定义头像
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[12px] font-semibold text-muted-foreground mb-2 block">名字 *</label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="你的名字或昵称" className="w-full border border-border rounded-xl px-4 py-3 text-[15px] font-semibold text-foreground outline-none focus:border-foreground transition-colors bg-background" />
                  </div>
                  <div className="pt-2 border-t border-border/50">
                    <label className="text-[12px] font-semibold text-muted-foreground mb-2 block">选填</label>
                    <input value={handle} onChange={e => setHandle(e.target.value)} placeholder="一句话介绍" className="w-full border border-border rounded-xl px-4 py-3 text-[14px] font-medium text-foreground outline-none focus:border-foreground transition-colors bg-background" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col h-full pt-4">
              <div className="flex-1 space-y-6">
                <div>
                  <h2 className="text-[24px] font-bold text-foreground mb-1 tracking-tight">关于你</h2>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    简短有力的介绍更容易被记住。
                  </p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[12px] font-semibold text-muted-foreground mb-2 block">个人简介</label>
                    <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="正在构建下一代社交产品..." className="w-full border border-border rounded-xl px-4 py-3 text-[14px] font-medium text-foreground outline-none focus:border-foreground transition-colors bg-background resize-none h-24" />
                  </div>
                  <div className="pt-2 border-t border-border/50">
                    <label className="text-[12px] font-semibold text-muted-foreground mb-3 block">你在寻找什么（选填）</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {LOOKING_FOR_OPTIONS.slice(0, 4).map(opt => (
                        <button
                          key={opt}
                          onClick={() => setLookingFor(opt)}
                          className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all border ${
                            lookingFor === opt
                              ? 'bg-foreground text-background border-foreground shadow-sm scale-95'
                              : 'bg-background text-foreground border-border hover:border-foreground hover:bg-secondary/50'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    <input
                      value={lookingFor}
                      onChange={e => setLookingFor(e.target.value)}
                      placeholder="或者自定义输入..."
                      className="w-full border border-border rounded-xl px-4 py-3 text-[14px] font-medium text-foreground outline-none focus:border-foreground transition-colors bg-background"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col h-full pt-4">
              <div className="flex-1 space-y-6">
                <div>
                  <h2 className="text-[24px] font-bold text-foreground mb-1 tracking-tight">身份标签</h2>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    最多选择 5 个，支持自定义和 emoji。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {TAG_OPTIONS.slice(0, 8).map(tag => (
                    <button key={tag} onClick={() => toggleTag(tag)} className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all border ${selectedTags.find(t => t.label === tag) ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:border-foreground'}`}>
                      {tag}
                    </button>
                  ))}
                </div>
                <div className="rounded-[16px] border border-border bg-card/60 p-3 backdrop-blur-sm">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <SmilePlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        value={customTag}
                        onChange={e => setCustomTag(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomTag();
                          }
                        }}
                        placeholder="输入标签..."
                        className="w-full border border-border rounded-xl bg-background pl-9 pr-3 py-2.5 text-[13px] font-medium outline-none focus:border-foreground transition-colors"
                      />
                    </div>
                    <button
                      onClick={handleAddCustomTag}
                      disabled={!customTag.trim() || selectedTags.length >= 5}
                      className="h-10 px-4 rounded-xl bg-foreground text-background text-[13px] font-semibold disabled:opacity-30"
                    >
                      添加
                    </button>
                  </div>
                </div>
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedTags.map(tag => (
                      <button
                        key={tag.label}
                        onClick={() => toggleTag(tag.label)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground text-background text-[12px] font-semibold"
                      >
                        {tag.label}
                        <span className="text-background/70">×</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <div
        className="absolute left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-8 pb-3 px-5 sm:px-6"
        style={{ bottom: 'calc(64px + env(safe-area-inset-bottom))' }}
      >
        <div className="flex gap-3 max-w-md mx-auto">
          {step > -1 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="tap-target px-6 h-11 rounded-lg border border-border font-semibold text-[14px] text-foreground hover:border-foreground active:scale-95 transition-all"
            >
              返回
            </button>
          )}
          <button
            onClick={() => step < 2 ? setStep(s => s + 1) : finish()}
            disabled={step === 0 && !name}
            className="tap-target flex-1 h-11 rounded-lg bg-foreground text-background font-semibold text-[15px] flex items-center justify-center hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30"
          >
            {step === -1 ? '开始' : step < 2 ? '继续' : '完成'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditProfile({ profile, onSave, onClose }: { profile: import('../store').Profile; onSave: (p: Partial<import('../store').Profile>) => void; onClose: () => void }) {
  const [name, setName] = useState(profile.name);
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio);
  const [lookingFor, setLookingFor] = useState(profile.lookingFor);
  const [event, setEvent] = useState(profile.event);
  const [selectedTags, setSelectedTags] = useState(profile.tags);
  const [customTag, setCustomTag] = useState('');
  const [highlights, setHighlights] = useState(profile.highlights);
  const [wallet, setWallet] = useState(profile.verified.wallet);
  const [twitter, setTwitter] = useState(profile.verified.twitter);
  const [discord, setDiscord] = useState(profile.verified.discord);
  const [wechat, setWechat] = useState(profile.verified.wechat);
  const [avatarSeed, setAvatarSeed] = useState(() => {
    try {
      const url = new URL(profile.avatar);
      return url.searchParams.get('seed') || AVATAR_SEEDS[0];
    } catch {
      return AVATAR_SEEDS[0];
    }
  });
  const [customAvatar, setCustomAvatar] = useState<string | null>(null);
  const [avatarMode, setAvatarMode] = useState<'generated' | 'custom'>(() => {
    try {
      new URL(profile.avatar);
      return profile.avatar.startsWith('data:') ? 'custom' : 'generated';
    } catch {
      return 'generated';
    }
  });

  const handleAvatarUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCustomAvatar(ev.target?.result as string);
      setAvatarMode('custom');
    };
    reader.readAsDataURL(file);
  };

  const toggleTag = (label: string) => {
    setSelectedTags(prev => prev.find(t => t.label === label) ? removeTagItem(prev, label) : addTagItem(prev, label));
  };

  const handleAddCustomTag = () => {
    setSelectedTags(prev => addTagItem(prev, customTag));
    setCustomTag('');
  };

  const addHighlight = () => {
    setHighlights(prev => [...prev, { id: Date.now(), title: '', type: '', icon: '+', link: '' }]);
  };

  const updateHighlight = (id: number, field: string, value: string) => {
    setHighlights(prev => prev.map(h => h.id === id ? { ...h, [field]: value } : h));
  };

  const removeHighlight = (id: number) => {
    setHighlights(prev => prev.filter(h => h.id !== id));
  };

  const currentAvatarUrl = avatarMode === 'custom' && customAvatar
    ? customAvatar
    : `https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=transparent`;

  const save = () => {
    onSave({
      name,
      handle,
      bio,
      lookingFor,
      event,
      tags: selectedTags,
      highlights: highlights.filter(h => h.title),
      verified: { wallet, twitter, discord, wechat },
      avatar: avatarMode === 'custom' && customAvatar ? customAvatar : `https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=transparent`
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 24, stiffness: 200 }} className="absolute inset-0 bg-background z-50 overflow-y-auto pb-8">
      <div className="sticky top-0 bg-background z-20 px-6 py-4 flex justify-between items-center border-b border-border">
        <button onClick={onClose} className="text-[14px] font-semibold text-muted-foreground hover:text-foreground transition-colors">取消</button>
        <span className="font-bold text-[15px] tracking-tight text-foreground">编辑名片</span>
        <button onClick={save} className="text-[14px] font-semibold text-foreground hover:opacity-70 transition-opacity">保存</button>
      </div>
      <div className="px-6 py-6 space-y-6">
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-full mb-3 overflow-hidden bg-secondary">
            <img src={currentAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          </div>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setAvatarMode('generated')}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all border ${avatarMode === 'generated' ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:border-foreground'}`}
            >
              生成头像
            </button>
            <label className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all border cursor-pointer ${avatarMode === 'custom' ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:border-foreground'}`}>
              <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
              上传头像
            </label>
          </div>
          {avatarMode === 'generated' ? (
            <div className="flex gap-2 flex-wrap justify-center">
              {AVATAR_SEEDS.slice(0, 8).map(seed => (
                <button key={seed} onClick={() => setAvatarSeed(seed)} className={`w-8 h-8 rounded-full overflow-hidden border transition-all ${avatarSeed === seed ? 'border-foreground' : 'border-transparent opacity-40'}`}>
                  <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=transparent`} className="w-full h-full bg-secondary" alt={seed} />
                </button>
              ))}
            </div>
          ) : customAvatar && (
            <button onClick={() => { setCustomAvatar(null); setAvatarMode('generated'); }} className="text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
              移除自定义头像
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-semibold text-muted-foreground mb-2 block">名字 *</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-border rounded-xl px-4 py-3 text-[15px] font-semibold text-foreground outline-none focus:border-foreground transition-colors bg-background" />
          </div>
          <div className="pt-2 border-t border-border/50">
            <label className="text-[12px] font-semibold text-muted-foreground mb-2 block">选填</label>
            <input value={handle} onChange={e => setHandle(e.target.value)} placeholder="一句话介绍" className="w-full border border-border rounded-xl px-4 py-3 text-[15px] font-medium text-foreground outline-none focus:border-foreground transition-colors bg-background" />
          </div>
          <div>
            <label className="text-[12px] font-semibold text-muted-foreground mb-2 block">简介</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} className="w-full border border-border rounded-xl px-4 py-3 text-[15px] font-medium text-foreground outline-none focus:border-foreground transition-colors bg-background resize-none h-20" />
          </div>
          <div>
            <label className="text-[12px] font-semibold text-muted-foreground mb-3 block">你在寻找什么（选填）</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {LOOKING_FOR_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => setLookingFor(opt)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all border ${
                    lookingFor === opt 
                      ? 'bg-foreground text-background border-foreground shadow-sm scale-95' 
                      : 'bg-background text-foreground border-border hover:border-foreground hover:bg-secondary/50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <input value={lookingFor} onChange={e => setLookingFor(e.target.value)} placeholder="或者自定义输入..." className="w-full border border-border rounded-xl px-4 py-3 text-[14px] font-medium text-foreground outline-none focus:border-foreground transition-colors bg-background" />
          </div>
          <div>
            <label className="text-[12px] font-semibold text-muted-foreground mb-3 block">日常出没地（选填）</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {EVENT_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => setEvent(opt)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all border ${
                    event === opt 
                      ? 'bg-foreground text-background border-foreground shadow-sm scale-95' 
                      : 'bg-background text-foreground border-border hover:border-foreground hover:bg-secondary/50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <input value={event} onChange={e => setEvent(e.target.value)} placeholder="或者自定义输入，例如：ETHGlobal Tokyo" className="w-full border border-border rounded-xl px-4 py-3 text-[14px] font-medium text-foreground outline-none focus:border-foreground transition-colors bg-background" />
          </div>
        </div>

        <div>
          <label className="text-[12px] font-semibold text-muted-foreground mb-3 block">标签（选填）</label>
          <div className="flex flex-wrap gap-2">
            {TAG_OPTIONS.map(tag => (
              <button key={tag} onClick={() => toggleTag(tag)} className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all border ${selectedTags.find(t => t.label === tag) ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:border-foreground'}`}>
                {tag}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-[18px] border border-border bg-card/60 p-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <SmilePlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={customTag}
                  onChange={e => setCustomTag(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomTag();
                    }
                  }}
                  placeholder="添加自定义标签，支持 emoji"
                  className="w-full border border-border rounded-xl bg-background pl-10 pr-4 py-3 text-[14px] font-medium outline-none focus:border-foreground transition-colors"
                />
              </div>
              <button
                onClick={handleAddCustomTag}
                disabled={!customTag.trim() || selectedTags.length >= 5}
                className="h-11 px-4 rounded-xl bg-foreground text-background text-[13px] font-semibold disabled:opacity-30"
              >
                添加
              </button>
            </div>
            <p className="text-[12px] text-muted-foreground mt-2">推荐加上角色、技能、兴趣或状态，比如 `🎨 Design`、`🤝 Open to chat`</p>
          </div>
          {selectedTags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedTags.map(tag => (
                <button
                  key={tag.label}
                  onClick={() => toggleTag(tag.label)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground text-background text-[12px] font-semibold"
                >
                  {tag.label}
                  <span className="text-background/70">×</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-[12px] font-semibold text-muted-foreground mb-3 block">已验证账号（选填）</label>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 flex items-center border border-border rounded-xl px-3 py-2 bg-background focus-within:border-foreground transition-colors">
                <input value={wallet} onChange={e => setWallet(e.target.value)} placeholder="0x..." className="w-full text-[13px] font-medium outline-none bg-transparent" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#1DA1F2]/10 flex items-center justify-center shrink-0">
                <Twitter className="w-4 h-4 text-[#1DA1F2]" />
              </div>
              <div className="flex-1 flex items-center border border-border rounded-xl px-3 py-2 bg-background focus-within:border-foreground transition-colors">
                <span className="text-muted-foreground text-[13px] mr-1">@</span>
                <input value={twitter} onChange={e => setTwitter(e.target.value)} placeholder="handle" className="w-full text-[13px] font-medium outline-none bg-transparent" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#5865F2]/10 flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4 text-[#5865F2]" />
              </div>
              <div className="flex-1 flex items-center border border-border rounded-xl px-3 py-2 bg-background focus-within:border-foreground transition-colors">
                <input value={discord} onChange={e => setDiscord(e.target.value)} placeholder="username" className="w-full text-[13px] font-medium outline-none bg-transparent" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#07C160]/10 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#07C160]">
                  <path d="M8.5 13.5c-2.8 0-5-1.9-5-4.2s2.2-4.2 5-4.2 5 1.9 5 4.2-2.2 4.2-5 4.2zm6.5-7.5c3.5 0 6.5 2.4 6.5 5.2 0 2.8-3 5.2-6.5 5.2-1 0-1.9-.2-2.8-.5l-3 1.5.8-2.5c-1-1-1.5-2.2-1.5-3.7 0-2.8 3-5.2 6.5-5.2z" />
                </svg>
              </div>
              <div className="flex-1 flex items-center border border-border rounded-xl px-3 py-2 bg-background focus-within:border-foreground transition-colors">
                <input value={wechat} onChange={e => setWechat(e.target.value)} placeholder="WeChat ID" className="w-full text-[13px] font-medium outline-none bg-transparent" />
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-[12px] font-semibold text-muted-foreground">高光时刻 (Highlights)</label>
            <button onClick={addHighlight} className="text-[12px] font-semibold text-foreground hover:opacity-70 transition-opacity">+ 添加</button>
          </div>
          <div className="space-y-3">
            {highlights.map(h => (
              <div key={h.id} className="border border-border rounded-xl p-3 flex gap-3 items-start bg-card/30">
                <input 
                  value={h.icon} 
                  onChange={e => updateHighlight(h.id, 'icon', e.target.value)} 
                  placeholder="✨"
                  className="w-10 h-10 text-center text-[18px] bg-background rounded-lg shrink-0 border border-border outline-none focus:border-foreground transition-colors" 
                  maxLength={2} 
                />
                <div className="flex-1">
                  <input 
                    value={h.title} 
                    onChange={e => updateHighlight(h.id, 'title', e.target.value)} 
                    placeholder="一句话描述，如：拿到 A 轮融资" 
                    className="w-full bg-transparent px-1 py-1.5 text-[14px] font-semibold outline-none placeholder:text-muted-foreground/50" 
                  />
                </div>
                <button onClick={() => removeHighlight(h.id)} className="text-muted-foreground hover:text-foreground transition-colors mt-2 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ShareDrawer({ onClose, shareUrl, profile, shareCardRef }: { onClose: () => void; shareUrl: string; profile: import('../store').Profile; shareCardRef: RefObject<HTMLDivElement | null> }) {
  const [mode, setMode] = useState<'menu' | 'qr' | 'image' | 'imagePreview'>('menu');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrError, setQrError] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

  const shareText = `${profile.name || 'TA'} 的 vibecard 名片 — 一张卡片，连接无限可能`;

  useEffect(() => {
    setQrError(false);
    QRCode.toDataURL(shareUrl, { width: 280, margin: 2, color: { dark: '#0a0a0a', light: '#ffffff' } })
      .then((url: string) => { setQrDataUrl(url); setQrError(false); })
      .catch(() => { setQrDataUrl(''); setQrError(true); });
  }, [shareUrl]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
    } catch {
      // Fallback: select text for manual copy
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 1500);
      } catch {
        /* ignore */
      }
      document.body.removeChild(textarea);
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: shareText, text: shareText, url: shareUrl });
    } catch {
      /* user cancelled */
    }
  };

  const saveCardImage = async () => {
    if (!shareCardRef.current) return;
    setIsSaving(true);
    try {
      const dataUrl = await toPng(shareCardRef.current, { pixelRatio: 3, backgroundColor: '#ffffff' });
      if (isIOS) {
        // iOS Safari doesn't support a.download — show preview for long-press save
        setImagePreviewUrl(dataUrl);
        setMode('imagePreview');
      } else {
        const link = document.createElement('a');
        link.download = `vibecard-${profile.name || 'namecard'}.png`;
        link.href = dataUrl;
        link.click();
      }
    } catch (e) {
      console.error('Save image failed', e);
    } finally {
      setIsSaving(false);
    }
  };

  const openPlatform = (key: string) => {
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(shareText);
    const urls: Record<string, string> = {
      x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      discord: `https://discord.com/channels/@me`,
      weibo: `https://service.weibo.com/share/share.php?title=${encodedText}&url=${encodedUrl}`,
    };
    if (urls[key]) window.open(urls[key], '_blank', 'width=600,height=500,noopener,noreferrer');
  };

  if (mode === 'qr') {
    return (
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-foreground/20 z-50" />
        <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute bottom-0 left-0 right-0 bg-background rounded-t-[28px] p-6 pt-5 z-50 border-t border-border">
          <div className="w-10 h-[4px] bg-border rounded-full mx-auto mb-5" />
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[18px] font-bold text-foreground">二维码分享</h3>
            <button onClick={() => setMode('menu')} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-foreground hover:text-background transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col items-center gap-4 mb-4">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR" className="w-52 h-52 rounded-2xl border border-border shadow-sm" />
            ) : qrError ? (
              <div className="w-52 h-52 rounded-2xl bg-secondary flex items-center justify-center">
                <span className="text-[13px] text-muted-foreground">二维码生成失败</span>
              </div>
            ) : (
              <div className="w-52 h-52 rounded-2xl bg-secondary flex items-center justify-center">
                <span className="text-[13px] text-muted-foreground">生成中…</span>
              </div>
            )}
            <p className="text-[13px] text-muted-foreground font-medium text-center">微信扫码即可查看名片<br/>长按可保存二维码</p>
          </div>
          <button onClick={copyLink} className="w-full py-3.5 bg-secondary rounded-xl font-semibold text-[14px] text-foreground hover:bg-foreground hover:text-background transition-colors flex items-center justify-center gap-2">
            {isCopied ? <CheckCircle2 className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
            {isCopied ? '已复制链接' : '复制名片链接'}
          </button>
        </motion.div>
      </>
    );
  }

  if (mode === 'imagePreview') {
    return (
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-foreground/40 z-50" />
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="absolute inset-x-4 top-[10%] bottom-[10%] bg-background rounded-[28px] p-5 z-50 border border-border shadow-2xl flex flex-col">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h3 className="text-[16px] font-bold text-foreground">长按保存图片</h3>
            <button onClick={() => setMode('menu')} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-foreground hover:text-background transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[12px] text-muted-foreground mb-3 shrink-0">iOS 用户请长按下方图片，选择「存储图像」保存到相册。</p>
          <div className="flex-1 flex items-center justify-center overflow-hidden rounded-2xl bg-secondary">
            {imagePreviewUrl ? (
              <img src={imagePreviewUrl} alt="名片预览" className="max-w-full max-h-full rounded-2xl shadow-lg" />
            ) : (
              <span className="text-[13px] text-muted-foreground">图片加载中…</span>
            )}
          </div>
        </motion.div>
      </>
    );
  }

  if (mode === 'image') {
    return (
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-foreground/20 z-50" />
        <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute bottom-0 left-0 right-0 bg-background rounded-t-[28px] p-6 pt-5 z-50 border-t border-border">
          <div className="w-10 h-[4px] bg-border rounded-full mx-auto mb-5" />
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[18px] font-bold text-foreground">保存名片图片</h3>
            <button onClick={() => setMode('menu')} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-foreground hover:text-background transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[14px] text-muted-foreground font-medium mb-5 text-center leading-relaxed">
            {isIOS ? '生成高清名片图片后长按保存到相册。' : '将当前名片生成为高清图片，保存后可直接分享。'}
          </p>
          <button
            onClick={saveCardImage}
            disabled={isSaving}
            className="w-full py-3.5 bg-foreground rounded-xl font-semibold text-[14px] text-background hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {isSaving ? '生成中…' : isIOS ? '生成名片图片' : '保存名片图片'}
          </button>
        </motion.div>
      </>
    );
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-foreground/20 z-50" />
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute bottom-0 left-0 right-0 bg-background rounded-t-[28px] p-6 pt-5 z-50 border-t border-border">
        <div className="w-10 h-[4px] bg-border rounded-full mx-auto mb-5" />
        <h3 className="text-[20px] font-bold text-center text-foreground mb-1">分享名片</h3>
        <p className="text-[13px] text-muted-foreground text-center mb-6">选择你喜欢的方式分享</p>

        {/* Primary actions */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {canNativeShare && (
            <button onClick={nativeShare} className="flex flex-col items-center gap-2.5 p-3 rounded-2xl bg-secondary/50 hover:bg-secondary transition-colors">
              <div className="w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center shadow-sm">
                <Share className="w-5 h-5" />
              </div>
              <span className="text-[12px] font-bold text-foreground">系统分享</span>
            </button>
          )}
          <button onClick={() => setMode('image')} className="flex flex-col items-center gap-2.5 p-3 rounded-2xl bg-secondary/50 hover:bg-secondary transition-colors">
            <div className="w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center shadow-sm">
              <Download className="w-5 h-5" />
            </div>
            <span className="text-[12px] font-bold text-foreground">保存图片</span>
          </button>
          <button onClick={() => setMode('qr')} className="flex flex-col items-center gap-2.5 p-3 rounded-2xl bg-secondary/50 hover:bg-secondary transition-colors">
            <div className="w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center shadow-sm">
              <QrCode className="w-5 h-5" />
            </div>
            <span className="text-[12px] font-bold text-foreground">二维码</span>
          </button>
        </div>

        {/* Social platforms */}
        <div className="mb-6">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">社交平台</p>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            <button onClick={() => openPlatform('x')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors shrink-0">
              <Twitter className="w-4 h-4" />
              <span className="text-[13px] font-bold text-foreground">X</span>
            </button>
            <button onClick={() => openPlatform('telegram')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors shrink-0">
              <Send className="w-4 h-4" />
              <span className="text-[13px] font-bold text-foreground">Telegram</span>
            </button>
            <button onClick={() => openPlatform('weibo')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors shrink-0">
              <span className="text-[13px] font-bold text-foreground">微博</span>
            </button>
            <button onClick={() => setMode('qr')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors shrink-0">
              <span className="text-[13px] font-bold text-foreground">微信</span>
            </button>
          </div>
        </div>

        {/* Copy link */}
        <button onClick={copyLink} className="w-full flex items-center justify-center gap-2 py-3.5 bg-secondary rounded-xl font-semibold text-[14px] text-foreground hover:bg-foreground hover:text-background active:scale-[0.98] transition-all">
          {isCopied ? <CheckCircle2 className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
          {isCopied ? '已复制链接' : '复制名片链接'}
        </button>
      </motion.div>
    </>
  );
}
