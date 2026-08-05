import { useState, type ChangeEvent } from 'react';
import { User, Smile, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import type { Profile } from '../../store';
import { useToast } from '../ui/ToastProvider';
import { generateAvatarFromPrompt, pickRandomAvatarSeed } from '../../lib/genai';
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
  const [event, setEvent] = useState('');
  const [lookingFor, setLookingFor] = useState('');
  const [highlights, setHighlights] = useState<Profile['highlights']>([{ id: Date.now(), title: '', type: '', icon: '✨', link: '' }]);
  const [avatarSeed, setAvatarSeed] = useState(AVATAR_SEEDS[0]);
  const [customAvatar, setCustomAvatar] = useState<string | null>(null);
  const [avatarMode, setAvatarMode] = useState<'generated' | 'custom'>('generated');
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const toast = useToast();

  const handleGenerateAvatar = async () => {
    if (isGeneratingAvatar) return;
    setAvatarMode('generated');
    setIsGeneratingAvatar(true);
    const prompt = [name.trim(), bio.trim()].filter(Boolean).join(' — ') || 'a friendly creative person';
    const result = await generateAvatarFromPrompt(prompt);
    setIsGeneratingAvatar(false);
    if (result.ok === true) {
      setCustomAvatar(result.dataUrl);
      setAvatarMode('custom');
      toast.show({ type: 'success', message: 'AI 头像已生成', duration: 1800 });
    } else {
      setAvatarSeed(pickRandomAvatarSeed(AVATAR_SEEDS));
      const reason = result.reason === 'unconfigured' ? '未配置 Gemini key' : 'AI 生成失败';
      toast.show({ type: 'info', title: reason, message: result.message, duration: 2400 });
    }
  };

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
      event: event.trim() || undefined,
      lookingFor: lookingFor.trim() || undefined,
      tags: selectedTags,
      highlights: highlights.filter(h => h.title.trim()),
      avatar: avatarMode === 'custom' && customAvatar ? customAvatar : `https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=transparent`,
    });
  };

  const totalSteps = 6;
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
                  <p className="text-[15px] text-muted-foreground font-medium leading-relaxed max-w-[280px] mx-auto">
                    一张会越来越懂你的 AI 名片。先和 Vibe 聊几句，它会慢慢记住你。
                  </p>
                </div>

                <div className="w-full max-w-[300px] bg-secondary/50 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-[13px] font-bold text-foreground shrink-0 shadow-sm">1</div>
                    <div className="text-[14px] font-semibold text-foreground">跟 Vibe 聊几句</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-[13px] font-bold text-foreground shrink-0 shadow-sm">2</div>
                    <div className="text-[14px] font-semibold text-foreground">选你想公开的那一面</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-[13px] font-bold text-foreground shrink-0 shadow-sm">3</div>
                    <div className="text-[14px] font-semibold text-foreground">别人先和你的 Vibe 聊</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 0 && (
            <div className="flex flex-col min-h-full pt-4">
              <div className="flex-1 space-y-5">
                <div>
                  <h2 className="text-[24px] font-bold text-foreground mb-1 tracking-tight">先让我认识你</h2>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    Vibe 会记住这些，也会出现在你公开的 Card 上。
                  </p>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full mb-3 overflow-hidden bg-secondary">
                    <img src={avatarMode === 'custom' && customAvatar ? customAvatar : `https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=transparent`} loading="lazy" decoding="async" className="w-full h-full rounded-full bg-secondary object-cover" alt="avatar" />
                  </div>
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={handleGenerateAvatar}
                      disabled={isGeneratingAvatar}
                      data-testid="onboarding-generate-avatar"
                      className={`tap-target inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold transition-all border ${avatarMode === 'custom' ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:border-foreground'} disabled:opacity-50`}
                    >
                      {isGeneratingAvatar && <Loader2 className="h-3 w-3 animate-spin" />}
                      {isGeneratingAvatar ? '生成中…' : '生成头像'}
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
                  <h2 className="text-[24px] font-bold text-foreground mb-1 tracking-tight">再多说一点</h2>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    写一段让自己也满意的话，Vibe 会拿它来理解你。
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
                  <h2 className="text-[24px] font-bold text-foreground mb-1 tracking-tight">你是什么样的人</h2>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    最多 5 个，支持自定义和 emoji，Vibe 会拿这些去理解别人和你有什么交集。
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
                  <h2 className="text-[24px] font-bold text-foreground mb-1 tracking-tight">值得被记住的几件事</h2>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    至少填一个，Vibe 会在聊到相关话题时回想起来。
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

          {step === 4 && (
            <div className="flex flex-col h-full pt-4">
              <div className="flex-1 space-y-6">
                <div>
                  <h2 className="text-[24px] font-bold text-foreground mb-1 tracking-tight">想遇见谁 / 最近在哪</h2>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    都可以跳过，但写了更精准——Vibe 会拿这些去找真正同频的人。
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-[12px] font-bold uppercase tracking-widest text-muted-foreground">最近在哪儿出现（选填）</label>
                  <div className="rounded-[16px] border border-border bg-card/60 backdrop-blur-sm flex items-center px-3 py-2.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-muted-foreground shrink-0 mr-2">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <input
                      value={event}
                      onChange={e => setEvent(e.target.value)}
                      placeholder="如 一次线下活动 / 你常出没的地方"
                      className="w-full bg-transparent text-[14px] font-medium outline-none placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground/70">会作为 tag 出现在名片顶部，让线下相遇时容易认出你。</p>
                </div>

                <div className="space-y-2">
                  <label className="block text-[12px] font-bold uppercase tracking-widest text-muted-foreground">想遇见什么样的人（选填）</label>
                  <div className="rounded-[16px] border border-border bg-card/60 backdrop-blur-sm flex items-center px-3 py-2.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-muted-foreground shrink-0 mr-2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      value={lookingFor}
                      onChange={e => setLookingFor(e.target.value)}
                      placeholder="如 也做 AI 记忆产品的人 / 跑友 / 投资人"
                      className="w-full bg-transparent text-[14px] font-medium outline-none placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>
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
            onClick={() => step < 4 ? setStep(s => s + 1) : finish()}
            disabled={!canProceed()}
            className="tap-target flex-1 h-11 rounded-lg bg-foreground text-background font-semibold text-[15px] flex items-center justify-center hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30"
          >
            {step === -1 ? '开始' : step < 4 ? '继续' : '完成'}
          </button>
        </div>
      </div>
    </div>
  );
}
