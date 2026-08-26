import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { ArrowLeft, Check, Link2, LoaderCircle, Pencil, RotateCcw, Send, Sparkles, User, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { CardDraft, Memory, MemoryKind, MemoryVisibility, VibeCard } from '@shared';
import type { Profile } from '../../store';
import { useToast } from '../ui/ToastProvider';
import { pickRandomAvatarSeed } from '../../lib/genai';
import { AVATAR_SEEDS } from './constants';
import { loadLocalMemories, loadRuntimeConfig, ownerApi, saveLocalMemories } from '../../lib/runtime';

type Phase = 'intro' | 'identity' | 'conversation' | 'memory' | 'generating' | 'preview';
const QUESTIONS = [
  { key: 'focus', question: '你最近主要在做什么？', hint: '不用像写简历，像平时聊天一样告诉我就好。', placeholder: '例如：我最近在做一个帮助人们建立真实连接的 AI 产品…' },
  { key: 'highlight', question: '哪件作品或经历最像你？', hint: '挑一件你愿意放在名片上的就够了。', placeholder: '例如：我独立做完并发布了第一个微信 AI 小程序…' },
  { key: 'help', question: '你可以帮别人解决什么？', hint: '越具体，访客越容易知道什么时候该来找你。', placeholder: '例如：我可以帮早期团队梳理 AI 产品体验和隐私边界…' },
  { key: 'meet', question: '你最近想认识什么样的人？', hint: '这会成为 Card 上公开的「想遇见谁」。', placeholder: '例如：真正做过个人 AI、也在意真实关系的人…' },
  { key: 'boundary', question: '有什么事情不希望我对陌生人说？', hint: '这条只用来保护你的边界，不会写进公开 Card。', placeholder: '例如：不要透露我的私人联系方式和未公开项目细节…' },
] as const;
type AnswerKey = typeof QUESTIONS[number]['key'];
type Answers = Record<AnswerKey, string>;
const EMPTY_ANSWERS: Answers = { focus: '', highlight: '', help: '', meet: '', boundary: '' };
const SESSION_KEY = 'vibecard_onboarding_v1';

interface MemoryCandidate { id: string; content: string; draft: string; kind: MemoryKind; visibility: MemoryVisibility; questionKey: AnswerKey }
interface EditableCardDraft { headline: string; currentFocus: string; canHelpWith: string; wantsToMeet: string; topics: string; highlight: string }
interface SavedSession {
  version: 1; phase: Phase; questionIndex: number; name: string; answers: Answers; approvedAnswers: Answers; draft: string;
  avatarSeed: string; customAvatar: string | null; avatarMode: 'generated' | 'custom'; identityReady: boolean;
  pendingMemory: MemoryCandidate | null; cardDraft: EditableCardDraft | null; runtimeKey: string; draftMemoryIds: string[];
  draftMemoryIdsByQuestion: Partial<Record<AnswerKey, string>>;
  pendingMessageId: string; publishNeedsReconcile: boolean;
  sourceLinksText: string;
}

interface SourceLink { title: string; url: string }

function parseSourceLinks(value: string): { links: SourceLink[]; error: string | null } {
  const rawLinks = value.split(/\n+/).map(item => item.trim()).filter(Boolean);
  if (rawLinks.length > 3) return { links: [], error: '最多添加 3 个公开链接。' };
  const links: SourceLink[] = [];
  for (const raw of rawLinks) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('unsafe');
      const hostname = parsed.hostname.replace(/^www\./, '');
      links.push({ title: hostname, url: parsed.toString() });
    } catch {
      return { links: [], error: '公开链接需要使用完整的 HTTPS 地址，每行一个。' };
    }
  }
  return { links, error: null };
}

function currentRuntimeKey(): string {
  const runtime = loadRuntimeConfig();
  return runtime ? `${runtime.mode}|${runtime.endpoint}` : 'local|';
}

