import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Send, Check, Pencil, X, LoaderCircle, RotateCcw } from 'lucide-react';
import { vibeFixtures } from '@shared';
import type { CardDraft, Memory } from '@shared';
// Owner memory selection comes from the Core so web never re-implements
// retrieval or permission rules (task 5.2).
import { memoriesForOwner } from '@shared';
import { useNowItems } from '../lib/now';
import { useProfile, type Profile } from '../store';
import {
  loadLocalMemories,
  loadRuntimeConfig,
  ownerApi,
  saveLocalMemories,
} from '../lib/runtime';

/**
 * 我的 Vibe — owner conversation (task 0.4 mock story).
 *
 * Everything here runs on shared fixtures; no real model is called. The flow
 * mirrors AI_BEHAVIOR.md: the Vibe proposes at most one memory, and only an
 * explicit owner action (记住 / 改一下 / 别记这个) decides what becomes
 * durable memory.
 */

interface ChatMessage {
  id: string;
  role: 'owner' | 'vibe';
  text: string;
  /**
   * Task 3.3 recognition moment: when a Vibe reply calls back to an earlier
   * confirmed memory, the real memory content rides along so the UI anchors
   * the callback to actual state instead of a canned claim.
   */
  memoryRefs?: { id: string; content: string }[];
  /** Task 3.3: marks the "I remembered…" confirmation moment for anchoring. */
  moment?: 'remember';
}

interface Proposal {
  id?: string;
  content: string;
  state: 'idle' | 'pending' | 'editing' | 'confirmed' | 'rejected';
  draft: string;
}

/**
 * Task 4.5: the Vibe may also propose ONE Now update from a meaningful
 * owner conversation. The proposal text is a clean public update — never
 * raw private chat — and only an explicit owner action (发布 / 改一下 /
 * 先不了) can publish it. Nothing auto-publishes.
 */
interface NowProposal {
  text: string;
  state: 'idle' | 'loading' | 'pending' | 'editing' | 'published' | 'dismissed';
  draft: string;
  error: string | null;
}

interface CardDraftState {
  state: 'idle' | 'loading' | 'pending' | 'editing' | 'applying' | 'applied' | 'rejected' | 'error';
  draft: CardDraft | null;
  edit: CardDraft;
  error: string;
}

// Deterministic mock projection: a public-safe update distilled from the
// owner's conversation, not a transcript of it.
const NOW_PROPOSAL_TEXT = '最近在验证 AI 分身如何在保护私人记忆的同时，帮助两个人建立联系。';

const cannedReplies = [
  '嗯，我听着。说得多一点，我就更懂你一点。',
  '这个挺重要的，我记在心上了。',
  '明白了。还有别的想让我知道的吗？',
];

const initialMessages: ChatMessage[] = [
  { id: 'm1', role: 'owner', text: '我最近想认识真正做过 AI 社交产品的人。' },
  {
    id: 'm2',
    role: 'vibe',
    text: '这句话值得被记住。也和你上次说的那件正在打磨的事是同一件——先理解，再认识。',
    // Real fixture state: the reply above genuinely calls back to this memory.
    memoryRefs: memoriesForOwner(vibeFixtures.fixtureOwnerMemories)
      .filter(m => m.id === 'fixture-memory-public-focus')
      .map(m => ({ id: m.id, content: m.content })),
  },
];

