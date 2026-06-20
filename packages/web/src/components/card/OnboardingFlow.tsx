import { useState, type ChangeEvent } from 'react';
import { User, Smile } from 'lucide-react';
import { motion } from 'motion/react';
import type { Profile } from '../../store';
import {
  AVATAR_SEEDS,
  MBTI_OPTIONS,
  ZODIAC_OPTIONS,
  AGE_OPTIONS,
  LOCATION_PRESETS,
  addTagItem,
  removeTagItem,
} from './constants';
import ChipSelector from '../ui/ChipSelector';

export default function OnboardingFlow({
  onComplete,
}: {
  onComplete: (data: Partial<Profile>) => void;
}) {
  const [step, setStep] = useState(-1);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [selectedTags, setSelectedTags] = useState<{ label: string; icon: string }[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [mbti, setMbti] = useState('');
  const [zodiac, setZodiac] = useState('');
  const [age, setAge] = useState('');
  const [location, setLocation] = useState('');
  const [locationFocused, setLocationFocused] = useState(false);
  const [highlights, setHighlights] = useState<Profile['highlights']>([{ id: Date.now(), title: '', type: '', icon: '✨', link: '' }]);
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

  const hasValidHighlights = highlights.some(h => h.title.trim());

  const finish = () => {
    onComplete({
      name,
      handle,
      bio,
      mbti,
      zodiac,
      age,
      location: location.trim() || undefined,
      tags: selectedTags,
      highlights: highlights.filter(h => h.title.trim()),
      avatar: avatarMode === 'custom' && customAvatar ? customAvatar : `https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=transparent`,
    });
  };

  const totalSteps = 5;
  const currentStepIndex = step + 1;
  const progress = Math.max(0, Math.min(100, (currentStepIndex / (totalSteps - 1)) * 100));

  const canProceed = () => {
    if (step === 0) return !!name.trim();
    if (step === 3) return hasValidHighlights;
    return true;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative">
      {step >= 0 && (
        <div className="px-6 pt-4 sm:pt-6 pb-2 shrink-0">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Step {currentStepIndex} / {totalSteps - 1}</span>
            <span className="text-[11px] font-semibold text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <div className="h-[2px] bg-secondary rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className="h-full bg-foreground rounded-full" />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 pb-6 no-scrollbar min-h-0">
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
            <div className="flex flex-col min-h-full pt-4">
              <div className="flex-1 space-y-5">
                <div>
                  <h2 className="text-[24px] font-bold text-foreground mb-1 tracking-tight">你是谁</h2>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    名字和一句话介绍会显示在名片顶部。
                  </p>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full mb-3 overflow-hidden bg-secondary">
                    <img src={avatarMode === 'custom' && customAvatar ? customAvatar : `https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=transparent`} loading="lazy" decoding="async" className="w-full h-full rounded-full bg-secondary object-cover" alt="avatar" />
                  </div>
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => setAvatarMode('generated')}
                      className={`tap-target px-3 py-1 rounded-full text-[12px] font-semibold transition-all border ${avatarMode === 'generated' ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:border-foreground'}`}
                    >
                      生成头像
                    </button>
                    <label className={`tap-target px-3 py-1 rounded-full text-[12px] font-semibold transition-all border cursor-pointer ${avatarMode === 'custom' ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:border-foreground'}`}>
                      <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                      上传头像
                    </label>
                  </div>
                  {avatarMode === 'generated' ? (
                    <div className="flex gap-2 flex-wrap justify-center max-w-[220px] sm:max-w-[260px]">
                      {AVATAR_SEEDS.slice(0, 8).map((seed, i) => (
                        <button key={seed} onClick={() => setAvatarSeed(seed)} className={`tap-target w-7 h-7 rounded-full overflow-hidden border transition-all ${i >= 6 ? 'hidden sm:inline-flex' : ''} ${avatarSeed === seed ? 'border-foreground scale-110' : 'border-transparent opacity-50 hover:opacity-80'}`}>
                          <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=transparent`} loading="lazy" decoding="async" className="w-full h-full bg-secondary" alt={seed} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => { setCustomAvatar(null); setAvatarMode('generated'); }} className="tap-target text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
                      移除自定义头像
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[12px] font-semibold text-muted-foreground mb-2 block">名字 *</label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="你的名字或昵称" className="w-full border border-border rounded-xl px-4 py-3 text-[15px] font-semibold text-foreground outline-none focus:border-foreground transition-colors bg-background" />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-muted-foreground mb-2 block">个人签名（选填）</label>
                    <input value={handle} onChange={e => setHandle(e.target.value)} placeholder="一句话介绍自己" className="w-full border border-border rounded-xl px-4 py-3 text-[14px] font-medium text-foreground outline-none focus:border-foreground transition-colors bg-background" />
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
                    <label className="text-[12px] font-semibold text-muted-foreground mb-2 block flex items-center gap-1.5">
                      个人简介
                      <Smile className="w-3.5 h-3.5 text-muted-foreground" />
                    </label>
                    <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="写一段有趣的自我介绍，支持 emoji ✨" className="w-full border border-border rounded-xl px-4 py-3 text-[14px] font-medium text-foreground outline-none focus:border-foreground transition-colors bg-background resize-none h-24" />
                  </div>
                  <div className="pt-2 border-t border-border/50 space-y-4">
                    <label className="text-[12px] font-semibold text-muted-foreground mb-1 block">特殊标识（选填）</label>
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
                        className="w-full border border-border rounded-xl px-4 py-3 text-[13px] font-medium text-foreground outline-none focus:border-foreground transition-colors bg-background"
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
                  {selectedTags.length > 0 && selectedTags.map(tag => (
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
                <div className="rounded-[16px] border border-border bg-card/60 p-3 backdrop-blur-sm">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                        <line x1="9" y1="9" x2="9.01" y2="9" />
                        <line x1="15" y1="9" x2="15.01" y2="9" />
                      </svg>
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
                      className="tap-target h-10 px-4 rounded-xl bg-foreground text-background text-[13px] font-semibold disabled:opacity-30"
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
                        className="tap-target inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground text-background text-[12px] font-semibold"
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

          {step === 3 && (
            <div className="flex flex-col h-full pt-4">
              <div className="flex-1 space-y-6">
                <div>
                  <h2 className="text-[24px] font-bold text-foreground mb-1 tracking-tight">高光时刻</h2>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    至少填写一个，让名片更有记忆点。
                  </p>
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
                      <button onClick={() => removeHighlight(h.id)} className="tap-target text-muted-foreground hover:text-foreground transition-colors mt-2 shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addHighlight}
                  className="tap-target w-full rounded-xl border border-dashed border-border bg-card/30 py-3 flex items-center justify-center gap-2 text-[13px] font-semibold text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                >
                  + 添加更多高光
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <div className="shrink-0 bg-gradient-to-t from-background via-background to-transparent pt-4 pb-3 px-5 sm:px-6">
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
            onClick={() => step < 3 ? setStep(s => s + 1) : finish()}
            disabled={!canProceed()}
            className="tap-target flex-1 h-11 rounded-lg bg-foreground text-background font-semibold text-[15px] flex items-center justify-center hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30"
          >
            {step === -1 ? '开始' : step < 3 ? '继续' : '完成'}
          </button>
        </div>
      </div>
    </div>
  );
}
