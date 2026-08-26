import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Inbox, ChevronRight, ChevronLeft, Sparkles, Check, LoaderCircle, RotateCcw } from 'lucide-react';
import { vibeFixtures } from '@shared';
import type { ConnectionAction, ConnectionRequest, ConnectionSummary, ContactMethod, Memory } from '@shared';
import { loadLocalMemories, loadRuntimeConfig, ownerApi, saveLocalMemories } from '../lib/runtime';

const demoVibeTake: ConnectionSummary = {
  recommendation: 'worth_a_conversation', why: ['对方认真了解过 VibeCard', '对方已经做过一个微信 AI 产品'],
  uncertainty: '对方更想合作，还是只交流想法', suggestedTopic: '私人记忆与公开身份的权限设计', evidenceRefs: ['fixture-request-strong'],
};
const demoWeakVibeTake: ConnectionSummary = {
  recommendation: 'need_more_context', why: ['理由比较泛泛，没有说出具体想一起做什么', '也没有留下可以了解的背景或作品'],
  uncertainty: '对方是否真的了解过你在做的事', suggestedTopic: '先请对方补充一个具体的理由', evidenceRefs: ['fixture-request-weak'],
};
const recommendationCopy: Record<ConnectionSummary['recommendation'], string> = {
  worth_a_conversation: '我觉得你们值得聊一次。', maybe_later: '这次认识也许可以晚一点。',
  need_more_context: '我还判断不好，信息不太够。', not_relevant_now: '这次认识现在可能不太合适。',
};

type View = 'inbox' | 'detail' | 'pick-contact' | 'matched';
type LoadState = 'loading' | 'ready' | 'error';
interface DecisionLearningProposal {
  id: string;
  content: string;
  draft: string;
  kind: Memory['kind'];
  visibility: Memory['visibility'];
  state: 'pending' | 'editing' | 'saving' | 'confirmed' | 'rejected';
  error: string;
}
type ActionResult = ConnectionRequest & {
  request?: ConnectionRequest;
  memoryProposal?: Partial<Memory> & { content: string };
  memoryProposalId?: string;
  learningStatus?: 'proposed' | 'not_suggested' | 'already_handled' | 'unavailable';
  learningProposalId?: string;
};
type LearningLookupState = 'idle' | 'loading' | 'error';
const PENDING_LEARNING_KEY = 'vibecard_pending_decision_learning_v1';

function loadPendingLearning(endpoint: string): string | null {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_LEARNING_KEY) || 'null') as { endpoint?: unknown; proposalId?: unknown } | null;
    return value?.endpoint === endpoint && typeof value.proposalId === 'string' ? value.proposalId : null;
  } catch { return null; }
}
function savePendingLearning(endpoint: string, proposalId: string | null) {
  if (!proposalId) localStorage.removeItem(PENDING_LEARNING_KEY);
  else localStorage.setItem(PENDING_LEARNING_KEY, JSON.stringify({ endpoint, proposalId }));
}
function learningFromMemory(memory: Memory): DecisionLearningProposal {
  return { id: memory.id, content: memory.content, draft: memory.content, kind: memory.kind, visibility: memory.visibility === 'private' ? 'private' : 'agent_only', state: 'pending', error: '' };
}
const visitorLabel = (request: ConnectionRequest) => request.visitorSummary.trim() || `匿名访客 · ${request.visitorId.slice(-4).toUpperCase()}`;

