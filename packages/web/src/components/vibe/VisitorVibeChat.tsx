import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Send, X } from 'lucide-react';
import { vibeFixtures } from '@shared';
import type { NowItem } from '@shared';

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

/**
 * Task 4.5 grounding: recent-context questions are answered ONLY from
 * currently published, non-expired Now items (preferred), then the public
 * current-focus memory. If neither exists, the Vibe says it doesn't have a
 * recent public update — it never invents one, and archived/hidden/deleted/
 * expired items are never described as current.
 */
const NO_RECENT_UPDATE = '他最近还没有公开动态，我不想替他猜。';

const RECENT_QUESTION = /最近|近况|在做|动态/;
const MAX_VISITOR_ROUNDS = 6;

function loadVisitorIdentity(isDemo: boolean, visitorId: string) {
  if (isDemo) return vibeFixtures.fixtureVisitor.name;
  const saved = localStorage.getItem('vibecard_public_visitor_name')?.trim();
  return saved || `匿名访客 · ${visitorId.slice(-4).toUpperCase()}`;
}

function safeRequestError(code: unknown) {
  switch (code) {
    case 'weak_reason': return '请再具体一点：为什么现在想认识他，最想聊什么？';
    case 'rate_limited': return '请求发送得有点频繁，请稍后再试。';
    case 'declined_cooldown': return '最近已经提交过请求，请过一段时间再试。';
    case 'blocked': return '这张名片目前不能接收你的请求。';
    case 'moderation_blocked': return '这段内容暂时不能提交，请修改后再试。';
    case 'moderation_unavailable': return '内容检查暂时不可用，你的文字还在，可以稍后重试。';
    default: return '请求暂时没有送达。你的文字还在，可以稍后重试。';
  }
}

