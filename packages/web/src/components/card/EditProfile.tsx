import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import {
  Wallet, Twitter, MessageCircle, Trash2, SmilePlus, Smile, Send,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAccount, useDisconnect } from 'wagmi';
import type { Profile, Contact } from '../../store';
import WalletConnect from '../../components/WalletConnect';
import {
  AVATAR_SEEDS,
  MBTI_OPTIONS,
  ZODIAC_OPTIONS,
  AGE_OPTIONS,
  LOCATION_PRESETS,
  addTagItem,
  removeTagItem,
  stripLocationPrefix,
} from './constants';
import ChipSelector from '../ui/ChipSelector';

type SaveStatus = 'saved' | 'saving';

export default function EditProfile({
  profile,
  onSave,
  onClose,
}: {
  profile: Profile;
  onSave: (p: Partial<Profile>) => void;
  onClose: () => void;
}) {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const [name, setName] = useState(profile.name);
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio);
  const [mbti, setMbti] = useState(profile.mbti || '');
  const [zodiac, setZodiac] = useState(profile.zodiac || '');
  const [age, setAge] = useState(profile.age || '');
  const [location, setLocation] = useState(stripLocationPrefix(profile.location || ''));
  const [selectedTags, setSelectedTags] = useState(profile.tags);
  const [customTag, setCustomTag] = useState('');
  const [highlights, setHighlights] = useState(profile.highlights);
  const [twitter, setTwitter] = useState(profile.verified.twitter);
  const [discord, setDiscord] = useState(profile.verified.discord);
  const [wechat, setWechat] = useState(profile.verified.wechat);
  const [telegram, setTelegram] = useState(profile.verified.telegram || '');
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [locationFocused, setLocationFocused] = useState(false);
  const lastSavedRef = useRef<string>('');

  const currentAvatarUrl = avatarMode === 'custom' && customAvatar
    ? customAvatar
    : `https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=transparent`;

  const buildContacts = (): Contact[] => {
    const contacts: Contact[] = [];
    if (twitter.trim()) {
      contacts.push({ id: 'twitter', platform: 'twitter', value: twitter.trim(), url: `https://x.com/${twitter.trim().replace('@', '')}` });
    }
    if (discord.trim()) {
      contacts.push({ id: 'discord', platform: 'discord', value: discord.trim(), url: '' });
    }
    if (wechat.trim()) {
      contacts.push({ id: 'wechat', platform: 'wechat', value: wechat.trim(), url: '' });
    }
    if (telegram.trim()) {
      contacts.push({ id: 'telegram', platform: 'telegram', value: telegram.trim(), url: `https://t.me/${telegram.trim().replace('@', '')}` });
    }
    return contacts;
  };

  const buildSaveData = (): Partial<Profile> => ({
    name,
    handle,
    bio,
    mbti,
    zodiac,
    age,
    location: location.trim() || undefined,
    tags: selectedTags,
    highlights: highlights.filter(h => h.title.trim()),
    verified: { wallet: address || profile.verified.wallet, twitter, discord, wechat, telegram },
    contacts: buildContacts(),
    avatar: avatarMode === 'custom' && customAvatar ? customAvatar : `https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=transparent`,
  });

  // Initialize snapshot on mount.
  useEffect(() => {
    lastSavedRef.current = JSON.stringify(buildSaveData());
  }, []);

  // Auto-save with debounce.
  useEffect(() => {
    const current = JSON.stringify(buildSaveData());
    if (current === lastSavedRef.current) return;

    setSaveStatus('saving');
    const timer = setTimeout(() => {
      onSave(buildSaveData());
      lastSavedRef.current = current;
      setSaveStatus('saved');
    }, 600);

    return () => clearTimeout(timer);
  }, [name, handle, bio, mbti, zodiac, age, location, selectedTags, highlights, twitter, discord, wechat, telegram, avatarSeed, avatarMode, customAvatar, address]);

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
    setHighlights(prev => [...prev, { id: Date.now(), title: '', type: '', icon: '✨', link: '' }]);
  };

  const updateHighlight = (id: number, field: string, value: string) => {
    setHighlights(prev => prev.map(h => h.id === id ? { ...h, [field]: value } : h));
  };

  const removeHighlight = (id: number) => {
    setHighlights(prev => prev.filter(h => h.id !== id));
  };

  const applyLocationPreset = (preset: string) => {
    setLocation(preset);
    setLocationFocused(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 24, stiffness: 200 }} className="absolute inset-0 bg-background z-50 overflow-y-auto pb-8">
      <div className="sticky top-0 bg-background/95 backdrop-blur-md z-20 px-6 py-4 flex justify-between items-center border-b border-border">
        <button onClick={onClose} className="tap-target text-[14px] font-semibold text-muted-foreground hover:text-foreground transition-colors">关闭</button>
        <span className="font-bold text-[15px] tracking-tight text-foreground">编辑名片</span>
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
          {saveStatus === 'saving' ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-foreground opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-foreground" />
              </span>
              保存中…
            </>
          ) : (
            <>
              <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              已保存
            </>
          )}
        </div>
      </div>

      <div className="px-6 py-6 space-y-8">
        {/* Avatar */}
        <section className="space-y-4">
          <h3 className="text-[13px] font-bold text-foreground sticky top-[57px] bg-background/95 backdrop-blur-md py-2 z-10">头像</h3>
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 rounded-full mb-3 overflow-hidden bg-secondary">
              <img src={currentAvatarUrl} loading="lazy" decoding="async" alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setAvatarMode('generated')}
                className={`tap-target px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all border ${avatarMode === 'generated' ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:border-foreground'}`}
              >
                生成头像
              </button>
              <label className={`tap-target px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all border cursor-pointer ${avatarMode === 'custom' ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:border-foreground'}`}>
                <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                上传头像
              </label>
            </div>
            {avatarMode === 'generated' ? (
              <div className="flex gap-2 flex-wrap justify-center">
                {AVATAR_SEEDS.slice(0, 8).map(seed => (
                  <button key={seed} onClick={() => setAvatarSeed(seed)} className={`tap-target w-8 h-8 rounded-full overflow-hidden border transition-all ${avatarSeed === seed ? 'border-foreground' : 'border-transparent opacity-40'}`}>
                    <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=transparent`} loading="lazy" decoding="async" className="w-full h-full bg-secondary" alt={seed} />
                  </button>
                ))}
              </div>
            ) : customAvatar && (
              <button onClick={() => { setCustomAvatar(null); setAvatarMode('generated'); }} className="tap-target text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
                移除自定义头像
              </button>
            )}
          </div>
        </section>

        {/* Basic Info */}
        <section className="space-y-4 border-t border-border/40 pt-6">
          <h3 className="text-[13px] font-bold text-foreground sticky top-[57px] bg-background/95 backdrop-blur-md py-2 z-10">基本信息</h3>
          <div className="space-y-4">
            <div>
              <label className="text-[12px] font-semibold text-muted-foreground mb-2 block">名字 *</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-border rounded-xl px-4 py-3 text-[15px] font-semibold text-foreground outline-none focus:border-foreground transition-colors bg-background" />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-muted-foreground mb-2 block">个人签名（选填）</label>
              <input value={handle} onChange={e => setHandle(e.target.value)} placeholder="一句话介绍自己" className="w-full border border-border rounded-xl px-4 py-3 text-[15px] font-medium text-foreground outline-none focus:border-foreground transition-colors bg-background" />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-muted-foreground mb-2 block flex items-center gap-1.5">
                简介
                <Smile className="w-3.5 h-3.5 text-muted-foreground" />
              </label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="写一段有趣的自我介绍，支持 emoji ✨" className="w-full border border-border rounded-xl px-4 py-3 text-[15px] font-medium text-foreground outline-none focus:border-foreground transition-colors bg-background resize-none h-24" />
            </div>
          </div>
        </section>

        {/* Special identifiers */}
        <section className="space-y-4 border-t border-border/40 pt-6">
          <h3 className="text-[13px] font-bold text-foreground sticky top-[57px] bg-background/95 backdrop-blur-md py-2 z-10">特殊标识（选填）</h3>
          <div className="space-y-4">
            <ChipSelector
              label="MBTI"
              options={MBTI_OPTIONS}
              value={mbti}
              onChange={setMbti}
              columns={4}
            />
            <ChipSelector
              label="星座"
              options={ZODIAC_OPTIONS}
              value={zodiac}
              onChange={setZodiac}
            />
            <ChipSelector
              label="年龄段"
              options={AGE_OPTIONS}
              value={age}
              onChange={setAge}
            />
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Base / 坐标</label>
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                onFocus={() => setLocationFocused(true)}
                onBlur={() => setTimeout(() => setLocationFocused(false), 150)}
                placeholder="输入你的城市或坐标"
                className="w-full border border-border rounded-xl px-4 py-3 text-[14px] font-medium text-foreground outline-none focus:border-foreground transition-colors bg-background"
              />
              {locationFocused && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {LOCATION_PRESETS.map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); applyLocationPreset(preset); }}
                      className="tap-target px-3 py-1.5 rounded-full text-[12px] font-semibold border border-border bg-secondary/50 text-foreground hover:border-foreground transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Tags */}
        <section className="space-y-4 border-t border-border/40 pt-6">
          <h3 className="text-[13px] font-bold text-foreground sticky top-[57px] bg-background/95 backdrop-blur-md py-2 z-10">标签（选填）</h3>
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedTags.map(tag => (
                <button
                  key={tag.label}
                  onClick={() => toggleTag(tag.label)}
                  className="tap-target inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground text-background text-[12px] font-semibold"
                >
                  {tag.label}
                  <span className="text-background/70">×</span>
                </button>
              ))}
            </div>
          )}
          <div className="rounded-[18px] border border-border bg-card/60 p-4">
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
                className="tap-target h-11 px-4 rounded-xl bg-foreground text-background text-[13px] font-semibold disabled:opacity-30"
              >
                添加
              </button>
            </div>
            <p className="text-[12px] text-muted-foreground mt-2">推荐加上角色、技能、兴趣或状态，比如 `🎨 Design`、`🤝 Open to chat`</p>
          </div>
        </section>

        {/* Verified accounts */}
        <section className="space-y-4 border-t border-border/40 pt-6">
          <h3 className="text-[13px] font-bold text-foreground sticky top-[57px] bg-background/95 backdrop-blur-md py-2 z-10">已验证账号（选填）</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 flex items-center border border-border rounded-xl px-3 py-2 bg-background gap-2">
                {address ? (
                  <>
                    <span className="text-[13px] font-medium text-foreground flex-1">{address.slice(0, 8)}…{address.slice(-6)}</span>
                    <button
                      type="button"
                      onClick={() => disconnect()}
                      data-testid="wallet-disconnect"
                      className="tap-target text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      断开
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-[13px] font-medium text-muted-foreground flex-1">未连接钱包</span>
                    <WalletConnect />
                  </>
                )}
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
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#229ED9]/10 flex items-center justify-center shrink-0">
                <Send className="w-4 h-4 text-[#229ED9]" />
              </div>
              <div className="flex-1 flex items-center border border-border rounded-xl px-3 py-2 bg-background focus-within:border-foreground transition-colors">
                <input value={telegram} onChange={e => setTelegram(e.target.value)} placeholder="username 或 @handle" className="w-full text-[13px] font-medium outline-none bg-transparent" />
              </div>
            </div>
          </div>
        </section>

        {/* Highlights */}
        <section className="space-y-4 border-t border-border/40 pt-6">
          <div className="flex items-center justify-between sticky top-[57px] bg-background/95 backdrop-blur-md py-2 z-10">
            <h3 className="text-[13px] font-bold text-foreground">高光时刻 (Highlights)</h3>
            <button onClick={addHighlight} className="tap-target text-[12px] font-semibold text-foreground hover:opacity-70 transition-opacity">+ 添加</button>
          </div>
          {highlights.length === 0 ? (
            <button
              onClick={addHighlight}
              className="tap-target w-full rounded-2xl border border-dashed border-border bg-card/30 p-6 flex flex-col items-center gap-3 text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-[24px]">✨</div>
              <div className="text-[13px] font-semibold">添加你的高光时刻</div>
              <div className="text-[12px]">比如“拿到 A 轮融资”或“跑了人生第一个马拉松”</div>
            </button>
          ) : (
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
                  <button onClick={() => removeHighlight(h.id)} className="tap-target text-muted-foreground hover:text-foreground transition-colors mt-2 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </motion.div>
  );
}
