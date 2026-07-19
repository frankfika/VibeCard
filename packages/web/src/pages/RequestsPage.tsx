import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Inbox, ChevronRight, ChevronLeft, Sparkles, Check } from 'lucide-react';
import { vibeFixtures } from '@shared';
import type { ConnectionAction, ConnectionRequest, ContactMethod } from '@shared';

/**
 * 联系请求 — owner inbox (task 0.4 mock story).
 *
 * Fixture-driven: one request, full decision loop, no real backend. The
 * owner sees who the visitor is, the specific reason, possible shared
 * context, and Vibe's evidence-based take — never a score. Contact methods
 * are revealed only after the owner picks them and confirms `connect`.
 */

const vibeTake = {
  headline: '我觉得你们值得聊一次。',
  why: ['对方认真了解过 VibeCard', '对方已经做过一个微信 AI 产品'],
  uncertainty: '对方更想合作，还是只交流想法',
  suggestedTopic: '私人记忆与公开身份的权限设计',
};

// Task 4.3: the weak request gets an honest "not enough information" take —
// a boundary shown through evidence, never a score or a gate.
const weakVibeTake = {
  headline: '我还判断不好，信息不太够。',
  why: ['理由比较泛泛，没有说出具体想一起做什么', '也没有留下可以了解的背景或作品'],
  uncertainty: '对方是否真的了解过你在做的事',
  suggestedTopic: '先请对方补充一个具体的理由',
};

type View = 'inbox' | 'detail' | 'pick-contact' | 'matched';