function loadSession(): SavedSession | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as Partial<SavedSession> | null;
    if (!parsed || parsed.version !== 1 || !parsed.answers) return null;
    const runtimeKey = currentRuntimeKey();
    const draftMemoryIdsByQuestion = parsed.draftMemoryIdsByQuestion && typeof parsed.draftMemoryIdsByQuestion === 'object'
      ? parsed.draftMemoryIdsByQuestion
      : {};
    return { version: 1, phase: parsed.phase ?? 'intro', questionIndex: Math.min(4, Math.max(0, parsed.questionIndex ?? 0)), name: parsed.name ?? '', answers: { ...EMPTY_ANSWERS, ...parsed.answers }, approvedAnswers: { ...EMPTY_ANSWERS, ...parsed.approvedAnswers }, draft: parsed.draft ?? '', avatarSeed: parsed.avatarSeed ?? AVATAR_SEEDS[0], customAvatar: parsed.customAvatar ?? null, avatarMode: parsed.avatarMode ?? 'generated', identityReady: parsed.runtimeKey === runtimeKey && (parsed.identityReady ?? false), pendingMemory: parsed.pendingMemory ?? null, cardDraft: parsed.cardDraft ?? null, runtimeKey, draftMemoryIds: Object.values(draftMemoryIdsByQuestion).filter((id): id is string => typeof id === 'string'), draftMemoryIdsByQuestion, pendingMessageId: typeof parsed.pendingMessageId === 'string' ? parsed.pendingMessageId : '', publishNeedsReconcile: parsed.publishNeedsReconcile === true, sourceLinksText: typeof parsed.sourceLinksText === 'string' ? parsed.sourceLinksText : '' };
  } catch { return null; }
}

function helpTopics(answer: string): Profile['tags'] {
  return answer.split(/[、，,；;。\n]/).map(item => item.trim()).filter(Boolean).slice(0, 5).map(label => ({ label, icon: '' }));
}
function localProposal(key: AnswerKey, content: string): Omit<MemoryCandidate, 'id' | 'draft' | 'questionKey'> {
  const mapping: Record<AnswerKey, { kind: MemoryKind; visibility: MemoryVisibility }> = {
    focus: { kind: 'current', visibility: 'public' }, highlight: { kind: 'fact', visibility: 'public' },
    help: { kind: 'fact', visibility: 'public' }, meet: { kind: 'preference', visibility: 'public' },
    boundary: { kind: 'boundary', visibility: 'private' },
  };
  return { content, ...mapping[key] };
}
function draftFromAnswers(answers: Answers, draft: CardDraft = {}): EditableCardDraft {
  return { headline: draft.headline ?? '', currentFocus: draft.currentFocus ?? answers.focus, canHelpWith: (draft.canHelpWith ?? (answers.help ? [answers.help] : [])).join('\n'), wantsToMeet: (draft.wantsToMeet ?? (answers.meet ? [answers.meet] : [])).join('\n'), topics: (draft.topics ?? helpTopics(answers.help).map(item => item.label)).join('、'), highlight: draft.highlights?.[0]?.title ?? answers.highlight };
}
function errorCopy(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return /401|403|unauthorized|permission|token/i.test(message)
    ? '当前身份没有权限继续。请检查主人令牌后重试，已填写的内容仍保留。'
    : '暂时没能完成这一步。已填写的内容仍保留，可以安全重试。';
}

