import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Send, Check, Pencil, X } from 'lucide-react';
import { vibeFixtures } from '@shared';
import type { Memory } from '@shared';
// Owner memory selection comes from the Core so web never re-implements
// retrieval or permission rules (task 5.2).
import { memoriesForOwner } from '@shared';
import { useNowItems } from '../lib/now';

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
  content: string;
  state: 'pending' | 'editing' | 'confirmed' | 'rejected';
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
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [replyIndex, setReplyIndex] = useState(0);
  const [proposal, setProposal] = useState<Proposal>({
    content: '你最近更想认识真正做过 AI 社交产品的人。',
    state: 'pending',
    draft: '你最近更想认识真正做过 AI 社交产品的人。',
  });
  const [remembered, setRemembered] = useState<Memory[]>(() =>
    memoriesForOwner(vibeFixtures.fixtureOwnerMemories),
  );
  const { addNow } = useNowItems();
  const [nowProposal, setNowProposal] = useState<NowProposal>({
    text: NOW_PROPOSAL_TEXT,
    state: 'idle',
    draft: NOW_PROPOSAL_TEXT,
    error: null,
  });

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const reply = cannedReplies[replyIndex % cannedReplies.length];
    setReplyIndex(i => i + 1);
    setMessages(prev => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'owner', text },
      { id: `v-${Date.now()}`, role: 'vibe', text: reply },
    ]);
    setInput('');
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

  const confirmProposal = (content: string) => {
    const memory: Memory = {
      id: `fixture-memory-confirmed-${Date.now()}`,
      schemaVersion: 1,
      ownerId: vibeFixtures.fixtureOwner.id,
      kind: 'preference',
      content,
      visibility: 'public',
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

  const rejectProposal = () => {
    setProposal(p => ({ ...p, state: 'rejected' }));
    setMessages(prev => [
      ...prev,
      { id: `v-forget-${Date.now()}`, role: 'vibe', text: '好的，这条我不会记住。' },
    ]);
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