export default function VisitorVibeChat({
  ownerName,
  onClose,
  nowItems = [],
  currentFocus = '',
  lookingFor = [],
  publicEndpoint = '',
  agentEnabled = true,
  demoMode = false,
}: {
  ownerName: string;
  onClose: () => void;
  /** Active (published, non-expired) Now snapshot from the public Card. */
  nowItems?: NowItem[];
  /** Public current-focus memory text; empty string means none. */
  currentFocus?: string;
  lookingFor?: string[];
  publicEndpoint?: string;
  agentEnabled?: boolean;
  /** True only for the explicit local fixture snapshot, never inherited by a real shared link. */
  demoMode?: boolean;
}) {
  const isDemo = demoMode;
  const visitorId = (() => {
    const key = 'vibecard_public_visitor_id';
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = `visitor-web-${crypto.randomUUID()}`;
    localStorage.setItem(key, created);
    return created;
  })();
  const recentAnswer = (): string => {
    if (nowItems.length > 0) {
      return `他最近的公开动态：${nowItems.map(item => item.text).join('；')}`;
    }
    if (currentFocus) {
      return `他最近在做的方向是：${currentFocus}`;
    }
    return NO_RECENT_UPDATE;
  };

  const suggestions: { q: string; a: (ownerName: string) => string }[] = [
    {
      q: '他最近在做什么？',
      a: () => recentAnswer(),
    },
    {
      q: '他为什么做这个？',
      a: () =>
        currentFocus
          ? `他最近在做的方向是：${currentFocus}`
          : NO_RECENT_UPDATE,
    },
    {
      q: '他可以帮别人什么？',
      a: () => isDemo
        ? `他提到过自己能帮到这些：${vibeFixtures.fixtureOwnerCard.canHelpWith.join('、')}。`
        : '这部分他还没有公开，我不想替他猜。',
    },
    {
      q: '他现在想认识什么样的人？',
      a: () => lookingFor.length > 0
        ? `他最近想认识：${lookingFor.join('、')}。`
        : '这部分他还没有公开，我不想替他猜。',
    },
  ];
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'open',
      role: 'vibe',
      text: `我是${ownerName}的 AI 分身。你可以先通过我了解他，也可以告诉我你为什么想认识他。`,
    },
  ]);
  const [input, setInput] = useState('');
  const [askedReason, setAskedReason] = useState(!agentEnabled);
  const [stage, setStage] = useState<Stage>('chat');
  const [visitorName, setVisitorName] = useState(() => loadVisitorIdentity(isDemo, visitorId));
  const [reason, setReason] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [chatError, setChatError] = useState('');
  const [retryText, setRetryText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [roundCount, setRoundCount] = useState(0);
  const [latestSharedContext, setLatestSharedContext] = useState<string[]>([]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

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
    if (isSending || roundCount >= MAX_VISITOR_ROUNDS) return;
    pushVisitor(q);
    pushVibe(a(ownerName));
    setRoundCount(value => value + 1);
    inviteReason();
  };

  const send = async (retrying = false) => {
    const text = (retrying ? retryText : input).trim();
    if (!text || isSending) return;
    if (roundCount >= MAX_VISITOR_ROUNDS && !askedReason) {
      setAskedReason(true);
      pushVibe('我们先聊到这里。你可以留下一个具体的认识理由，我会交给他本人决定。');
      return;
    }
    setIsSending(true);
    setChatError('');
    setRetryText('');
    setInput('');
    if (!retrying) {
      pushVisitor(text);
      setRoundCount(value => value + 1);
    }
    if (!askedReason && publicEndpoint) {
      try {
        const response = await fetch(`${publicEndpoint}/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ visitorId, message: text, ...(conversationId ? { conversationId } : {}) }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof data?.error?.code === 'string' ? data.error.code : 'unavailable');
        setConversationId(data.conversationId || '');
        const shared = Array.isArray(data.sharedContext) ? data.sharedContext.slice(0, 3) : [];
        setLatestSharedContext(shared);
        pushVibe(data.reply || '我暂时回答不了这个问题。', shared.length ? shared : undefined);
        if (data.nextAction && data.nextAction !== 'continue') setAskedReason(true);
        if (roundCount + 1 >= MAX_VISITOR_ROUNDS) setAskedReason(true);
      } catch {
        setChatError('分身暂时没连上。你的问题没有丢，可以重试，或直接留下认识理由。');
        setRetryText(text);
      }
    } else if (!askedReason) {
      if (RECENT_QUESTION.test(text)) {
        // Task 4.5: recent-context questions are grounded in the active Now
        // snapshot (then public current focus), never invented.
        pushVibe(recentAnswer());
      } else {
        // A free-form question the fixtures cannot ground -> honest uncertainty.
        pushVibe('这件事他还没有告诉我，我不想替他猜。你可以换个和他有关的问题，或者直接告诉我你为什么想认识他。');
      }
      setTimeout(inviteReason, 350);
    } else {
      // Treat the message as the connection reason and move to confirmation.
      // The discovery moment: the Vibe surfaces the concrete overlap it found
      // (fixture state in this mock; server-validated sharedContext later).
      setReason(text);
      pushVibe(
        '我大概懂了。在交给他之前，先看看我理解的有没有错。',
        isDemo ? vibeFixtures.fixtureConnectionRequest.possibleSharedContext : undefined,
      );
      if (isDemo) setLatestSharedContext(vibeFixtures.fixtureConnectionRequest.possibleSharedContext);
      setStage('preview');
    }
    setIsSending(false);
  };

  const submitRequest = async () => {
    if (isSubmitting) return;
    setSubmitError('');
    const cleanName = visitorName.trim();
    if (!cleanName) { setSubmitError('请填写一个称呼，也可以使用匿名称呼。'); return; }
    if (!isDemo && !publicEndpoint) {
      setSubmitError('这张名片目前离线，联系请求还不能送达。你的文字会保留在这里。');
      return;
    }
    setIsSubmitting(true);
    if (publicEndpoint && !isDemo) {
      try {
        const response = await fetch(`${publicEndpoint}/requests`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ visitorId, reason, visitorSummary: cleanName, possibleSharedContext: latestSharedContext }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof data?.error?.code === 'string' ? data.error.code : 'unavailable');
        localStorage.setItem(`vibecard_request_${data.id}`, JSON.stringify({ endpoint: publicEndpoint, visitorId }));
        localStorage.setItem('vibecard_public_visitor_name', cleanName);
      } catch (error) {
        setSubmitError(safeRequestError(error instanceof Error ? error.message : 'unavailable'));
        setIsSubmitting(false);
        return;
      }
    }
    setIsSubmitting(false);
    setStage('done');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] bg-[#050505] text-white flex flex-col"
      data-testid="visitor-vibe-chat"
      role="dialog"
      aria-modal="true"
      aria-label={`${ownerName}的 AI 分身对话`}
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

          {stage === 'chat' && chatError && (
            <div className="rounded-xl border border-red-300/20 bg-red-300/10 px-3 py-2.5 text-[12px] text-red-100" role="alert" data-testid="visitor-chat-error">
              <p>{chatError}</p>
              <button onClick={() => void send(true)} disabled={isSending} className="mt-2 font-bold underline underline-offset-4 disabled:opacity-50">
                {isSending ? '正在重试…' : '重试刚才的问题'}
              </button>
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
                    aria-label="你的称呼"
                    maxLength={80}
                    className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-[14px] font-medium outline-none focus:border-white/30"
                  />
                  {!isDemo && <p className="mt-1 text-[10px] text-white/40">这是提交给主人的身份，可保留匿名，也可以改成你希望对方看到的称呼。</p>}
                </div>
                <div>
                  <div className="text-[11px] text-white/45 mb-1">你想认识他的理由</div>
                  <p className="text-[14px] font-medium text-white/90 leading-relaxed">{reason}</p>
                </div>
                <div>
                  <div className="text-[11px] text-white/45 mb-1">我注意到的可能共同点</div>
                  <ul className="space-y-1">
                    {latestSharedContext.map(c => (
                      <li key={c} className="text-[12px] text-white/70">· {c}</li>
                    ))}
                    {latestSharedContext.length === 0 && <li className="text-[12px] text-white/45">暂时没有足够证据，不会强行编造共同点。</li>}
                  </ul>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={submitRequest}
                    disabled={isSubmitting}
                    data-testid="request-submit"
                    className="tap-target flex-1 py-2.5 rounded-xl bg-white text-black text-[13px] font-bold disabled:opacity-50"
                  >
                    {isSubmitting ? '正在提交…' : '确认提交'}
                  </button>
                  <button
                    onClick={() => { setStage('chat'); pushVibe('好，那你再说一次？我听着。'); }}
                    className="tap-target px-4 py-2.5 rounded-xl border border-white/15 text-white/80 text-[13px] font-bold"
                  >
                    再改改
                  </button>
                </div>
                {submitError && <p role="alert" className="text-xs text-red-300">{submitError}</p>}
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
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void send(); }}
              placeholder={askedReason ? '说说你为什么想认识他…' : '问一个和他有关的问题…'}
              data-testid="visitor-input"
              className="flex-1 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-[14px] font-medium outline-none focus:border-white/30 placeholder:text-white/35"
            />
            <button
              onClick={() => void send()}
              disabled={!input.trim() || isSending}
              data-testid="visitor-send"
              aria-label="发送"
              className="tap-target w-12 rounded-2xl bg-white text-black flex items-center justify-center disabled:opacity-40"
            >
              {isSending ? <span className="text-[10px] font-bold">发送中</span> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-right text-[10px] text-white/30">最多 6 轮 · 已进行 {Math.min(roundCount, MAX_VISITOR_ROUNDS)} 轮</p>
        </div>
      )}
    </motion.div>
  );
}