export default function OnboardingFlow({ onComplete }: { onComplete: (data: Partial<Profile>) => void }) {
  const restored = useMemo(loadSession, []);
  const [phase, setPhase] = useState<Phase>(restored?.phase ?? 'intro');
  const [questionIndex, setQuestionIndex] = useState(restored?.questionIndex ?? 0);
  const [name, setName] = useState(restored?.name ?? '');
  const [answers, setAnswers] = useState<Answers>(restored?.answers ?? EMPTY_ANSWERS);
  const [approvedAnswers, setApprovedAnswers] = useState<Answers>(restored?.approvedAnswers ?? EMPTY_ANSWERS);
  const [draft, setDraft] = useState(restored?.draft ?? '');
  const [avatarSeed, setAvatarSeed] = useState(restored?.avatarSeed ?? AVATAR_SEEDS[0]);
  const [customAvatar, setCustomAvatar] = useState<string | null>(restored?.customAvatar ?? null);
  const [avatarMode, setAvatarMode] = useState<'generated' | 'custom'>(restored?.avatarMode ?? 'generated');
  const [identityReady, setIdentityReady] = useState(restored?.identityReady ?? false);
  const [pendingMemory, setPendingMemory] = useState<MemoryCandidate | null>(restored?.pendingMemory ?? null);
  const [cardDraft, setCardDraft] = useState<EditableCardDraft | null>(restored?.cardDraft ?? null);
  const [draftMemoryIds, setDraftMemoryIds] = useState<string[]>(restored?.draftMemoryIds ?? []);
  const [draftMemoryIdsByQuestion, setDraftMemoryIdsByQuestion] = useState<Partial<Record<AnswerKey, string>>>(restored?.draftMemoryIdsByQuestion ?? {});
  const [pendingMessageId, setPendingMessageId] = useState(restored?.pendingMessageId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [publishNeedsReconcile, setPublishNeedsReconcile] = useState(restored?.publishNeedsReconcile ?? false);
  const [sourceLinksText, setSourceLinksText] = useState(restored?.sourceLinksText ?? '');
  const toast = useToast();
  const avatar = avatarMode === 'custom' && customAvatar ? customAvatar : `https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=transparent`;
  const currentQuestion = QUESTIONS[questionIndex];
  const progress = ((questionIndex + 1) / QUESTIONS.length) * 100;

  useEffect(() => {
    const session: SavedSession = { version: 1, phase, questionIndex, name, answers, approvedAnswers, draft, avatarSeed, customAvatar, avatarMode, identityReady, pendingMemory, cardDraft, runtimeKey: currentRuntimeKey(), draftMemoryIds, draftMemoryIdsByQuestion, pendingMessageId, publishNeedsReconcile, sourceLinksText };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* keep the live flow usable if browser storage is full */ }
  }, [phase, questionIndex, name, answers, approvedAnswers, draft, avatarSeed, customAvatar, avatarMode, identityReady, pendingMemory, cardDraft, draftMemoryIds, draftMemoryIdsByQuestion, pendingMessageId, publishNeedsReconcile, sourceLinksText]);

  const handleGenerateAvatar = () => { setAvatarMode('generated'); setCustomAvatar(null); setAvatarSeed(pickRandomAvatarSeed(AVATAR_SEEDS)); toast.show({ type: 'success', message: '已换一个头像', duration: 1200 }); };
  const handleAvatarUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader();
    reader.onload = loaded => { setCustomAvatar(loaded.target?.result as string); setAvatarMode('custom'); }; reader.readAsDataURL(file);
  };

  const prepareIdentity = async () => {
    if (!name.trim() || busy) return;
    const parsedLinks = parseSourceLinks(sourceLinksText);
    if (parsedLinks.error) { setError(parsedLinks.error); return; }
    const runtime = loadRuntimeConfig();
    if (!runtime || runtime.mode === 'local' || identityReady) { setIdentityReady(true); setError(''); setPhase('conversation'); return; }
    setBusy(true); setError('');
    try {
      await ownerApi(runtime, '/identity', { method: 'POST', body: JSON.stringify({ name: name.trim(), avatarUrl: avatar }) });
      setIdentityReady(true); setPhase('conversation');
    } catch (caught) {
      if (caught instanceof Error && /identity already exists|identity_exists/i.test(caught.message)) { setIdentityReady(true); setPhase('conversation'); }
      else setError(errorCopy(caught));
    } finally { setBusy(false); }
  };

  const generateCardDraft = async (sourceAnswers = approvedAnswers, scopedMemoryIds = draftMemoryIds) => {
    setPhase('generating'); setBusy(true); setError('');
    try {
      const runtime = loadRuntimeConfig();
      if (!runtime || runtime.mode === 'local') setCardDraft(draftFromAnswers(sourceAnswers));
      else if (scopedMemoryIds.length > 0) {
        try {
          const result = await ownerApi<{ draft: CardDraft }>(runtime, '/card/draft', { method: 'POST', body: JSON.stringify({ memoryIds: scopedMemoryIds }) });
          setCardDraft(draftFromAnswers(sourceAnswers, result.draft));
        } catch (caught) {
          if (caught instanceof Error && /no confirmed|no_confirmed|还没有已确认/i.test(caught.message)) setCardDraft(draftFromAnswers(sourceAnswers));
          else throw caught;
        }
      } else setCardDraft(draftFromAnswers(sourceAnswers));
      setPhase('preview');
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };
  const advance = (sourceAnswers = approvedAnswers, scopedMemoryIds = draftMemoryIds) => {
    setPendingMemory(null); setPendingMessageId(''); setError(''); setDraft('');
    if (questionIndex === QUESTIONS.length - 1) void generateCardDraft(sourceAnswers, scopedMemoryIds);
    else { setQuestionIndex(index => index + 1); setPhase('conversation'); }
  };
  const findRemoteProposal = async (proposalId: string): Promise<MemoryCandidate | null> => {
    const runtime = loadRuntimeConfig(); if (!runtime || runtime.mode === 'local') return null;
    const proposed = await ownerApi<Memory[]>(runtime, '/memories?status=proposed');
    const memory = proposed.find(item => item.id === proposalId);
    if (!memory) return null;
    return { id: memory.id, content: memory.content, draft: memory.content, kind: memory.kind, visibility: currentQuestion.key === 'boundary' ? 'private' : memory.visibility, questionKey: currentQuestion.key };
  };
  const retireApprovedMemory = async (memoryId: string | undefined) => {
    if (!memoryId) return;
    const runtime = loadRuntimeConfig();
    if (!runtime || runtime.mode === 'local') {
      saveLocalMemories(loadLocalMemories().map(item => item.id === memoryId
        ? { ...item, status: 'paused' as const, updatedAt: Date.now() }
        : item));
      return;
    }
    await ownerApi(runtime, `/memories/${memoryId}/pause`, { method: 'POST', body: '{}' });
  };
  const submitAnswer = async (retry = false) => {
    const value = (retry ? answers[currentQuestion.key] : draft).trim(); if (!value || busy) return;
    const nextAnswers = { ...answers, [currentQuestion.key]: value }; setBusy(true); setError('');
    const nextApprovedAnswers = { ...approvedAnswers, [currentQuestion.key]: '' };
    const nextMemoryIdsByQuestion = { ...draftMemoryIdsByQuestion };
    delete nextMemoryIdsByQuestion[currentQuestion.key];
    const nextDraftMemoryIds = Object.values(nextMemoryIdsByQuestion).filter((id): id is string => typeof id === 'string');
    try {
      await retireApprovedMemory(draftMemoryIdsByQuestion[currentQuestion.key]);
      setAnswers(nextAnswers);
      setApprovedAnswers(nextApprovedAnswers);
      setDraftMemoryIdsByQuestion(nextMemoryIdsByQuestion);
      setDraftMemoryIds(nextDraftMemoryIds);
      const runtime = loadRuntimeConfig();
      if (!runtime || runtime.mode === 'local') {
        const base = localProposal(currentQuestion.key, value);
        const existing = loadLocalMemories().find(item => item.status === 'proposed' && item.content === base.content && item.kind === base.kind);
        const id = existing?.id ?? `onboarding-${currentQuestion.key}-${crypto.randomUUID()}`;
        if (!existing) { const now = Date.now(); saveLocalMemories([...loadLocalMemories(), { id, schemaVersion: 1, ownerId: 'owner-local', ...base, status: 'proposed', sourceConversationId: 'onboarding-v1', sourceMessageIds: [`question-${currentQuestion.key}`], createdAt: now, updatedAt: now }]); }
        setPendingMemory({ id, ...base, draft: base.content, questionKey: currentQuestion.key }); setPhase('memory');
      } else {
        const clientMessageId = pendingMessageId || crypto.randomUUID();
        if (!pendingMessageId) setPendingMessageId(clientMessageId);
        const result = await ownerApi<{ memoryProposalId?: string }>(runtime, '/vibe/messages', { method: 'POST', body: JSON.stringify({ message: value, clientMessageId }) });
        const candidate = result.memoryProposalId ? await findRemoteProposal(result.memoryProposalId) : null;
        if (result.memoryProposalId && !candidate) throw new Error('authoritative memory proposal is not available yet');
        if (candidate) { setPendingMemory(candidate); setPhase('memory'); } else advance(nextApprovedAnswers, nextDraftMemoryIds);
      }
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };
  const decideMemory = async (remember: boolean) => {
    if (!pendingMemory || busy) return; setBusy(true); setError('');
    try {
      const runtime = loadRuntimeConfig();
      if (!runtime || runtime.mode === 'local') {
        saveLocalMemories(loadLocalMemories().map(item => item.id === pendingMemory.id ? { ...item, content: pendingMemory.draft.trim(), visibility: pendingMemory.questionKey === 'boundary' ? 'private' as const : 'public' as const, status: remember ? 'confirmed' as const : 'deleted' as const, updatedAt: Date.now() } : item));
      } else await ownerApi(runtime, `/memories/${pendingMemory.id}/${remember ? 'confirm' : 'reject'}`, { method: 'POST', body: remember ? JSON.stringify({ content: pendingMemory.draft.trim(), visibility: pendingMemory.questionKey === 'boundary' ? 'private' : 'public' }) : '{}' });
      const nextMemoryIdsByQuestion = { ...draftMemoryIdsByQuestion };
      if (remember && pendingMemory.questionKey !== 'boundary') nextMemoryIdsByQuestion[pendingMemory.questionKey] = pendingMemory.id;
      else delete nextMemoryIdsByQuestion[pendingMemory.questionKey];
      const nextDraftMemoryIds = Object.values(nextMemoryIdsByQuestion).filter((id): id is string => typeof id === 'string');
      const nextApprovedAnswers = remember && pendingMemory.questionKey !== 'boundary'
        ? { ...approvedAnswers, [pendingMemory.questionKey]: pendingMemory.draft.trim() }
        : approvedAnswers;
      setDraftMemoryIdsByQuestion(nextMemoryIdsByQuestion);
      setDraftMemoryIds(nextDraftMemoryIds);
      if (nextApprovedAnswers !== approvedAnswers) setApprovedAnswers(nextApprovedAnswers);
      advance(nextApprovedAnswers, nextDraftMemoryIds);
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    if (!cardDraft || busy) return; setBusy(true); setError('');
    const parsedLinks = parseSourceLinks(sourceLinksText);
    if (parsedLinks.error) { setBusy(false); setError(parsedLinks.error); return; }
    const highlights: Profile['highlights'] = [
      ...(cardDraft.highlight.trim() ? [{ id: Date.now(), title: cardDraft.highlight.trim(), type: 'experience', icon: '✨', link: '' }] : []),
      ...parsedLinks.links.map((link, index) => ({ id: Date.now() + index + 1, title: link.title, type: 'link', icon: '↗', link: link.url })),
    ].slice(0, 4);
    const updates: Partial<Profile> = { name: name.trim(), avatar, handle: cardDraft.headline.trim(), bio: cardDraft.currentFocus.trim(), canHelpWith: cardDraft.canHelpWith.split('\n').map(item => item.trim()).filter(Boolean), lookingFor: cardDraft.wantsToMeet.split('\n').map(item => item.trim()).filter(Boolean)[0] ?? '', tags: cardDraft.topics.split(/[、，,\n]/).map(item => item.trim()).filter(Boolean).slice(0, 8).map(label => ({ label, icon: '' })), highlights };
    try {
      const runtime = loadRuntimeConfig();
      const payload = { name: updates.name, avatarUrl: updates.avatar, headline: updates.handle, currentFocus: updates.bio, canHelpWith: updates.canHelpWith, wantsToMeet: updates.lookingFor ? [updates.lookingFor] : [], topics: updates.tags?.map(item => item.label) ?? [], highlights: updates.highlights?.map(item => ({ title: item.title, ...(item.link ? { url: item.link } : {}) })) ?? [], agentEnabled: true };
      if (runtime && runtime.mode !== 'local') {
        let alreadyPublished = false;
        if (publishNeedsReconcile) {
          try {
            const current = await ownerApi<VibeCard>(runtime, '/card');
            alreadyPublished = current.name === payload.name && current.avatarUrl === payload.avatarUrl && current.headline === payload.headline && current.currentFocus === payload.currentFocus
              && JSON.stringify(current.canHelpWith) === JSON.stringify(payload.canHelpWith) && JSON.stringify(current.wantsToMeet) === JSON.stringify(payload.wantsToMeet)
              && JSON.stringify(current.topics) === JSON.stringify(payload.topics) && JSON.stringify(current.highlights.map(item => ({ title: item.title, ...(item.url ? { url: item.url } : {}) }))) === JSON.stringify(payload.highlights)
              && current.agentEnabled === payload.agentEnabled;
          } catch { /* if reconciliation itself fails, retry the idempotent PUT */ }
        }
        if (!alreadyPublished) await ownerApi(runtime, '/card', { method: 'PUT', body: JSON.stringify(payload) });
      }
      setPublishNeedsReconcile(false);
      localStorage.removeItem(SESSION_KEY); onComplete(updates); window.dispatchEvent(new Event('vibecard-onboarding-complete'));
    } catch (caught) { setPublishNeedsReconcile(true); setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };
  const skipQuestion = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await retireApprovedMemory(draftMemoryIdsByQuestion[currentQuestion.key]);
    } catch (caught) {
      setError(errorCopy(caught)); setBusy(false); return;
    }
    const nextAnswers = { ...answers, [currentQuestion.key]: '' }; setAnswers(nextAnswers); setDraft('');
    const nextApprovedAnswers = { ...approvedAnswers, [currentQuestion.key]: '' }; setApprovedAnswers(nextApprovedAnswers);
    const nextMemoryIdsByQuestion = { ...draftMemoryIdsByQuestion };
    delete nextMemoryIdsByQuestion[currentQuestion.key];
    const nextDraftMemoryIds = Object.values(nextMemoryIdsByQuestion).filter((id): id is string => typeof id === 'string');
    setDraftMemoryIdsByQuestion(nextMemoryIdsByQuestion); setDraftMemoryIds(nextDraftMemoryIds); setPendingMessageId('');
    setBusy(false);
    if (questionIndex === QUESTIONS.length - 1) void generateCardDraft(nextApprovedAnswers, nextDraftMemoryIds); else setQuestionIndex(index => index + 1);
  };
  const goBack = () => {
    setError('');
    if (phase === 'identity') return setPhase('intro');
    if (phase === 'preview') { setQuestionIndex(QUESTIONS.length - 1); setDraft(answers.boundary); setPhase('conversation'); return; }
    if (phase === 'memory') { setPendingMemory(null); setPendingMessageId(''); setDraft(answers[currentQuestion.key]); setPhase('conversation'); return; }
    if (phase === 'conversation') { if (questionIndex === 0) return setPhase('identity'); const previousIndex = questionIndex - 1; setQuestionIndex(previousIndex); setDraft(answers[QUESTIONS[previousIndex].key]); }
  };

  if (phase === 'intro') return <div className="flex-1 flex flex-col h-full bg-background px-6 pb-4"><div className="flex flex-col h-full min-h-[480px] pt-8"><div className="flex flex-col items-center space-y-8 flex-1"><motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }}><div className="w-20 h-20 rounded-2xl bg-foreground flex items-center justify-center shadow-lg"><User className="w-10 h-10 text-background" /></div></motion.div><div className="text-center space-y-3"><h1 className="text-[32px] font-black text-foreground leading-tight tracking-tight">vibecard</h1><p className="text-[15px] text-muted-foreground font-medium leading-relaxed max-w-[310px] mx-auto">放进你的个人链接，再和 Vibe 聊几句。一键生成一个会介绍你的 AI 个人主页。</p></div><div className="w-full max-w-[320px] rounded-[22px] border border-border/60 bg-card/70 p-5"><div className="flex items-start gap-3"><Sparkles className="w-5 h-5 mt-0.5 text-amber-700 shrink-0" /><p className="text-[14px] font-medium leading-relaxed text-foreground/80">先免费生成并分享。自己的域名、自托管和完整迁移，都可以发布后再设置。</p></div></div></div><button onClick={() => setPhase('identity')} className="tap-target w-full h-12 rounded-xl bg-foreground text-background font-bold text-[15px]">一键生成我的 VibeCard</button></div></div>;
  if (phase === 'identity') return <OnboardingShell title="先放进你的公开身份" subtitle="名字、头像和你确认的链接会显示在公开 Card 上。" onBack={goBack}><div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-5 pb-4"><VibeBubble>我该怎么称呼你？也可以把个人主页、GitHub 或作品链接交给我。</VibeBubble><div className="flex flex-col items-center"><img src={avatar} alt="你的头像预览" className="w-20 h-20 rounded-[24px] object-cover bg-secondary mb-3" /><div className="flex gap-2 mb-3"><button onClick={handleGenerateAvatar} className="tap-target px-3 py-1.5 rounded-full text-[12px] font-semibold border border-border">换一个头像</button><label className="tap-target px-3 py-1.5 rounded-full text-[12px] font-semibold border border-border cursor-pointer"><input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />上传头像</label></div></div><div><label htmlFor="onboarding-name" className="text-[12px] font-semibold text-muted-foreground mb-2 block">你的名字或昵称</label><input id="onboarding-name" value={name} onChange={event => setName(event.target.value)} placeholder="例如：林舟" autoFocus className="w-full border border-border rounded-2xl px-4 py-3.5 text-[15px] font-semibold outline-none focus:border-foreground bg-background" /></div><div className="rounded-2xl border border-border bg-card/60 p-4"><label htmlFor="onboarding-source-links" className="flex items-center gap-2 text-[12px] font-bold text-foreground"><Link2 className="h-4 w-4" />个人链接（选填，最多 3 个）</label><textarea id="onboarding-source-links" value={sourceLinksText} onChange={event => { setSourceLinksText(event.target.value); setError(''); }} rows={3} placeholder={'https://github.com/you\nhttps://your-site.com'} className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-[13px] font-medium outline-none focus:border-foreground" /><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">每行一个 HTTPS 链接。它们会作为公开作品入口加入 Card，不会导入私人内容。</p></div>{error && <ErrorPanel message={error} onRetry={() => void prepareIdentity()} />}</div><button onClick={() => void prepareIdentity()} disabled={!name.trim() || busy} data-testid="onboarding-identity-continue" className="tap-target w-full h-12 rounded-xl bg-foreground text-background font-bold text-[15px] disabled:opacity-30">{busy ? '正在准备…' : '开始生成'}</button></OnboardingShell>;
  if (phase === 'generating') return <OnboardingShell title="正在整理你的 Card" subtitle="只会使用你刚才说过、并允许使用的内容。" onBack={goBack}><div className="flex-1 flex flex-col items-center justify-center text-center gap-4" role="status" data-testid="onboarding-generating"><LoaderCircle className="w-7 h-7 animate-spin" /><p className="text-[13px] text-muted-foreground">Vibe 正在起草，发布前你仍可逐项修改。</p>{error && <ErrorPanel message={error} onRetry={() => void generateCardDraft()} />}</div></OnboardingShell>;
  if (phase === 'memory' && pendingMemory) return <OnboardingShell title="这条要记住吗？" subtitle={pendingMemory.questionKey === 'boundary' ? '确认后只用于保护你的边界，不会进入公开草稿。' : '确认后会加入本次公开 Card 草稿的可用依据；最终仍需你预览并发布。'} onBack={goBack}><div className="flex-1 space-y-4"><VibeBubble privateNote={pendingMemory.questionKey === 'boundary'}>我从刚才的话里听到一件可能值得记住的事。</VibeBubble><div className="rounded-[20px] border border-amber-900/10 bg-amber-50/80 p-4" data-testid="onboarding-memory-proposal"><label htmlFor="onboarding-memory-edit" className="text-[11px] font-bold uppercase tracking-widest text-amber-800/70">记忆建议 · {pendingMemory.questionKey === 'boundary' ? '仅自己可见' : '可用于本次公开草稿'}</label><textarea id="onboarding-memory-edit" value={pendingMemory.draft} onChange={event => setPendingMemory(value => value ? { ...value, draft: event.target.value } : value)} rows={4} className="mt-2 w-full resize-none rounded-xl border border-amber-900/10 bg-white px-3 py-2.5 text-[14px] font-semibold outline-none focus:border-amber-800/30" />{error && <p role="alert" className="mt-2 text-[12px] text-destructive">{error}</p>}</div></div><div className="grid grid-cols-2 gap-2"><button onClick={() => void decideMemory(false)} disabled={busy} data-testid="onboarding-memory-reject" className="tap-target h-12 rounded-xl border border-border text-[13px] font-bold text-muted-foreground"><X className="inline w-3.5 h-3.5 mr-1" />别记这个</button><button onClick={() => void decideMemory(true)} disabled={!pendingMemory.draft.trim() || busy} data-testid="onboarding-memory-confirm" className="tap-target h-12 rounded-xl bg-foreground text-background text-[14px] font-bold disabled:opacity-40"><Check className="inline w-3.5 h-3.5 mr-1" />{busy ? '正在保存…' : '确认记住'}</button></div></OnboardingShell>;
  if (phase === 'conversation') return <OnboardingShell title={`聊聊你 · ${questionIndex + 1}/5`} subtitle={currentQuestion.hint} onBack={goBack}><div className="flex-1 min-h-0 overflow-y-auto no-scrollbar"><div className="h-1 rounded-full bg-secondary overflow-hidden mb-6" aria-label={`进度 ${questionIndex + 1}/5`}><motion.div animate={{ width: `${progress}%` }} className="h-full rounded-full bg-foreground" /></div><div className="space-y-3">{QUESTIONS.slice(0, questionIndex).map(question => <div key={question.key} className="space-y-2 opacity-65"><VibeBubble>{question.question}</VibeBubble><OwnerBubble>{answers[question.key] || '已跳过'}</OwnerBubble></div>)}<VibeBubble privateNote={currentQuestion.key === 'boundary'}>{currentQuestion.question}</VibeBubble></div></div><div className="space-y-3 pt-4"><label htmlFor="onboarding-answer" className="sr-only">{currentQuestion.question}</label><textarea id="onboarding-answer" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submitAnswer(); } }} autoFocus rows={3} placeholder={currentQuestion.placeholder} className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-[14px] font-medium leading-relaxed outline-none focus:border-foreground" />{error && <ErrorPanel message={error} onRetry={() => void submitAnswer(true)} />}<div className="grid grid-cols-[auto_1fr] gap-3"><button onClick={skipQuestion} disabled={busy} className="tap-target h-12 px-5 rounded-xl border border-border text-[13px] font-bold text-muted-foreground">先跳过</button><button onClick={() => void submitAnswer()} disabled={!draft.trim() || busy} className="tap-target h-12 rounded-xl bg-foreground text-background font-bold text-[15px] disabled:opacity-30 flex items-center justify-center gap-2">{busy ? 'Vibe 在想…' : '告诉 Vibe'}<Send className="w-4 h-4" /></button></div></div></OnboardingShell>;
  if (!cardDraft) return null;
  return <OnboardingShell title="你的 VibeCard 已经生成" subtitle="逐项改到像你，再确认发布。发布后可以直接分享，也可以迁移到自己的域名或服务器。" onBack={goBack}><div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-4"><div className="rounded-[28px] border border-border/60 bg-card p-5 space-y-4 shadow-sm" data-testid="onboarding-card-preview"><div className="flex items-center gap-3"><img src={avatar} alt="" className="w-14 h-14 rounded-[18px] bg-secondary object-cover" /><div><h2 className="text-[20px] font-black text-foreground">{name}</h2><p className="text-[12px] text-muted-foreground">发布前预览</p></div></div><DraftField label="一句话介绍" value={cardDraft.headline} onChange={value => setCardDraft(current => current ? { ...current, headline: value } : current)} /><DraftField label="此刻的我" value={cardDraft.currentFocus} onChange={value => setCardDraft(current => current ? { ...current, currentFocus: value } : current)} /><DraftField label="我能帮什么（每行一项）" value={cardDraft.canHelpWith} onChange={value => setCardDraft(current => current ? { ...current, canHelpWith: value } : current)} /><DraftField label="我想遇见谁" value={cardDraft.wantsToMeet} testId="onboarding-draft-looking-for" onChange={value => setCardDraft(current => current ? { ...current, wantsToMeet: value } : current)} /><DraftField label="代表作品 / 经历" value={cardDraft.highlight} onChange={value => setCardDraft(current => current ? { ...current, highlight: value } : current)} />{parseSourceLinks(sourceLinksText).links.length > 0 && <div className="rounded-2xl border border-border bg-background px-4 py-3"><p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">公开链接</p><div className="mt-2 flex flex-wrap gap-2">{parseSourceLinks(sourceLinksText).links.map(link => <span key={link.url} className="rounded-full bg-secondary px-3 py-1.5 text-[12px] font-semibold text-foreground">{link.title}</span>)}</div></div>}{answers.boundary && <div className="rounded-2xl bg-emerald-50 border border-emerald-900/10 px-4 py-3 flex gap-2.5"><Check className="w-4 h-4 mt-0.5 text-emerald-700 shrink-0" /><p className="text-[12px] font-medium leading-relaxed text-emerald-900/75">隐私边界已排除在公开草稿之外；即使发布 Card，它也不会出现。</p></div>}{error && <ErrorPanel message={error} onRetry={() => void publish()} />}</div></div><div className="grid grid-cols-[auto_1fr] gap-3 pt-3"><button onClick={goBack} disabled={busy} className="tap-target h-12 px-5 rounded-xl border border-border font-bold text-[14px]"><Pencil className="inline w-3.5 h-3.5 mr-1" />回去修改</button><button onClick={() => void publish()} disabled={busy} data-testid="confirm-onboarding-card" className="tap-target h-12 rounded-xl bg-foreground text-background font-bold text-[15px] disabled:opacity-40">{busy ? '正在发布…' : '发布并获得分享链接'}</button></div></OnboardingShell>;
}

