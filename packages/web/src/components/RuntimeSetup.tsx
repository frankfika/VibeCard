import { useRef, useState, type ChangeEvent } from 'react';
import { HardDrive, Server, Cloud, Upload, ArrowRight, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { defaultRuntimeEndpoint, importLocalVibe, saveRuntimeConfig, type RuntimeMode } from '../lib/runtime';

const modes: { id: RuntimeMode; title: string; description: string; icon: typeof HardDrive }[] = [
  { id: 'local', title: '只在这台设备', description: '无需账号。数据留在浏览器，可随时导出。', icon: HardDrive },
  { id: 'self_hosted', title: '连接自托管服务', description: '连接你自己的 VibeCard Server。', icon: Server },
  { id: 'managed', title: 'VibeCard Cloud', description: '可选托管模式，使用同一套开放数据格式。', icon: Cloud },
];

export default function RuntimeSetup({ onReady }: { onReady: () => void }) {
  const [mode, setMode] = useState<RuntimeMode>('local');
  const [endpoint, setEndpoint] = useState(defaultRuntimeEndpoint);
  const [token, setToken] = useState('');
  const [accountId, setAccountId] = useState('');
  const [cardSlug, setCardSlug] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const finish = () => {
    if (mode !== 'local' && (!endpoint.trim() || !token.trim())) {
      setError('请填写服务地址和主人令牌。令牌只保存在这台设备。');
      return;
    }
    if (mode === 'managed' && (!accountId.trim() || !cardSlug.trim())) {
      setError('托管模式还需要账户 ID 和公开 Card Slug。');
      return;
    }
    if (mode === 'managed' && (![accountId, cardSlug].every(value => /^[A-Za-z0-9._-]{1,128}$/.test(value.trim())))) {
      setError('账户 ID 和 Card Slug 只能包含字母、数字、点、下划线和连字符。');
      return;
    }
    try {
      saveRuntimeConfig({
        mode, endpoint: mode === 'local' ? '' : endpoint, ownerToken: mode === 'local' ? '' : token,
        ...(mode === 'managed' ? { accountId: accountId.trim(), cardSlug: cardSlug.trim() } : {}),
      });
      onReady();
    } catch {
      setError('服务地址必须安全：仅本机自托管可用 HTTP，其他地址（含托管模式）必须使用 HTTPS。');
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      importLocalVibe(JSON.parse(await file.text()));
      saveRuntimeConfig({ mode: 'local', endpoint: '', ownerToken: '' });
      onReady();
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法导入这个 Vibe');
    }
  };

  return (
    <main className="min-h-dvh bg-background text-foreground flex items-center justify-center p-5">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">你的 Vibe，放在哪里？</h1>
          <p className="mt-2 text-sm text-muted-foreground">先选择运行方式。以后可以导出并迁移，不会被绑定。</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {modes.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={() => { setMode(item.id); setError(''); }} className={`rounded-2xl border p-4 text-left transition-all ${mode === item.id ? 'border-foreground bg-foreground/[0.04] shadow-sm' : 'border-border bg-card hover:border-foreground/30'}`}>
                <Icon className="mb-4 h-5 w-5" />
                <div className="text-sm font-bold">{item.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</div>
              </button>
            );
          })}
        </div>

        {mode !== 'local' && (
          <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-2">
            <label className="text-xs font-semibold">服务地址<input value={endpoint} onChange={event => setEndpoint(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground/40" /></label>
            <label className="text-xs font-semibold">主人令牌<input type="password" value={token} onChange={event => setToken(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground/40" /></label>
            {mode === 'managed' && <>
              <label className="text-xs font-semibold">账户 ID<input value={accountId} onChange={event => setAccountId(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground/40" /></label>
              <label className="text-xs font-semibold">公开 Card Slug<input value={cardSlug} onChange={event => setCardSlug(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground/40" /></label>
            </>}
          </div>
        )}

        {error && <p className="mt-3 text-center text-sm font-medium text-red-600">{error}</p>}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button onClick={finish} className="flex-1 rounded-xl bg-foreground px-5 py-3 text-sm font-bold text-background transition-opacity hover:opacity-90">继续创建 <ArrowRight className="ml-2 inline h-4 w-4" /></button>
          <button onClick={() => inputRef.current?.click()} className="flex-1 rounded-xl border border-border bg-card px-5 py-3 text-sm font-bold hover:border-foreground/30"><Upload className="mr-2 inline h-4 w-4" />导入 .vibe</button>
          <input ref={inputRef} type="file" accept=".vibe,application/json" onChange={importFile} className="hidden" />
        </div>
      </motion.section>
    </main>
  );
}
