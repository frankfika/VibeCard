import { useRef, useState, type ChangeEvent } from 'react';
import { Download, Upload, Trash2, Server, HardDrive, Settings2 } from 'lucide-react';
import type { Profile } from '../../store';
import { revokeCachedNamecard } from '../../hooks/useNamecardUrl';
import {
  clearLocalVibe,
  defaultRuntimeEndpoint,
  exportLocalVibe,
  importLocalVibe,
  loadRuntimeConfig,
  managedAccountApi,
  ownerApi,
  saveRuntimeConfig,
  type RuntimeMode,
} from '../../lib/runtime';

const LAST_EXPORT_KEY = 'vibecard_last_private_export_at';

function localArchiveReceipt(profile: Profile): string {
  return JSON.stringify({
    profile,
    now: localStorage.getItem('vibecard_now') || '[]',
    memories: localStorage.getItem('vibecard_owner_memories') || '[]',
  });
}

function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function DataControls({ profile }: { profile: Profile }) {
  const config = loadRuntimeConfig();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  const [editingRuntime, setEditingRuntime] = useState(false);
  const [mode, setMode] = useState<RuntimeMode>(config?.mode || 'local');
  const [endpoint, setEndpoint] = useState(config?.endpoint || defaultRuntimeEndpoint());
  const [ownerToken, setOwnerToken] = useState(config?.ownerToken || '');
  const [accountId, setAccountId] = useState(config?.accountId || '');
  const [cardSlug, setCardSlug] = useState(config?.cardSlug || '');

  const exportData = async () => {
    try {
      const [archive, knowledge] = config?.mode === 'managed'
        ? await Promise.all([
            ownerApi(config, '/export?kind=private&includeConversations=1'),
            managedAccountApi(config, '/knowledge/export'),
          ])
        : config?.mode === 'self_hosted'
          ? await Promise.all([
              ownerApi(config, '/export?kind=private&includeConversations=1'),
              ownerApi(config, '/knowledge/export'),
            ])
          : [exportLocalVibe(profile), null];
      downloadJson(archive, `${profile.handle || profile.name || 'my-vibe'}.vibe`);
      if (knowledge) {
        downloadJson(knowledge, `${profile.handle || profile.name || 'my-vibe'}.knowledge.json`);
      }
      localStorage.setItem(LAST_EXPORT_KEY, JSON.stringify({
        mode: config?.mode ?? 'local',
        endpoint: config?.endpoint ?? '',
        receipt: !config || config.mode === 'local' ? localArchiveReceipt(profile) : '',
        exportedAt: Date.now(),
      }));
      setStatus(config?.mode === 'managed' || config?.mode === 'self_hosted'
        ? '完整私有备份已下载（.vibe 与 knowledge JSON 两份文件）。'
        : '完整私有备份已下载。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导出失败');
    }
  };

  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const archive = JSON.parse(await file.text());
      if (!config || config.mode === 'local') importLocalVibe(archive);
      else await ownerApi(config, '/import', { method: 'POST', body: JSON.stringify({ archive }) });
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导入失败');
    }
  };

  const deleteData = async () => {
    if (!config || config.mode === 'local') {
      try {
        const receipt = JSON.parse(localStorage.getItem(LAST_EXPORT_KEY) || 'null') as { mode?: string; receipt?: string } | null;
        if (!receipt || receipt.mode !== 'local' || receipt.receipt !== localArchiveReceipt(profile)) {
          setStatus('本地数据在上次备份后发生了变化，请重新导出完整备份。');
          return;
        }
      } catch {
        setStatus('请先导出一份完整备份，再删除数据。');
        return;
      }
    }
    if (!window.confirm('确认删除这个 Vibe 的全部本地数据？此操作无法撤销。')) return;
    try {
      await revokeCachedNamecard();
      if (!config || config.mode === 'local') clearLocalVibe();
      else await ownerApi(config, '/delete-all', { method: 'POST', body: JSON.stringify({ confirm: 'DELETE' }) });
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '删除失败');
    }
  };

  const updateRuntime = () => {
    if (mode !== 'local' && (!endpoint.trim() || !ownerToken.trim())) {
      setStatus('自托管或托管模式需要服务地址和主人令牌。');
      return;
    }
    if (mode === 'managed' && (!accountId.trim() || !cardSlug.trim())) {
      setStatus('托管模式需要账户 ID 和公开 Card Slug。');
      return;
    }
    if (mode === 'managed' && (![accountId, cardSlug].every(value => /^[A-Za-z0-9._-]{1,128}$/.test(value.trim())))) {
      setStatus('账户 ID 和 Card Slug 只能包含字母、数字、点、下划线和连字符。');
      return;
    }
    try {
      saveRuntimeConfig({
        mode,
        endpoint: mode === 'local' ? '' : endpoint,
        ownerToken: mode === 'local' ? '' : ownerToken,
        ...(mode === 'managed' ? { accountId: accountId.trim(), cardSlug: cardSlug.trim() } : {}),
      });
      setEditingRuntime(false);
      setStatus('运行模式已更新，无需重新构建客户端。');
    } catch {
      setStatus('服务地址必须安全：仅本机自托管可用 HTTP，其他地址（含托管模式）必须使用 HTTPS。');
    }
  };

  return (
    <section className="space-y-3 border-t border-border/50 pt-4" aria-label="数据与运行模式">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-bold text-foreground">
          {config?.mode === 'local' ? <HardDrive className="h-4 w-4" /> : <Server className="h-4 w-4" />}
          {config?.mode === 'local' ? '本地模式' : config?.mode === 'managed' ? '托管模式' : '自托管模式'}
        </span>
        {config?.endpoint && <span className="max-w-[220px] truncate text-[10px] text-muted-foreground">{config.endpoint}</span>}
      </div>
      <button onClick={() => setEditingRuntime(value => !value)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
        <Settings2 className="mr-1.5 inline h-3.5 w-3.5" />更改运行模式或服务地址
      </button>
      {editingRuntime && (
        <div className="space-y-2 rounded-xl border border-border bg-background p-3">
          <label className="block text-[11px] font-semibold">运行模式
            <select value={mode} onChange={event => setMode(event.target.value as RuntimeMode)} className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs">
              <option value="local">本地</option>
              <option value="self_hosted">自托管</option>
              <option value="managed">托管</option>
            </select>
          </label>
          {mode !== 'local' && <>
            <label className="block text-[11px] font-semibold">服务地址<input value={endpoint} onChange={event => setEndpoint(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs" /></label>
            <label className="block text-[11px] font-semibold">主人令牌<input type="password" value={ownerToken} onChange={event => setOwnerToken(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs" /></label>
            {mode === 'managed' && <>
              <label className="block text-[11px] font-semibold">账户 ID<input value={accountId} onChange={event => setAccountId(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs" /></label>
              <label className="block text-[11px] font-semibold">公开 Card Slug<input value={cardSlug} onChange={event => setCardSlug(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs" /></label>
            </>}
          </>}
          <button onClick={updateRuntime} className="w-full rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background">保存连接设置</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={exportData} className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-semibold hover:border-foreground/30"><Download className="mr-1.5 inline h-3.5 w-3.5" />导出 .vibe</button>
        <button onClick={() => inputRef.current?.click()} className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-semibold hover:border-foreground/30"><Upload className="mr-1.5 inline h-3.5 w-3.5" />导入 .vibe</button>
      </div>
      <button onClick={deleteData} className="text-xs font-medium text-red-600/80 hover:text-red-600"><Trash2 className="mr-1.5 inline h-3.5 w-3.5" />导出后删除全部数据</button>
      <input ref={inputRef} type="file" accept=".vibe,application/json" onChange={importData} className="hidden" />
      {status && <p role="status" className="text-xs text-muted-foreground">{status}</p>}
    </section>
  );
}