export default function MyVibePage() {
  const initialRuntime = loadRuntimeConfig();
  const isLocal = !initialRuntime || initialRuntime.mode === 'local';
  const isDemo = isLocal && localStorage.getItem('vibecard_demo_mode') === '1';
  const [messages, setMessages] = useState<ChatMessage[]>(isDemo ? initialMessages : [{
    id: 'remote-welcome',
    role: 'vibe',
    text: '我是你的 AI 分身，不是本人。和我聊聊吧；只有你确认的内容才会成为长期记忆。',
  }]);
  const [input, setInput] = useState('');
  const [replyIndex, setReplyIndex] = useState(0);
  const [proposal, setProposal] = useState<Proposal>({
    content: '你最近更想认识真正做过 AI 社交产品的人。',
    state: isDemo ? 'pending' : 'idle',
    draft: '你最近更想认识真正做过 AI 社交产品的人。',
  });
  const [remembered, setRemembered] = useState<Memory[]>(() =>
    isLocal && loadLocalMemories().length > 0
      ? memoriesForOwner(loadLocalMemories())
      : isDemo ? memoriesForOwner(vibeFixtures.fixtureOwnerMemories) : [],
  );
  const { addNow } = useNowItems();
  const { profile: currentProfile, updateProfile } = useProfile();
  const [nowProposal, setNowProposal] = useState<NowProposal>({
    text: NOW_PROPOSAL_TEXT,
    state: 'idle',
    draft: NOW_PROPOSAL_TEXT,
    error: null,
  });
  const [cardDraft, setCardDraft] = useState<CardDraftState>({ state: 'idle', draft: null, edit: {}, error: '' });

  useEffect(() => {
    const runtime = loadRuntimeConfig();
    if (!runtime || runtime.mode === 'local') return;
    ownerApi<Memory[]>(runtime, '/memories?status=confirmed')
      .then(setRemembered)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const runtime = loadRuntimeConfig();
    if (!runtime || runtime.mode === 'local') saveLocalMemories(remembered);
  }, [remembered]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    const runtime = loadRuntimeConfig();
    if (runtime && runtime.mode !== 'local') {
      setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'owner', text }]);
      setInput('');
      try {
        const result = await ownerApi<{
          reply: string;
          memoryProposalId?: string;
          nowDraftId?: string;
        }>(runtime, '/vibe/messages', { method: 'POST', body: JSON.stringify({ message: text }) });
        setMessages(prev => [...prev, { id: `v-${Date.now()}`, role: 'vibe', text: result.reply }]);
        if (result.memoryProposalId) {
          const proposed = await ownerApi<Memory[]>(runtime, '/memories?status=proposed');
          const memory = proposed.find(item => item.id === result.memoryProposalId);
          if (memory) setProposal({ id: memory.id, content: memory.content, draft: memory.content, state: 'pending' });
        }
      } catch (error) {
        setMessages(prev => [...prev, {
          id: `v-error-${Date.now()}`,
          role: 'vibe',
          text: error instanceof Error ? `暂时没连上：${error.message}` : '暂时没连上，稍后再试。',
        }]);
      }
      return;
    }
    const reply = cannedReplies[replyIndex % cannedReplies.length];
    setReplyIndex(i => i + 1);
    setMessages(prev => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'owner', text },
      { id: `v-${Date.now()}`, role: 'vibe', text: reply },
    ]);
    setInput('');
    if (proposal.state === 'idle') {
      setProposal({ content: text, draft: text, state: 'pending' });
    }
    // A meaningful owner message may trigger ONE Now proposal. Loading state
    // first (the Vibe "thinks"), then the proposal card — never auto-publish.
    setNowProposal(p => {
      if (p.state !== 'idle') return p;
      return { ...p, state: 'loading' };
    });
    setTimeout(() => {
      setNowProposal(p => (p.state === 'loading' ? { ...p, state: 'pending' } : p));
    }, 500);
  };

  const publishNowProposal = (text: string) => {
    const clean = text.trim();
    if (!clean) {
      // Error + retry: stay in editing so the owner can fix and republish.
      setNowProposal(p => ({ ...p, error: '内容不能为空，改一下再发布。' }));
      return;
    }
    // Publishing creates a Now item only; no Memory visibility is touched.
    addNow({ text: clean, topic: 'current_work' }, true);
    setNowProposal(p => ({ ...p, state: 'published', error: null }));
    setMessages(prev => [
      ...prev,
      {
        id: `v-now-${Date.now()}`,
        role: 'vibe',
        text: '好，这条已经放到你的最近动态了，访客能看到。它只是公开的近况，不会改变我记住的任何东西。',
      },
    ]);
  };

  const dismissNowProposal = () => {
    setNowProposal(p => ({ ...p, state: 'dismissed' }));
    setMessages(prev => [
      ...prev,
      { id: `v-now-skip-${Date.now()}`, role: 'vibe', text: '好，那这条就先留在我们俩之间。' },
    ]);
  };

  const confirmProposal = async (content: string) => {
    const runtime = loadRuntimeConfig();
    if (runtime && runtime.mode !== 'local' && proposal.id) {
      try {
        const memory = await ownerApi<Memory>(runtime, `/memories/${proposal.id}/confirm`, {
          method: 'POST',
          body: JSON.stringify({ content }),
        });
        setRemembered(prev => [...prev.filter(item => item.id !== memory.id), memory]);
        setProposal(current => ({ ...current, state: 'confirmed' }));
        setMessages(prev => [...prev, { id: `v-remember-${Date.now()}`, role: 'vibe', text: `我记住了：${content}`, moment: 'remember' }]);
      } catch (error) {
        setMessages(prev => [...prev, { id: `v-error-${Date.now()}`, role: 'vibe', text: error instanceof Error ? error.message : '没存上，再试一次。' }]);
      }
      return;
    }
    const memory: Memory = {
      id: `fixture-memory-confirmed-${Date.now()}`,
      schemaVersion: 1,
      ownerId: vibeFixtures.fixtureOwner.id,
      kind: 'preference',
      content,
      visibility: 'agent_only',
      status: 'confirmed',
      sourceConversationId: 'fixture-conversation-owner-mock',
      sourceMessageIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setRemembered(prev => [...prev, memory]);
    setProposal(p => ({ ...p, state: 'confirmed' }));
    setMessages(prev => [
      ...prev,
      { id: `v-remember-${Date.now()}`, role: 'vibe', text: `我记住了：${content}`, moment: 'remember' },
    ]);
  };

  const rejectProposal = async () => {
    const runtime = loadRuntimeConfig();
    if (runtime && runtime.mode !== 'local' && proposal.id) {
      await ownerApi(runtime, `/memories/${proposal.id}/reject`, { method: 'POST', body: '{}' }).catch(() => {});
    }
    setProposal(p => ({ ...p, state: 'rejected' }));
    setMessages(prev => [
      ...prev,
      { id: `v-forget-${Date.now()}`, role: 'vibe', text: '好的，这条我不会记住。' },
    ]);
  };

  const generateCardDraft = async () => {
    if (cardDraft.state === 'loading' || cardDraft.state === 'applying') return;
    setCardDraft(current => ({ ...current, state: 'loading', error: '' }));
    const runtime = loadRuntimeConfig();
    try {
      let draft: CardDraft;
      if (isDemo) {
        draft = {
          headline: vibeFixtures.fixtureOwnerCard.headline,
          currentFocus: vibeFixtures.fixtureOwnerCard.currentFocus,
          canHelpWith: vibeFixtures.fixtureOwnerCard.canHelpWith,
          wantsToMeet: ['正在做个人 AI、也认真对待隐私边界的产品创造者'],
          topics: vibeFixtures.fixtureOwnerCard.topics,
          highlights: vibeFixtures.fixtureOwnerCard.highlights,
        };
      } else if (runtime && runtime.mode !== 'local') {
        const result = await ownerApi<{ draft: CardDraft }>(runtime, '/card/draft', { method: 'POST', body: '{}' });
        draft = result.draft;
      } else {
        const latest = remembered.filter(memory => memory.status === 'confirmed' && memory.visibility === 'public' && memory.kind !== 'boundary').at(-1);
        if (!latest) throw new Error('还没有可用于公开 Card 的已确认记忆，请先确认一条公开记忆。');
        draft = latest.kind === 'current'
          ? { currentFocus: latest.content }
          : { wantsToMeet: [latest.content] };
      }
      setCardDraft({ state: 'pending', draft, edit: draft, error: '' });
    } catch (error) {
      setCardDraft(current => ({ ...current, state: 'error', error: error instanceof Error ? error.message : '暂时没能生成 Card 草稿。' }));
    }
  };

  const applyCardDraft = async () => {
    if (!cardDraft.draft || cardDraft.state === 'applying') return;
    const chosen = cardDraft.state === 'editing' ? cardDraft.edit : cardDraft.draft;
    setCardDraft(current => ({ ...current, state: 'applying', error: '' }));
    const runtime = loadRuntimeConfig();
    try {
      if (runtime && runtime.mode !== 'local') {
        await ownerApi(runtime, '/card', { method: 'PUT', body: JSON.stringify(chosen) });
      }
      const base = isDemo ? vibeFixtures.fixtureOwnerCard : null;
      updateProfile({
        ...(base ? { name: base.name, avatar: base.avatarUrl } : {}),
        ...(chosen.headline !== undefined ? { handle: chosen.headline } : {}),
        ...(chosen.currentFocus !== undefined ? { bio: chosen.currentFocus } : {}),
        ...(chosen.canHelpWith !== undefined ? { canHelpWith: chosen.canHelpWith } : {}),
        ...(chosen.wantsToMeet !== undefined ? { lookingFor: chosen.wantsToMeet[0] ?? '' } : {}),
        ...(chosen.topics !== undefined ? { tags: chosen.topics.map(label => ({ label, icon: '' })) } : {}),
        ...(chosen.highlights !== undefined ? { highlights: chosen.highlights.map((item, index) => ({ id: Date.now() + index, title: item.title, type: 'experience', icon: '✨', link: item.url ?? '' })) } : {}),
      });
      setCardDraft(current => ({ ...current, state: 'applied', draft: chosen, edit: chosen }));
      setMessages(previous => [...previous, { id: `v-card-${Date.now()}`, role: 'vibe', text: 'Card 已按你确认的版本更新。没有采用的字段保持原样。' }]);
    } catch (error) {
      setCardDraft(current => ({ ...current, state: 'pending', error: error instanceof Error ? error.message : '发布失败，原 Card 没有改变。' }));
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#fbf7f2]">
      <header className="hidden md:flex px-6 py-4 justify-center items-center z-20 shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground tracking-widest uppercase">
          我的 Vibe
        </span>
      </header>

      <main className="flex-1 overflow-y-auto px-5 sm:px-6 pt-4 pb-2 no-scrollbar">
        <div className="max-w-md mx-auto w-full space-y-4">
          <section className="rounded-[20px] bg-white/70 border border-amber-900/5 p-4" data-testid="card-draft-control">
            <div className="flex items-start justify-between gap-3">
              <div><div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">更新我的 Card</div><p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">只从已确认记忆生成建议；预览和采用是两个独立步骤。</p></div>
              {(cardDraft.state === 'idle' || cardDraft.state === 'rejected' || cardDraft.state === 'applied') && <button onClick={() => void generateCardDraft()} data-testid="generate-card-draft" className="tap-target shrink-0 rounded-xl bg-foreground px-3 py-2 text-[12px] font-bold text-background">生成草稿</button>}
            </div>
            {cardDraft.state === 'loading' && <div className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-muted-foreground" role="status" data-testid="card-draft-loading"><LoaderCircle className="w-4 h-4 animate-spin" />正在根据已确认记忆整理…</div>}
            {cardDraft.state === 'error' && <div className="mt-3 rounded-xl bg-red-50 p-3 text-[12px] text-red-800" role="alert"><p>{cardDraft.error}</p><button onClick={() => void generateCardDraft()} className="mt-2 inline-flex items-center gap-1 font-bold underline"><RotateCcw className="w-3 h-3" />重试</button></div>}
            {(cardDraft.state === 'pending' || cardDraft.state === 'editing' || cardDraft.state === 'applying') && cardDraft.draft && <div className="mt-4 rounded-[16px] border border-amber-700/15 bg-amber-50/70 p-4" data-testid="card-draft-preview">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-widest text-amber-800/70">发布前预览</div>
              <CardDraftFields draft={cardDraft.state === 'editing' ? cardDraft.edit : cardDraft.draft} currentProfile={currentProfile} editing={cardDraft.state === 'editing'} onChange={edit => setCardDraft(current => ({ ...current, edit }))} />
              {cardDraft.error && <p role="alert" className="mt-2 text-[12px] text-red-700">{cardDraft.error}</p>}
              <div className="mt-3 flex gap-2">
                <button onClick={() => void applyCardDraft()} disabled={cardDraft.state === 'applying'} data-testid="card-draft-accept" className="tap-target flex-1 rounded-xl bg-foreground py-2 text-[13px] font-bold text-background disabled:opacity-50">{cardDraft.state === 'applying' ? '正在更新…' : cardDraft.state === 'editing' ? '确认并采用' : '采用'}</button>
                <button onClick={() => setCardDraft(current => ({ ...current, state: current.state === 'editing' ? 'pending' : 'editing', edit: current.draft ?? {} }))} disabled={cardDraft.state === 'applying'} data-testid="card-draft-edit" className="tap-target rounded-xl border border-amber-700/15 bg-white px-3 py-2 text-[13px] font-bold"><Pencil className="inline w-3 h-3 mr-1" />{cardDraft.state === 'editing' ? '取消编辑' : '改一下'}</button>
                <button onClick={() => setCardDraft(current => ({ ...current, state: 'rejected', draft: null, edit: {}, error: '' }))} disabled={cardDraft.state === 'applying'} data-testid="card-draft-reject" className="tap-target rounded-xl border border-amber-700/15 bg-white px-3 py-2 text-[13px] font-bold text-muted-foreground"><X className="inline w-3 h-3 mr-1" />放弃</button>
              </div>
            </div>}
            {cardDraft.state === 'applied' && <p className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700" data-testid="card-draft-applied"><Check className="w-4 h-4" />已采用并更新公开 Card</p>}
            {cardDraft.state === 'rejected' && <p className="mt-3 text-[12px] font-semibold text-muted-foreground" data-testid="card-draft-rejected">草稿已放弃，公开 Card 没有改变。</p>}
          </section>

          {/* Remembered memories (task 3.4: the empty state is designed too) */}
          {remembered.length > 0 ? (
            <div className="rounded-[20px] bg-white/70 border border-amber-900/5 p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                已记住 · {remembered.length}
              </div>
              <ul className="space-y-1.5">
                {remembered.map(m => (
                  <li key={m.id} className="text-[13px] font-medium text-foreground/80 flex gap-2">
                    <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-700" />
                    <span>{m.content}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-[20px] bg-white/50 border border-dashed border-amber-900/10 p-4 text-center">
              <p className="text-[13px] font-medium text-muted-foreground">还没有记住任何事。聊点什么吧。</p>
            </div>
          )}

          {/* Chat messages */}
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'owner' ? 'justify-end' : 'justify-start'}`}>
              <div
                data-testid={m.moment === 'remember' ? 'remember-moment' : undefined}
                className={`max-w-[85%] rounded-[20px] px-4 py-3 text-[14px] leading-relaxed font-medium ${
                  m.role === 'owner'
                    ? 'bg-foreground text-background rounded-br-md'
                    : 'bg-white border border-amber-900/5 text-foreground rounded-bl-md'
                }`}
              >
                {m.role === 'vibe' && (
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-amber-700/70 uppercase tracking-widest">
                    <Sparkles className="w-3 h-3" />
                    你的 Vibe
                  </div>
                )}
                {m.text}
                {m.role === 'vibe' && m.memoryRefs && m.memoryRefs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5" data-testid="memory-callback">
                    {m.memoryRefs.map(ref => (
                      <span
                        key={ref.id}
                        title={ref.content}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-700/10 px-2.5 py-1 text-[11px] font-medium text-amber-900/70"
                      >
                        ↩ {ref.content.length > 40 ? `${ref.content.slice(0, 40)}…` : ref.content}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Memory proposal */}
          <AnimatePresence>
            {(proposal.state === 'pending' || proposal.state === 'editing') && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-[20px] border border-amber-700/15 bg-amber-50/80 p-4"
                data-testid="memory-proposal"
              >
                <div className="text-[11px] font-bold uppercase tracking-widest text-amber-800/70 mb-2">
                  Vibe 提议记住
                </div>
                {proposal.state === 'editing' ? (
                  <input
                    value={proposal.draft}
                    onChange={e => setProposal(p => ({ ...p, draft: e.target.value }))}
                    className="w-full rounded-xl border border-amber-700/20 bg-white px-3 py-2 text-[14px] font-medium outline-none focus:border-amber-700/40"
                  />
                ) : (
                  <p className="text-[14px] font-semibold text-foreground mb-1">我记住了：{proposal.content}</p>
                )}
                <div className="flex gap-2 mt-3">
                  {proposal.state === 'editing' ? (
                    <>
                      <button
                        onClick={() => proposal.draft.trim() && confirmProposal(proposal.draft.trim())}
                        className="tap-target flex-1 py-2 rounded-xl bg-foreground text-background text-[13px] font-bold"
                      >
                        确认
                      </button>
                      <button
                        onClick={() => setProposal(p => ({ ...p, state: 'pending', draft: p.content }))}
                        className="tap-target px-4 py-2 rounded-xl bg-white text-foreground text-[13px] font-bold border border-amber-700/15"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => confirmProposal(proposal.content)}
                        data-testid="proposal-remember"
                        className="tap-target flex-1 py-2 rounded-xl bg-foreground text-background text-[13px] font-bold"
                      >
                        记住
                      </button>
                      <button
                        onClick={() => setProposal(p => ({ ...p, state: 'editing' }))}
                        data-testid="proposal-edit"
                        className="tap-target px-3 py-2 rounded-xl bg-white text-foreground text-[13px] font-bold border border-amber-700/15 flex items-center gap-1"
                      >
                        <Pencil className="w-3 h-3" />
                        改一下
                      </button>
                      <button
                        onClick={rejectProposal}
                        data-testid="proposal-reject"
                        className="tap-target px-3 py-2 rounded-xl bg-white text-muted-foreground text-[13px] font-bold border border-amber-700/15 flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        别记这个
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Task 4.5: Now proposal — owner-confirmed public update */}
          <AnimatePresence>
            {nowProposal.state === 'loading' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-[20px] border border-amber-700/10 bg-white/60 p-4 flex items-center gap-2"
                data-testid="now-proposal-loading"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-700/60 animate-pulse" />
                <span className="text-[12px] font-semibold text-muted-foreground">
                  Vibe 在想：这件事要不要放到你的最近动态…
                </span>
              </motion.div>
            )}
            {(nowProposal.state === 'pending' || nowProposal.state === 'editing') && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-[20px] border border-sky-700/15 bg-sky-50/80 p-4"
                data-testid="now-proposal"
              >
                <div className="text-[11px] font-bold uppercase tracking-widest text-sky-800/70 mb-2">
                  Vibe 提议放到最近动态
                </div>
                {nowProposal.state === 'editing' ? (
                  <input
                    value={nowProposal.draft}
                    onChange={e => setNowProposal(p => ({ ...p, draft: e.target.value }))}
                    data-testid="now-proposal-input"
                    className="w-full rounded-xl border border-sky-700/20 bg-white px-3 py-2 text-[14px] font-medium outline-none focus:border-sky-700/40"
                  />
                ) : (
                  <p className="text-[14px] font-semibold text-foreground mb-1">{nowProposal.text}</p>
                )}
                <p className="text-[11px] font-medium text-muted-foreground mt-1">
                  发布后访客能在你的 Card 上看到；只有你确认才会公开。
                </p>
                {nowProposal.error && (
                  <p data-testid="now-proposal-error" className="text-[12px] font-semibold text-red-600 mt-1">
                    {nowProposal.error}
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  {nowProposal.state === 'editing' ? (
                    <>
                      <button
                        onClick={() => publishNowProposal(nowProposal.draft)}
                        data-testid="now-proposal-confirm-publish"
                        className="tap-target flex-1 py-2 rounded-xl bg-foreground text-background text-[13px] font-bold"
                      >
                        确认发布
                      </button>
                      <button
                        onClick={() => setNowProposal(p => ({ ...p, state: 'pending', draft: p.text, error: null }))}
                        className="tap-target px-4 py-2 rounded-xl bg-white text-foreground text-[13px] font-bold border border-sky-700/15"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => publishNowProposal(nowProposal.text)}
                        data-testid="now-proposal-publish"
                        className="tap-target flex-1 py-2 rounded-xl bg-foreground text-background text-[13px] font-bold"
                      >
                        发布
                      </button>
                      <button
                        onClick={() => setNowProposal(p => ({ ...p, state: 'editing', error: null }))}
                        data-testid="now-proposal-edit"
                        className="tap-target px-3 py-2 rounded-xl bg-white text-foreground text-[13px] font-bold border border-sky-700/15 flex items-center gap-1"
                      >
                        <Pencil className="w-3 h-3" />
                        改一下
                      </button>
                      <button
                        onClick={dismissNowProposal}
                        data-testid="now-proposal-dismiss"
                        className="tap-target px-3 py-2 rounded-xl bg-white text-muted-foreground text-[13px] font-bold border border-sky-700/15 flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        先不了
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Input bar */}
      <div className="shrink-0 px-5 sm:px-6 pb-3 pt-1">
        <div className="max-w-md mx-auto flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder="和你的 Vibe 说点什么…"
            className="flex-1 rounded-2xl border border-amber-900/10 bg-white px-4 py-3 text-[14px] font-medium outline-none focus:border-amber-700/30"
          />
          <button
            onClick={send}
            disabled={!input.trim()}
            data-testid="vibe-send"
            className="tap-target w-12 rounded-2xl bg-foreground text-background flex items-center justify-center disabled:opacity-40"
            aria-label="发送"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CardDraftFields({ draft, currentProfile, editing, onChange }: { draft: CardDraft; currentProfile: Profile; editing: boolean; onChange: (draft: CardDraft) => void }) {
  const allEntries: { key: keyof CardDraft; label: string; value: string; oldValue: string }[] = [
    { key: 'headline', label: '一句话介绍', value: draft.headline ?? '', oldValue: currentProfile.handle },
    { key: 'currentFocus', label: '此刻的我', value: draft.currentFocus ?? '', oldValue: currentProfile.bio },
    { key: 'canHelpWith', label: '我能帮什么', value: draft.canHelpWith?.join('\n') ?? '', oldValue: currentProfile.canHelpWith?.join('\n') ?? '' },
    { key: 'wantsToMeet', label: '想遇见谁', value: draft.wantsToMeet?.join('\n') ?? '', oldValue: currentProfile.lookingFor ?? '' },
    { key: 'topics', label: '话题', value: draft.topics?.join('、') ?? '', oldValue: currentProfile.tags.map(item => item.label).join('、') },
  ];
  const entries = allEntries.filter(item => editing || item.value);
  const highlightValue = draft.highlights?.map(item => item.title).join('\n') ?? '';
  const oldHighlights = currentProfile.highlights.map(item => item.title).join('\n');
  return <div className="space-y-3">{entries.map(item => <label key={item.key} className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{item.label}</span>{!editing && item.oldValue && item.oldValue !== item.value && <span className="mt-1 block text-[11px] text-muted-foreground line-through" data-testid={`card-draft-old-${item.key}`}>原：{item.oldValue}</span>}{editing ? <textarea value={item.value} data-testid={`card-draft-field-${item.key}`} onChange={event => {
    const value = event.target.value;
    const next: CardDraft = { ...draft };
    if (item.key === 'headline' || item.key === 'currentFocus') next[item.key] = value;
    else next[item.key] = value.split(item.key === 'topics' ? /[、，,\n]/ : /\n/).map(part => part.trim()).filter(Boolean);
    onChange(next);
  }} rows={item.value.includes('\n') ? 3 : 2} className="mt-1 w-full resize-none rounded-xl border border-amber-700/15 bg-white px-3 py-2 text-[13px] font-semibold outline-none focus:border-amber-700/40" /> : <p className="mt-1 text-[13px] font-semibold leading-relaxed text-foreground">{item.value}</p>}</label>)}{(editing || highlightValue) && <label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">代表作品 / 经历</span>{!editing && oldHighlights && oldHighlights !== highlightValue && <span className="mt-1 block text-[11px] text-muted-foreground line-through">原：{oldHighlights}</span>}{editing ? <textarea value={highlightValue} data-testid="card-draft-field-highlights" onChange={event => onChange({ ...draft, highlights: event.target.value.split(/\n/).map(title => title.trim()).filter(Boolean).slice(0, 3).map((title, index) => ({ id: `draft-highlight-${index + 1}`, title })) })} rows={3} className="mt-1 w-full resize-none rounded-xl border border-amber-700/15 bg-white px-3 py-2 text-[13px] font-semibold outline-none focus:border-amber-700/40" /> : <p className="mt-1 text-[13px] font-semibold leading-relaxed text-foreground">{highlightValue}</p>}</label>}</div>;
}
