import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Archive, ChevronRight, EyeOff, Pencil, Send, Trash2 } from 'lucide-react';
import type { NowItem } from '@shared';
import {
  NOW_STATUS_LABELS,
  NOW_TOPIC_LABELS,
  latestActiveNow,
  useNowItems,
} from '../../lib/now';

/**
 * Task 4.5 — owner Now management on My Card.
 *
 * Public preview shows the exact same snapshot a visitor sees (newest 3
 * published, non-expired). The manage panel lets the owner write, edit,
 * publish, archive, hide, and delete updates. Drafts (including anything
 * the Vibe proposed) are never shown publicly. One clear inline screen
 * state — no nested modal.
 */
export default function NowSection() {
  const { items, addNow, updateNow, publishNow, archiveNow, hideNow, deleteNow } = useNowItems();
  const [managing, setManaging] = useState(false);
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => latestActiveNow(items, Date.now(), 3), [items]);
  const manageable = useMemo(
    () =>
      items
        .filter(item => item.status !== 'deleted')
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [items],
  );

  const publishNew = () => {
    const text = newText.trim();
    if (!text) {
      // Error + retry: the owner fixes the text and publishes again.
      setError('动态内容不能为空，写一句再发布。');
      return;
    }
    setError(null);
    addNow({ text, topic: 'current_work' }, true);
    setNewText('');
  };

  const saveEdit = (item: NowItem, publish: boolean) => {
    const text = editText.trim();
    if (!text) {
      setError('内容不能为空，改一下再试。');
      return;
    }
    setError(null);
    updateNow(item.id, { text });
    if (publish && item.status !== 'published') publishNow(item.id);
    setEditingId(null);
  };

  const statusBadge = (item: NowItem) => {
    const expired = item.status === 'published' && item.expiresAt !== null && item.expiresAt <= Date.now();
    return expired ? '已过期' : NOW_STATUS_LABELS[item.status];
  };

  return (
    <motion.div
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.32 }}
      className="bg-card/40 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)] rounded-[24px] p-6 mb-5 w-full"
      data-testid="now-section"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">最近动态</h3>
        <button
          type="button"
          onClick={() => { setManaging(m => !m); setError(null); setEditingId(null); }}
          data-testid="now-manage-toggle"
          className="tap-target flex items-center gap-1 text-[12px] font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          管理
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${managing ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Public preview — exactly what visitors see. Empty means empty. */}
      {active.length > 0 ? (
        <ul className="space-y-2.5">
          {active.map(item => (
            <li key={item.id} data-testid="now-item" className="flex gap-2.5 text-[14px] font-medium text-foreground/85 leading-relaxed">
              <span className="shrink-0 mt-0.5 rounded-md bg-foreground/8 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                {NOW_TOPIC_LABELS[item.topic]}
              </span>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p data-testid="now-empty" className="text-[13px] font-medium text-muted-foreground text-center py-2">
          还没有公开的最近动态。
        </p>
      )}

      <AnimatePresence>
        {managing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
            data-testid="now-manage"
          >
            <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
              {/* Write a new update */}
              <div className="flex gap-2">
                <input
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') publishNew(); }}
                  placeholder="写一句最近正在发生的事…"
                  data-testid="now-new-input"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-[13px] font-medium outline-none focus:border-foreground/30"
                />
                <button
                  type="button"
                  onClick={publishNew}
                  data-testid="now-publish-new"
                  className="tap-target px-3.5 rounded-xl bg-foreground text-background text-[12px] font-bold flex items-center gap-1"
                >
                  <Send className="w-3 h-3" />
                  发布
                </button>
              </div>

              {error && (
                <p data-testid="now-error" className="text-[12px] font-semibold text-red-600">
                  {error}
                </p>
              )}

              {manageable.length === 0 ? (
                <p className="text-[12px] font-medium text-muted-foreground text-center py-1">
                  还没有任何动态，从上面写第一条吧。
                </p>
              ) : (
                <ul className="space-y-2">
                  {manageable.map(item => (
                    <li
                      key={item.id}
                      data-testid="now-manage-item"
                      className="rounded-[14px] border border-border/60 bg-background/60 px-3 py-2.5"
                    >
                      {editingId === item.id ? (
                        <div className="flex gap-2">
                          <input
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            data-testid="now-edit-input"
                            className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] font-medium outline-none focus:border-foreground/30"
                          />
                          <button
                            type="button"
                            onClick={() => saveEdit(item, false)}
                            className="tap-target px-3 rounded-lg bg-foreground text-background text-[12px] font-bold"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingId(null); setError(null); }}
                            className="tap-target px-2.5 rounded-lg border border-border text-[12px] font-bold text-muted-foreground"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[13px] font-medium text-foreground/85 leading-relaxed flex-1">
                              {item.text}
                            </p>
                            <span
                              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                item.status === 'published'
                                  ? 'bg-emerald-500/10 text-emerald-700'
                                  : 'bg-foreground/8 text-muted-foreground'
                              }`}
                            >
                              {statusBadge(item)}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => { setEditingId(item.id); setEditText(item.text); setError(null); }}
                              className="tap-target flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="w-3 h-3" />
                              编辑
                            </button>
                            {item.status !== 'published' && (
                              <button
                                type="button"
                                onClick={() => publishNow(item.id)}
                                data-testid={`now-publish-${item.id}`}
                                className="tap-target flex items-center gap-1 rounded-lg bg-foreground px-2 py-1 text-[11px] font-bold text-background"
                              >
                                <Send className="w-3 h-3" />
                                发布
                              </button>
                            )}
                            {item.status === 'published' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => archiveNow(item.id)}
                                  data-testid={`now-archive-${item.id}`}
                                  className="tap-target flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                                >
                                  <Archive className="w-3 h-3" />
                                  归档
                                </button>
                                <button
                                  type="button"
                                  onClick={() => hideNow(item.id)}
                                  data-testid={`now-hide-${item.id}`}
                                  className="tap-target flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                                >
                                  <EyeOff className="w-3 h-3" />
                                  隐藏
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteNow(item.id)}
                              data-testid={`now-delete-${item.id}`}
                              className="tap-target flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-3 h-3" />
                              删除
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