export default function RequestsPage() {
  const [view, setView] = useState<View>('inbox');
  const [requests, setRequests] = useState<ConnectionRequest[]>([
    vibeFixtures.fixtureConnectionRequest,
    vibeFixtures.fixtureWeakConnectionRequest,
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);

  const contacts = vibeFixtures.fixtureOwnerContactMethods;
  const visitors = [vibeFixtures.fixtureVisitor, vibeFixtures.fixtureWeakVisitor];
  const request = requests.find(r => r.id === selectedId) ?? null;
  const visitorOf = (r: ConnectionRequest) =>
    visitors.find(v => v.id === r.visitorId) ?? vibeFixtures.fixtureVisitor;
  const takeOf = (r: ConnectionRequest) =>
    r.id === vibeFixtures.fixtureWeakConnectionRequest.id ? weakVibeTake : vibeTake;

  const updateRequest = (id: string, patch: Partial<ConnectionRequest>) => {
    setRequests(prev => prev.map(r => (r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r)));
  };

  const act = (action: ConnectionAction) => {
    if (request) updateRequest(request.id, { ownerAction: action });
  };

  const toggleContact = (id: string) => {
    setSelectedContactIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id],
    );
  };

  const confirmConnect = () => {
    if (!request) return;
    updateRequest(request.id, { ownerAction: 'connect', sharedContactMethodIds: selectedContactIds });
    setView('matched');
  };

  const resetDemo = () => {
    setRequests([vibeFixtures.fixtureConnectionRequest, vibeFixtures.fixtureWeakConnectionRequest]);
    setSelectedId(null);
    setSelectedContactIds([]);
    setView('inbox');
  };

  const pendingRequests = requests.filter(r => r.ownerAction === 'pending');

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <header className="hidden md:flex px-6 py-4 justify-center items-center z-20 shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground tracking-widest uppercase">
          联系请求
        </span>
      </header>

      <main className="flex-1 overflow-y-auto px-5 sm:px-6 pt-4 pb-8 no-scrollbar">
        <div className="max-w-md mx-auto w-full">
          <AnimatePresence mode="wait" initial={false}>
            {view === 'inbox' && (
              <motion.div key="inbox" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                {pendingRequests.length === 0 ? (
                  <div className="flex flex-col items-center text-center gap-4 pt-24">
                    <div className="w-16 h-16 rounded-[22px] bg-secondary flex items-center justify-center">
                      <Inbox className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <p className="text-[13px] text-muted-foreground">都处理完了。新的认识会出现在这里。</p>
                    <button onClick={resetDemo} className="text-[12px] font-bold text-muted-foreground underline underline-offset-4">
                      重置演示状态
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingRequests.map(r => {
                      const visitor = visitorOf(r);
                      const isWeak = r.id === vibeFixtures.fixtureWeakConnectionRequest.id;
                      return (
                        <button
                          key={r.id}
                          onClick={() => { setSelectedId(r.id); setView('detail'); }}
                          data-testid={isWeak ? 'request-item-weak' : 'request-item'}
                          className="w-full text-left rounded-[20px] border border-border/60 bg-card p-5 flex items-center gap-4 hover:bg-secondary/40 transition-colors"
                        >
                          <img
                            src={visitor.avatarUrl}
                            alt=""
                            className="w-12 h-12 rounded-[16px] bg-secondary"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[15px] font-bold text-foreground">{visitor.name}</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">新请求</span>
                            </div>
                            <p className="text-[13px] text-muted-foreground truncate mt-0.5">{r.reason}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {view === 'detail' && request && (
              <motion.div key="detail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                <button onClick={() => setView('inbox')} className="flex items-center gap-1 text-[13px] font-semibold text-muted-foreground">
                  <ChevronLeft className="w-4 h-4" /> 返回
                </button>

                <div className="rounded-[20px] border border-border/60 bg-card p-5 space-y-4" data-testid="request-detail">
                  <div className="flex items-center gap-3">
                    <img src={visitorOf(request).avatarUrl} alt="" className="w-12 h-12 rounded-[16px] bg-secondary" />
                    <div>
                      <div className="text-[16px] font-bold text-foreground">{visitorOf(request).name}</div>
                      <div className="text-[12px] text-muted-foreground">{request.visitorSummary}</div>
                    </div>
                  </div>

                  <section>
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">为什么想认识你</h3>
                    <p className="text-[14px] font-medium text-foreground leading-relaxed">{request.reason}</p>
                  </section>

                  {request.possibleSharedContext.length > 0 && (
                    <section>
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">可能的共同点</h3>
                      <ul className="space-y-1">
                        {request.possibleSharedContext.map(c => (
                          <li key={c} className="text-[13px] font-medium text-foreground/80 flex gap-2">
                            <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" />
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <section className="rounded-[16px] bg-amber-50/80 border border-amber-700/10 p-4" data-testid="vibe-take">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-800/70 mb-2">
                      <Sparkles className="w-3 h-3" />
                      你的 Vibe 的看法
                    </div>
                    <p className="text-[15px] font-bold text-foreground mb-2">{takeOf(request).headline}</p>
                    <ul className="space-y-1 mb-2">
                      {takeOf(request).why.map(w => (
                        <li key={w} className="text-[13px] font-medium text-foreground/80">· {w}</li>
                      ))}
                    </ul>
                    <p className="text-[12px] text-muted-foreground">仍不确定：{takeOf(request).uncertainty}</p>
                    <p className="text-[12px] text-muted-foreground mt-1">建议开场话题：{takeOf(request).suggestedTopic}</p>
                  </section>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setView('pick-contact')}
                    data-testid="request-connect"
                    className="tap-target flex-1 py-3 rounded-xl bg-foreground text-background text-[14px] font-bold"
                  >
                    认识一下
                  </button>
                  <button
                    onClick={() => act('later')}
                    data-testid="request-later"
                    className="tap-target px-4 py-3 rounded-xl bg-secondary text-foreground text-[13px] font-bold"
                  >
                    以后再说
                  </button>
                  <button
                    onClick={() => act('decline')}
                    data-testid="request-decline"
                    className="tap-target px-4 py-3 rounded-xl bg-secondary text-muted-foreground text-[13px] font-bold"
                  >
                    暂不联系
                  </button>
                </div>
              </motion.div>
            )}

            {view === 'pick-contact' && request && (
              <motion.div key="pick" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                <button onClick={() => setView('detail')} className="flex items-center gap-1 text-[13px] font-semibold text-muted-foreground">
                  <ChevronLeft className="w-4 h-4" /> 返回
                </button>
                <div className="rounded-[20px] border border-border/60 bg-card p-5">
                  <h3 className="text-[16px] font-bold text-foreground mb-1">选择要交换的联系方式</h3>
                  <p className="text-[12px] text-muted-foreground mb-4">只有你选中的方式会展示给对方。</p>
                  <div className="space-y-2">
                    {contacts.map((c: ContactMethod) => (
                      <button
                        key={c.id}
                        onClick={() => toggleContact(c.id)}
                        data-testid={`contact-${c.kind}`}
                        className={`w-full flex items-center justify-between rounded-[14px] border px-4 py-3 text-left transition-colors ${
                          selectedContactIds.includes(c.id)
                            ? 'border-foreground bg-foreground/5'
                            : 'border-border/60 bg-background'
                        }`}
                      >
                        <span className="text-[14px] font-bold text-foreground">{c.label}</span>
                        <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          selectedContactIds.includes(c.id) ? 'bg-foreground border-foreground' : 'border-border'
                        }`}>
                          {selectedContactIds.includes(c.id) && <Check className="w-3 h-3 text-background" />}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={confirmConnect}
                    disabled={selectedContactIds.length === 0}
                    data-testid="confirm-connect"
                    className="tap-target w-full mt-4 py-3 rounded-xl bg-foreground text-background text-[14px] font-bold disabled:opacity-40"
                  >
                    确认认识
                  </button>
                </div>
              </motion.div>
            )}

            {view === 'matched' && request && (
              <motion.div
                key="matched"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center text-center pt-24 gap-4"
                data-testid="vibe-matched"
              >
                <div className="w-16 h-16 rounded-[22px] bg-foreground flex items-center justify-center shadow-lg">
                  <Sparkles className="w-7 h-7 text-background" />
                </div>
                <h2 className="text-[22px] font-black tracking-tight text-foreground">Vibe matched.</h2>
                <p className="text-[13px] text-muted-foreground max-w-[260px] leading-relaxed">
                  你们因为一个具体的理由认识了彼此。
                </p>
                <div className="rounded-[16px] border border-border/60 bg-card px-5 py-4 text-left">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">已交换</div>
                  {contacts.filter(c => request.sharedContactMethodIds.includes(c.id)).map(c => (
                    <div key={c.id} className="text-[13px] font-semibold text-foreground">{c.label}</div>
                  ))}
                </div>
                <button onClick={resetDemo} className="text-[12px] font-bold text-muted-foreground underline underline-offset-4">
                  重置演示状态
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
