import { useState, type ChangeEvent } from 'react';
import {
  Wallet, Twitter, MessageCircle, Trash2, SmilePlus,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAccount } from 'wagmi';
import type { Profile } from '../../store';
import {
  AVATAR_SEEDS,
  LOOKING_FOR_OPTIONS,
  EVENT_OPTIONS,
  TAG_OPTIONS,
  addTagItem,
  removeTagItem,
} from './constants';

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
  const [name, setName] = useState(profile.name);
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio);
  const [lookingFor, setLookingFor] = useState(profile.lookingFor);
  const [event, setEvent] = useState(profile.event);
  const [selectedTags, setSelectedTags] = useState(profile.tags);
  const [customTag, setCustomTag] = useState('');
  const [highlights, setHighlights] = useState(profile.highlights);
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
      verified: { wallet: address || profile.verified.wallet, twitter, discord, wechat },
      avatar: avatarMode === 'custom' && customAvatar ? customAvatar : `https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=transparent`,
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 24, stiffness: 200 }} className="absolute inset-0 bg-background z-50 overflow-y-auto pb-8">
      <div className="max-w-2xl mx-auto w-full">
        <div className="sticky top-0 bg-background z-20 px-6 py-4 flex justify-between items-center border-b border-border">
          <button onClick={onClose} className="text-[14px] font-semibold text-muted-foreground hover:text-foreground transition-colors">取消</button>
          <span className="font-bold text-[15px] tracking-tight text-foreground">编辑名片</span>
          <button onClick={save} className="text-[14px] font-semibold text-foreground hover:opacity-70 transition-opacity">保存</button>
        </div>
        <div className="px-6 py-6 space-y-6">
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-full mb-3 overflow-hidden bg-secondary">
            <img src={currentAvatarUrl} loading="lazy" decoding="async" alt="Avatar" className="w-full h-full object-cover" />
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
                  <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=transparent`} loading="lazy" decoding="async" className="w-full h-full bg-secondary" alt={seed} />
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
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
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
                className="h-11 px-4 rounded-xl bg-foreground text-background text-[13px] font-semibold disabled:opacity-30"
              >
                添加
              </button>
            </div>
            <p className="text-[12px] text-muted-foreground mt-2">推荐加上角色、技能、兴趣或状态，比如 `🎨 Design`、`🤝 Open to chat`</p>
          </div>
        </div>

        <div>
          <label className="text-[12px] font-semibold text-muted-foreground mb-3 block">已验证账号（选填）</label>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 flex items-center border border-border rounded-xl px-3 py-2 bg-background">
                {address ? (
                  <span className="text-[13px] font-medium text-foreground">{address.slice(0, 8)}…{address.slice(-6)}</span>
                ) : (
                  <span className="text-[13px] font-medium text-muted-foreground">未连接钱包</span>
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
      </div>
    </motion.div>
  );
}
