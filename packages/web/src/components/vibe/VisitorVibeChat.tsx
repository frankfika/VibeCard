import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Send, X } from 'lucide-react';
import { vibeFixtures } from '@shared';

/**
 * VisitorVibeChat (task 0.4 mock story) — the public-facing Vibe.
 *
 * Runs entirely on fixtures; no model call. It must always present itself as
 * the owner's AI representation, must answer only owner-related questions,
 * must say "I don't know" instead of inventing, and must never reveal
 * contact details or non-public memory. Its one goal is to help the visitor
 * articulate a specific reason to connect, then confirm it before
 * "submission".
 */

interface ChatMessage {
  id: string;
  role: 'visitor' | 'vibe';
  text: string;
  /**
   * Task 3.3 recognition moment: concrete shared context the Vibe found
   * between the visitor's own words and the owner's public Card/memories.
   * Rendered as a warm discovery block, never invented — fixture state here,
   * server-validated `sharedContext` once the cloud chain reaches Web.
   */
  sharedContext?: string[];
}

type Stage = 'chat' | 'preview' | 'done';

const suggestions: { q: string; a: (ownerName: string) => string }[] = [
  {
    q: '他为什么做这个？',
    a: () => `他最近在做的方向是：${vibeFixtures.fixtureOwnerCard.currentFocus}`,
  },
  {
    q: '他可以帮别人什么？',
    a: () => `他提到过自己能帮到这些：${vibeFixtures.fixtureOwnerCard.canHelpWith.join('、')}。`,
  },
  {
    q: '他现在想认识什么样的人？',
    a: () => `他最近想认识：${vibeFixtures.fixtureOwnerCard.wantsToMeet.join('、')}。`,
  },
];