function OnboardingShell({ title, subtitle, onBack, children }: { title: string; subtitle: string; onBack: () => void; children: ReactNode }) { return <div className="flex-1 flex flex-col h-full bg-background px-5 sm:px-6 pb-3 min-h-0"><header className="shrink-0 pt-4 pb-5"><button onClick={onBack} aria-label="返回上一步" className="tap-target -ml-2 p-2 rounded-full text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></button><h1 className="text-[24px] font-black tracking-tight text-foreground mt-2">{title}</h1><p className="text-[13px] font-medium text-muted-foreground mt-1 leading-relaxed">{subtitle}</p></header><div className="flex-1 min-h-0 flex flex-col">{children}</div></div>; }
function VibeBubble({ children, privateNote = false }: { children: ReactNode; privateNote?: boolean }) { return <div className="flex justify-start"><div className={`max-w-[88%] rounded-[20px] rounded-bl-md border px-4 py-3 ${privateNote ? 'border-emerald-900/10 bg-emerald-50' : 'border-amber-900/5 bg-[#fbf7f2]'}`}><div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-amber-700/70 uppercase tracking-widest"><Sparkles className="w-3 h-3" />你的 Vibe</div><p className="text-[14px] font-semibold leading-relaxed text-foreground">{children}</p>{privateNote && <p className="text-[11px] text-emerald-800/70 mt-1.5">仅用于保护边界 · 默认私密</p>}</div></div>; }
function OwnerBubble({ children }: { children: ReactNode }) { return <div className="flex justify-end"><p className="max-w-[88%] rounded-[20px] rounded-br-md bg-foreground px-4 py-3 text-[14px] font-medium leading-relaxed text-background">{children}</p></div>; }
function DraftField({ label, value, onChange, testId }: { label: string; value: string; onChange: (value: string) => void; testId?: string }) { return <label className="block"><span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span><textarea value={value} onChange={event => onChange(event.target.value)} rows={value.includes('\n') ? 3 : 2} data-testid={testId} className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-[14px] font-semibold leading-relaxed outline-none focus:border-foreground" /></label>; }
function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) { return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-800"><p>{message}</p><button onClick={onRetry} className="mt-1.5 inline-flex items-center gap-1 font-bold underline underline-offset-2"><RotateCcw className="w-3 h-3" />重试</button></div>; }