export default function RequestsPage() {
  const runtime = loadRuntimeConfig();
  const isDemo = (!runtime || runtime.mode === 'local') && localStorage.getItem('vibecard_demo_mode') === '1';
  const [view, setView] = useState<View>('inbox');
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [contacts, setContacts] = useState<ContactMethod[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [summary, setSummary] = useState<ConnectionSummary | null>(null);
  const [summaryState, setSummaryState] = useState<LoadState>('ready');
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(false);
  const [learningProposal, setLearningProposal] = useState<DecisionLearningProposal | null>(null);
  const [learningLookup, setLearningLookup] = useState<LearningLookupState>(() => runtime && runtime.mode !== 'local' && loadPendingLearning(runtime.endpoint) ? 'loading' : 'idle');
  const [learningLookupError, setLearningLookupError] = useState('');
  const request = requests.find(item => item.id === selectedId) ?? null;
  const actionableRequests = requests.filter(item => item.ownerAction === 'pending' || item.ownerAction === 'later');

  const lookupLearning = useCallback(async (inbox: ConnectionRequest[], proposalId?: string, surfaceFailure = false) => {
    if (!runtime || runtime.mode === 'local' || isDemo) return;
    const storedId = proposalId ?? loadPendingLearning(runtime.endpoint) ?? undefined;
    const hasTerminalRequest = inbox.some(item => item.ownerAction !== 'pending' && item.ownerAction !== 'later');
    if (!storedId && !hasTerminalRequest && !surfaceFailure) return;
    if (storedId) setLearningLookup('loading');
    setLearningLookupError('');
    try {
      const proposed = await ownerApi<Memory[]>(runtime, '/memories?status=proposed');
      const decidedIds = new Set(inbox.filter(item => item.ownerAction !== 'pending').map(item => item.id));
      const memory = proposed.find(item => item.id === storedId) ?? [...proposed].sort((a, b) => b.createdAt - a.createdAt).find(item =>
        item.sourceConversationId.startsWith('connection-decision:') && item.sourceMessageIds.some(id => decidedIds.has(id)),
      );
      if (memory) {
        savePendingLearning(runtime.endpoint, memory.id);
        setLearningProposal(learningFromMemory(memory));
        setLearningLookup('idle');
      } else if (storedId) {
        setLearningLookup('error');
        setLearningLookupError('连接决定已经保存，但暂时找不到对应的记忆建议。');
      } else setLearningLookup('idle');
    } catch {
      if (storedId || surfaceFailure) {
        setLearningLookup('error');
        setLearningLookupError('连接决定已经保存，记忆建议暂时加载失败。');
      }
    }
  }, [isDemo, runtime?.endpoint, runtime?.mode, runtime?.ownerToken]);

  const loadInbox = useCallback(async () => {
    setLoadError(''); setLoadState('loading'); setView('inbox'); setSelectedId(null);
    if (isDemo) {
      setRequests([vibeFixtures.fixtureConnectionRequest, vibeFixtures.fixtureWeakConnectionRequest]);
      setContacts(vibeFixtures.fixtureOwnerContactMethods); setLoadState('ready'); return;
    }
    if (!runtime || runtime.mode === 'local') {
      setRequests([]); setContacts([]); setLoadState('ready'); return;
    }
    try {
      const inbox = await ownerApi<ConnectionRequest[]>(runtime, '/requests');
      setRequests(inbox); setLoadState('ready');
      try { setContacts(await ownerApi<ContactMethod[]>(runtime, '/contacts')); }
      catch { setContacts([]); }
      void lookupLearning(inbox);
    } catch {
      setLoadError('暂时没能加载联系请求。你的请求数据没有被修改。'); setLoadState('error');
    }
  }, [isDemo, lookupLearning, runtime?.endpoint, runtime?.mode, runtime?.ownerToken]);
  useEffect(() => { void loadInbox(); }, [loadInbox]);

  const loadSummary = async (target: ConnectionRequest) => {
    setSummary(null); setSummaryState('loading');
    if (isDemo) {
      setSummary(target.id === vibeFixtures.fixtureWeakConnectionRequest.id ? demoWeakVibeTake : demoVibeTake); setSummaryState('ready'); return;
    }
    if (!runtime || runtime.mode === 'local') { setSummaryState('error'); return; }
    try {
      const result = await ownerApi<{ summary: ConnectionSummary }>(runtime, `/requests/${target.id}/summary`);
      setSummary(result.summary); setSummaryState('ready');
    } catch { setSummaryState('error'); }
  };
  const openRequest = (target: ConnectionRequest) => {
    setSelectedId(target.id); setSelectedContactIds([]); setActionError(''); setView('detail'); void loadSummary(target);
  };
  const applyAction = async (action: ConnectionAction, sharedContactMethodIds: string[] = []) => {
    if (!request || acting) return;
    setActing(true); setActionError('');
    try {
      let updated: ConnectionRequest;
      let result: ActionResult | null = null;
      if (isDemo) {
        updated = { ...request, ownerAction: action, sharedContactMethodIds: action === 'connect' ? sharedContactMethodIds : [], updatedAt: Date.now() };
        if (action === 'connect') result = { ...updated, memoryProposal: { id: `decision-learning-${request.id}`, content: '我更愿意认识能说清具体共同问题、并认真对待隐私边界的人。', kind: 'preference', visibility: 'agent_only' } };
      }
      else {
        if (!runtime || runtime.mode === 'local') throw new Error('offline');
        result = await ownerApi<ActionResult>(runtime, `/requests/${request.id}/action`, {
          method: 'POST', body: JSON.stringify({ action, expectedUpdatedAt: request.updatedAt, ...(action === 'connect' ? { sharedContactMethodIds } : {}) }),
        });
        updated = result.request ?? result;
      }
      const updatedRequests = requests.map(item => item.id === updated.id ? updated : item);
      setRequests(updatedRequests);
      if (action === 'connect') setView('matched');
      else { setSelectedId(null); setView('inbox'); }
      // Learning is deliberately best-effort and happens only after the
      // decision is durably accepted. Older servers omit these optional fields.
      const memory = result?.memoryProposal;
      const proposalId = result?.learningProposalId ?? result?.memoryProposalId;
      if (memory?.content) setLearningProposal({
        id: memory.id ?? proposalId ?? `decision-learning-${request.id}`,
        content: memory.content, draft: memory.content, kind: memory.kind ?? 'preference',
        visibility: memory.visibility === 'private' ? 'private' : 'agent_only', state: 'pending', error: '',
      });
      else if (proposalId && runtime && runtime.mode !== 'local') {
        savePendingLearning(runtime.endpoint, proposalId);
        await lookupLearning(updatedRequests, proposalId, true);
      }
    } catch { setActionError('这次操作没有完成，请稍后重试。请求状态保持不变。'); }
    finally { setActing(false); }
  };
  const toggleContact = (id: string) => setSelectedContactIds(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]);
  const demoName = (target: ConnectionRequest) => target.visitorId === vibeFixtures.fixtureWeakVisitor.id ? vibeFixtures.fixtureWeakVisitor.name : vibeFixtures.fixtureVisitor.name;

  const decideLearning = async (remember: boolean) => {
    if (!learningProposal || learningProposal.state === 'saving') return;
    setLearningProposal(current => current ? { ...current, state: 'saving', error: '' } : current);
    try {
      if (isDemo || !runtime || runtime.mode === 'local') {
        if (remember) {
          const all = loadLocalMemories();
          if (!all.some(item => item.id === learningProposal.id && item.status === 'confirmed')) {
            const now = Date.now();
            saveLocalMemories([...all.filter(item => item.id !== learningProposal.id), { id: learningProposal.id, schemaVersion: 1, ownerId: vibeFixtures.fixtureOwner.id, kind: learningProposal.kind, content: learningProposal.draft.trim(), visibility: learningProposal.visibility, status: 'confirmed', sourceConversationId: 'connection-decisions', sourceMessageIds: [], createdAt: now, updatedAt: now }]);
          }
        }
      } else {
        await ownerApi(runtime, `/memories/${learningProposal.id}/${remember ? 'confirm' : 'reject'}`, { method: 'POST', body: remember ? JSON.stringify({ content: learningProposal.draft.trim(), visibility: learningProposal.visibility }) : '{}' });
        savePendingLearning(runtime.endpoint, null);
      }
      setLearningProposal(current => current ? { ...current, state: remember ? 'confirmed' : 'rejected', error: '' } : current);
    } catch (error) {
      setLearningProposal(current => current ? { ...current, state: 'pending', error: error instanceof Error ? error.message : '这条记忆没有保存，连接决定不受影响。' } : current);
    }
  };

  return <div className="flex-1 flex flex-col overflow-hidden bg-background">
    <header className="hidden md:flex px-6 py-4 justify-center items-center z-20 shrink-0"><span className="text-[11px] font-semibold text-muted-foreground tracking-widest uppercase">联系请求</span></header>
    <main className="flex-1 overflow-y-auto px-5 sm:px-6 pt-4 pb-8 no-scrollbar"><div className="max-w-md mx-auto w-full">
      {learningLookup === 'loading' && <div className="mb-4 flex items-center gap-2 rounded-[16px] border border-amber-700/10 bg-amber-50/70 px-4 py-3 text-[12px] font-semibold text-muted-foreground" role="status" data-testid="decision-memory-loading"><LoaderCircle className="w-4 h-4 animate-spin" />连接已保存，正在加载记忆建议…</div>}
      {learningLookup === 'error' && <div className="mb-4 rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-800" role="alert" data-testid="decision-memory-lookup-error"><p>{learningLookupError}</p><button onClick={() => void lookupLearning(requests, runtime && runtime.mode !== 'local' ? loadPendingLearning(runtime.endpoint) ?? undefined : undefined, true)} className="mt-2 inline-flex items-center gap-1 font-bold underline underline-offset-2"><RotateCcw className="w-3 h-3" />重试加载建议</button></div>}
      {view !== 'matched' && learningProposal && <section className="mb-4 rounded-[20px] border border-amber-700/15 bg-amber-50/80 p-4" data-testid="decision-memory-proposal"><div className="text-[11px] font-bold uppercase tracking-widest text-amber-800/70 mb-2">这次选择让我想到</div>{learningProposal.state === 'editing' ? <textarea value={learningProposal.draft} onChange={event => setLearningProposal(current => current ? { ...current, draft: event.target.value } : current)} data-testid="decision-memory-input" rows={3} className="w-full resize-none rounded-xl border border-amber-700/20 bg-white px-3 py-2 text-[13px] font-semibold outline-none" /> : <p className="text-[13px] font-semibold leading-relaxed text-foreground">{learningProposal.content}</p>}<p className="mt-1.5 text-[11px] text-muted-foreground">建议不包含访客身份，确认前不会成为长期记忆。连接决定已经保存。</p>{learningProposal.error && <p role="alert" className="mt-2 text-[12px] text-red-700">{learningProposal.error}</p>}{(learningProposal.state === 'pending' || learningProposal.state === 'editing' || learningProposal.state === 'saving') && <div className="mt-3 flex gap-2"><button onClick={() => void decideLearning(true)} disabled={!learningProposal.draft.trim() || learningProposal.state === 'saving'} data-testid="decision-memory-confirm" className="tap-target flex-1 rounded-xl bg-foreground py-2 text-[12px] font-bold text-background disabled:opacity-50">记住</button><button onClick={() => setLearningProposal(current => current ? { ...current, state: current.state === 'editing' ? 'pending' : 'editing', draft: current.content } : current)} disabled={learningProposal.state === 'saving'} data-testid="decision-memory-edit" className="tap-target rounded-xl border border-amber-700/15 bg-white px-3 py-2 text-[12px] font-bold">改一下</button><button onClick={() => void decideLearning(false)} disabled={learningProposal.state === 'saving'} data-testid="decision-memory-reject" className="tap-target rounded-xl border border-amber-700/15 bg-white px-3 py-2 text-[12px] font-bold text-muted-foreground">别记这个</button></div>}{learningProposal.state === 'confirmed' && <p className="mt-2 text-[12px] font-bold text-emerald-700">已记住，仅按主人权限使用。</p>}{learningProposal.state === 'rejected' && <p className="mt-2 text-[12px] font-semibold text-muted-foreground">没有记住；连接结果保持不变。</p>}</section>}
      <AnimatePresence mode="wait" initial={false}>
        {view === 'inbox' && <motion.div key="inbox" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          {loadState === 'loading' ? <div className="flex flex-col items-center text-center gap-3 pt-24" data-testid="requests-loading"><LoaderCircle className="w-6 h-6 animate-spin text-muted-foreground" /><p className="text-[13px] text-muted-foreground">正在加载联系请求…</p></div>
          : loadState === 'error' ? <div className="flex flex-col items-center text-center gap-4 pt-24" role="alert" data-testid="requests-error"><p className="text-[13px] text-muted-foreground max-w-[280px]">{loadError}</p><button onClick={() => void loadInbox()} className="tap-target inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-[13px] font-bold text-background"><RotateCcw className="w-4 h-4" /> 重试</button></div>
          : actionableRequests.length === 0 ? <div className="flex flex-col items-center text-center gap-4 pt-24" data-testid="requests-empty"><div className="w-16 h-16 rounded-[22px] bg-secondary flex items-center justify-center"><Inbox className="w-7 h-7 text-muted-foreground" /></div><p className="text-[13px] text-muted-foreground">还没有新的联系请求。</p>{isDemo && <button onClick={() => void loadInbox()} className="text-[12px] font-bold text-muted-foreground underline underline-offset-4">重置演示状态</button>}</div>
          : <div className="space-y-3">{actionableRequests.map(item => { const isWeak = isDemo && item.id === vibeFixtures.fixtureWeakConnectionRequest.id; const label = isDemo ? demoName(item) : visitorLabel(item); return <button key={item.id} onClick={() => openRequest(item)} data-testid={isWeak ? 'request-item-weak' : 'request-item'} className="w-full text-left rounded-[20px] border border-border/60 bg-card p-5 flex items-center gap-4 hover:bg-secondary/40 transition-colors"><div className="w-12 h-12 rounded-[16px] bg-secondary flex items-center justify-center text-[15px] font-black text-muted-foreground" aria-hidden="true">{label.slice(0, 1)}</div><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="text-[15px] font-bold text-foreground">{label}</span><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{item.ownerAction === 'later' ? '稍后决定' : '新请求'}</span></div><p className="text-[13px] text-muted-foreground truncate mt-0.5">{item.reason}</p></div><ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" /></button>; })}</div>}
        </motion.div>}

        {view === 'detail' && request && <motion.div key="detail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
          <button onClick={() => setView('inbox')} className="flex items-center gap-1 text-[13px] font-semibold text-muted-foreground"><ChevronLeft className="w-4 h-4" /> 返回</button>
          <div className="rounded-[20px] border border-border/60 bg-card p-5 space-y-4" data-testid="request-detail">
            <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-[16px] bg-secondary flex items-center justify-center text-[15px] font-black text-muted-foreground">{(isDemo ? demoName(request) : visitorLabel(request)).slice(0, 1)}</div><div><div className="text-[16px] font-bold text-foreground">{isDemo ? demoName(request) : visitorLabel(request)}</div><div className="text-[12px] text-muted-foreground">{request.visitorSummary}</div></div></div>
            <section><h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">为什么想认识你</h3><p className="text-[14px] font-medium text-foreground leading-relaxed">{request.reason}</p></section>
            {request.possibleSharedContext.length > 0 && <section><h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">可能的共同点</h3><ul className="space-y-1">{request.possibleSharedContext.map(item => <li key={item} className="text-[13px] font-medium text-foreground/80 flex gap-2"><Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" /><span>{item}</span></li>)}</ul></section>}
            <section className="rounded-[16px] bg-amber-50/80 border border-amber-700/10 p-4" data-testid="vibe-take"><div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-800/70 mb-2"><Sparkles className="w-3 h-3" />你的 Vibe 的看法</div>
              {summaryState === 'loading' ? <p className="text-[13px] text-muted-foreground">正在整理这次认识为什么值得发生…</p> : summaryState === 'error' || !summary ? <div className="space-y-2"><p className="text-[13px] text-muted-foreground">暂时没能生成可靠摘要，我不想替你猜。</p><button onClick={() => void loadSummary(request)} className="text-[12px] font-bold underline underline-offset-4">重试摘要</button></div> : <><p className="text-[15px] font-bold text-foreground mb-2">{recommendationCopy[summary.recommendation]}</p><ul className="space-y-1 mb-2">{summary.why.map(item => <li key={item} className="text-[13px] font-medium text-foreground/80">· {item}</li>)}</ul><p className="text-[12px] text-muted-foreground">仍不确定：{summary.uncertainty}</p><p className="text-[12px] text-muted-foreground mt-1">建议开场话题：{summary.suggestedTopic}</p></>}
            </section>
          </div>
          {actionError && <p role="alert" className="text-[12px] text-destructive">{actionError}</p>}
          <div className="flex gap-2"><button onClick={() => { setActionError(''); setView('pick-contact'); }} disabled={acting} data-testid="request-connect" className="tap-target flex-1 py-3 rounded-xl bg-foreground text-background text-[14px] font-bold disabled:opacity-50">认识一下</button><button onClick={() => void applyAction('later')} disabled={acting} data-testid="request-later" className="tap-target px-4 py-3 rounded-xl bg-secondary text-foreground text-[13px] font-bold disabled:opacity-50">以后再说</button><button onClick={() => void applyAction('decline')} disabled={acting} data-testid="request-decline" className="tap-target px-4 py-3 rounded-xl bg-secondary text-muted-foreground text-[13px] font-bold disabled:opacity-50">暂不联系</button></div>
        </motion.div>}

        {view === 'pick-contact' && request && <motion.div key="pick" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
          <button onClick={() => setView('detail')} className="flex items-center gap-1 text-[13px] font-semibold text-muted-foreground"><ChevronLeft className="w-4 h-4" /> 返回</button>
          <div className="rounded-[20px] border border-border/60 bg-card p-5"><h3 className="text-[16px] font-bold text-foreground mb-1">选择要交换的联系方式</h3><p className="text-[12px] text-muted-foreground mb-4">只有你选中的方式会展示给对方。</p>
            {contacts.length === 0 ? <p className="rounded-xl bg-secondary px-4 py-3 text-[13px] text-muted-foreground">还没有可分享的联系方式，请先回到名片中添加。</p> : <div className="space-y-2">{contacts.map(item => <button key={item.id} onClick={() => toggleContact(item.id)} data-testid={`contact-${item.kind}`} className={`w-full flex items-center justify-between rounded-[14px] border px-4 py-3 text-left transition-colors ${selectedContactIds.includes(item.id) ? 'border-foreground bg-foreground/5' : 'border-border/60 bg-background'}`}><span className="text-[14px] font-bold text-foreground">{item.label || item.kind}</span><span className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedContactIds.includes(item.id) ? 'bg-foreground border-foreground' : 'border-border'}`}>{selectedContactIds.includes(item.id) && <Check className="w-3 h-3 text-background" />}</span></button>)}</div>}
            {actionError && <p role="alert" className="mt-3 text-[12px] text-destructive">{actionError}</p>}<button onClick={() => void applyAction('connect', selectedContactIds)} disabled={selectedContactIds.length === 0 || acting} data-testid="confirm-connect" className="tap-target w-full mt-4 py-3 rounded-xl bg-foreground text-background text-[14px] font-bold disabled:opacity-40">{acting ? '正在确认…' : '确认认识'}</button>
          </div>
        </motion.div>}

        {view === 'matched' && request && <motion.div key="matched" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center text-center pt-12 gap-4" data-testid="vibe-matched"><div className="w-16 h-16 rounded-[22px] bg-foreground flex items-center justify-center shadow-lg"><Sparkles className="w-7 h-7 text-background" /></div><h2 className="text-[22px] font-black tracking-tight text-foreground">Vibe matched.</h2><p className="text-[13px] text-muted-foreground max-w-[260px] leading-relaxed">你们因为一个具体的理由认识了彼此。</p><div className="rounded-[16px] border border-border/60 bg-card px-5 py-4 text-left"><div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">已交换</div>{contacts.filter(item => request.sharedContactMethodIds.includes(item.id)).map(item => <div key={item.id} className="text-[13px] font-semibold text-foreground">{item.label || item.kind}</div>)}</div>
          {learningProposal && <section className="w-full rounded-[20px] border border-amber-700/15 bg-amber-50/80 p-4 text-left" data-testid="decision-memory-proposal"><div className="text-[11px] font-bold uppercase tracking-widest text-amber-800/70 mb-2">这次选择让我想到</div>{learningProposal.state === 'editing' ? <textarea value={learningProposal.draft} onChange={event => setLearningProposal(current => current ? { ...current, draft: event.target.value } : current)} data-testid="decision-memory-input" rows={3} className="w-full resize-none rounded-xl border border-amber-700/20 bg-white px-3 py-2 text-[13px] font-semibold outline-none" /> : <p className="text-[13px] font-semibold leading-relaxed text-foreground">{learningProposal.content}</p>}<p className="mt-1.5 text-[11px] text-muted-foreground">这只是关于你的偏好建议，不包含访客身份；确认前不会成为长期记忆。</p>{learningProposal.error && <p role="alert" className="mt-2 text-[12px] text-red-700">{learningProposal.error} 连接决定已经保存。</p>}{(learningProposal.state === 'pending' || learningProposal.state === 'editing' || learningProposal.state === 'saving') && <div className="mt-3 flex gap-2"><button onClick={() => void decideLearning(true)} disabled={!learningProposal.draft.trim() || learningProposal.state === 'saving'} data-testid="decision-memory-confirm" className="tap-target flex-1 rounded-xl bg-foreground py-2 text-[12px] font-bold text-background disabled:opacity-50">{learningProposal.state === 'saving' ? '正在保存…' : '记住'}</button><button onClick={() => setLearningProposal(current => current ? { ...current, state: current.state === 'editing' ? 'pending' : 'editing', draft: current.content } : current)} disabled={learningProposal.state === 'saving'} data-testid="decision-memory-edit" className="tap-target rounded-xl border border-amber-700/15 bg-white px-3 py-2 text-[12px] font-bold">改一下</button><button onClick={() => void decideLearning(false)} disabled={learningProposal.state === 'saving'} data-testid="decision-memory-reject" className="tap-target rounded-xl border border-amber-700/15 bg-white px-3 py-2 text-[12px] font-bold text-muted-foreground">别记这个</button></div>}{learningProposal.state === 'confirmed' && <p className="mt-2 flex items-center gap-1 text-[12px] font-bold text-emerald-700" data-testid="decision-memory-confirmed"><Check className="w-3.5 h-3.5" />已记住，仅按主人权限使用</p>}{learningProposal.state === 'rejected' && <p className="mt-2 text-[12px] font-semibold text-muted-foreground" data-testid="decision-memory-rejected">没有记住；连接结果保持不变。</p>}</section>}
          <button onClick={() => void loadInbox()} className="text-[12px] font-bold text-muted-foreground underline underline-offset-4">返回请求列表</button></motion.div>}
      </AnimatePresence>
    </div></main>
  </div>;
}