export default function VisitorVibeChat({ ownerName, onClose }: { ownerName: string; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'open',
      role: 'vibe',
      text: `我是${ownerName}的 AI 分身。你可以先通过我了解他，也可以告诉我你为什么想认识他。`,
    },
  ]);
  const [input, setInput] = useState('');
  const [askedReason, setAskedReason] = useState(false);
  const [stage, setStage] = useState<Stage>('chat');
  const [visitorName, setVisitorName] = useState(vibeFixtures.fixtureVisitor.name);
  const [reason, setReason] = useState('');

  const pushVisitor = (text: string) => {
    setMessages(prev => [...prev, { id: `v-${Date.now()}-${Math.random()}`, role: 'visitor', text }]);
  };
  const pushVibe = (text: string, sharedContext?: string[]) => {
    setMessages(prev => [...prev, { id: `b-${Date.now()}-${Math.random()}`, role: 'vibe', text, sharedContext }]);
  };

  const inviteReason = () => {
    if (askedReason) return;
    setAskedReason(true);
    pushVibe('你为什么偏偏想在现在认识他？说得越具体，他越容易判断这次认识值不值得发生。');
  };

  const askSuggestion = (q: string, a: (n: string) => string) => {
    pushVisitor(q);
    pushVibe(a(ownerName));
    inviteReason();
  };

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    pushVisitor(text);
    if (!askedReason) {
      // A free-form question the fixtures cannot ground -> honest uncertainty.
      pushVibe('这件事他还没有告诉我，我不想替他猜。你可以换个和他有关的问题，或者直接告诉我你为什么想认识他。');
      setTimeout(inviteReason, 350);
    } else {
      // Treat the message as the connection reason and move to confirmation.
      // The discovery moment: the Vibe surfaces the concrete overlap it found
      // (fixture state in this mock; server-validated sharedContext later).
      setReason(text);
      pushVibe(
        '我大概懂了。在交给他之前，先看看我理解的有没有错。',
        vibeFixtures.fixtureConnectionRequest.possibleSharedContext,
      );
      setStage('preview');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] bg-[#050505] text-white flex flex-col"
      data-testid="visitor-vibe-chat"
    >
      <header className="px-5 py-4 flex items-center justify-between border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <div>
            <div className="text-[14px] font-bold">{ownerName}的 AI 分身</div>
            <div className="text-[10px] text-white/45 font-medium">AI 代聊，不代表本人承诺</div>
          </div>
        </div>
        <button onClick={onClose} aria-label="关闭" className="tap-target p-2 rounded-full hover:bg-white/10">
          <X className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-4 no-scrollbar">
        <div className="max-w-md mx-auto w-full space-y-3">
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'visitor' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-[18px] px-4 py-3 text-[14px] leading-relaxed font-medium ${
                  m.role === 'visitor'
                    ? 'bg-white text-black rounded-br-md'
                    : 'bg-white/[0.07] border border-white/10 text-white/90 rounded-bl-md'
                }`}
              >
                {m.role === 'vibe' && (
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <Sparkles className="w-3 h-3" />
                    AI 分身
                  </div>
                )}
                {m.text}
                {m.role === 'vibe' && m.sharedContext && m.sharedContext.length > 0 && (
                  <div
                    className="mt-2.5 rounded-xl border border-amber-200/25 bg-amber-200/10 px-3 py-2"
                    data-testid="shared-context-discovery"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-widest text-amber-200/70 mb-1">
                      发现共同点
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {m.sharedContext.map(c => (
                        <span key={c} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {stage === 'chat' && !askedReason && (
            <div className="flex flex-wrap gap-2 pt-1">
              {suggestions.map(s => (
                <button
                  key={s.q}
                  onClick={() => askSuggestion(s.q, s.a)}
                  className="tap-target px-3.5 py-2 rounded-full border border-white/15 bg-white/[0.05] text-[12px] font-semibold text-white/80 hover:bg-white/10"
                >
                  {s.q}
                </button>
              ))}
            </div>
          )}

          <AnimatePresence>
            {stage === 'preview' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-[18px] border border-white/15 bg-white/[0.06] p-4 space-y-3"
                data-testid="request-preview"
              >
                <div className="text-[11px] font-bold uppercase tracking-widest text-white/45">提交前确认</div>
                <div>
                  <div className="text-[11px] text-white/45 mb-1">你的称呼</div>
                  <input
                    value={visitorName}
                    onChange={e => setVisitorName(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-[14px] font-medium outline-none focus:border-white/30"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-white/45 mb-1">你想认识他的理由</div>
                  <p className="text-[14px] font-medium text-white/90 leading-relaxed">{reason}</p>
                </div>
                <div>
                  <div className="text-[11px] text-white/45 mb-1">我注意到的可能共同点</div>
                  <ul className="space-y-1">
                    {vibeFixtures.fixtureConnectionRequest.possibleSharedContext.map(c => (
                      <li key={c} className="text-[12px] text-white/70">· {c}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setStage('done')}
                    data-testid="request-submit"
                    className="tap-target flex-1 py-2.5 rounded-xl bg-white text-black text-[13px] font-bold"
                  >
                    确认提交
                  </button>
                  <button
                    onClick={() => { setStage('chat'); pushVibe('好，那你再说一次？我听着。'); }}
                    className="tap-target px-4 py-2.5 rounded-xl border border-white/15 text-white/80 text-[13px] font-bold"
                  >
                    再改改
                  </button>
                </div>
              </motion.div>
            )}

            {stage === 'done' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[18px] border border-emerald-400/20 bg-emerald-400/10 p-4 text-center space-y-2"
                data-testid="request-done"
              >
                <p className="text-[15px] font-bold">你的理由已经交给{ownerName}的 Vibe。</p>
                <p className="text-[12px] text-white/55 leading-relaxed">是否认识，由他决定。如果他觉得值得聊，你会收到他的联系方式。</p>
                <button onClick={onClose} className="tap-target mt-2 px-6 py-2.5 rounded-xl bg-white text-black text-[13px] font-bold">
                  好的
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {stage === 'chat' && (
        <div className="shrink-0 px-5 pb-5 pt-1">
          <div className="max-w-md mx-auto flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(); }}
              placeholder={askedReason ? '说说你为什么想认识他…' : '问一个和他有关的问题…'}
              data-testid="visitor-input"
              className="flex-1 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-[14px] font-medium outline-none focus:border-white/30 placeholder:text-white/35"
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              data-testid="visitor-send"
              aria-label="发送"
              className="tap-target w-12 rounded-2xl bg-white text-black flex items-center justify-center disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
