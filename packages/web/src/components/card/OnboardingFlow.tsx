import { useState, type ChangeEvent } from 'react';
import { User } from 'lucide-react';
import { motion } from 'motion/react';
import type { Profile } from '../../store';
import {
  AVATAR_SEEDS,
  LOOKING_FOR_OPTIONS,
  TAG_OPTIONS,
  addTagItem,
  removeTagItem,
} from './constants';

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
                    <img src={currentAvatarUrl} loading="lazy" decoding="async" className="w-full h-full rounded-full bg-secondary object-cover" alt="avatar" />
                  </div>
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => setAvatarMode('generated')}
                      className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-all border ${avatarMode === 'generated' ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:border-foreground'}`}
                    >
                      生成头像
                    </button>
                    <label className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-all border cursor-pointer ${avatarMode === 'custom' ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:border-foreground'}`}>
                      <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                      上传头像
                    </label>
                  </div>
                  {avatarMode === 'generated' ? (
                    <div className="flex gap-2 flex-wrap justify-center max-w-[220px] sm:max-w-[260px]">
                      {AVATAR_SEEDS.slice(0, 8).map((seed, i) => (
                        <button key={seed} onClick={() => setAvatarSeed(seed)} className={`w-7 h-7 rounded-full overflow-hidden border transition-all ${i >= 6 ? 'hidden sm:inline-flex' : ''} ${avatarSeed === seed ? 'border-foreground scale-110' : 'border-transparent opacity-50 hover:opacity-80'}`}>
                          <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=transparent`} loading="lazy" decoding="async" className="w-full h-full bg-secondary" alt={seed} />
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
                  {TAG_OPTIONS.map(tag => {
                    const isSelected = selectedTags.some(t => t.label === tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold transition-all border ${
                          isSelected
                            ? 'bg-foreground text-background border-foreground shadow-sm scale-95'
                            : 'bg-background text-foreground border-border hover:border-foreground hover:bg-secondary/50'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-[16px] border border-border bg-card/60 p-3 backdrop-blur-sm mt-4">
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
                        placeholder="输入自定义标签..."
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
                  <div className="mt-4">
                    <div className="text-[12px] font-semibold text-muted-foreground mb-3">已选标签 ({selectedTags.length}/5)</div>
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
                  </div>
                )}
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
