import { useState } from 'react';
import { Check, RefreshCw, CloudUpload, CloudDownload } from 'lucide-react';
import type { SyncStatus } from '../../store';

export default function SyncActionBar({
  syncStatus,
  onSync,
  onRestore,
}: {
  syncStatus: SyncStatus;
  onSync: () => Promise<boolean>;
  onRestore: () => Promise<boolean>;
}) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    await onSync();
    setIsSyncing(false);
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    await onRestore();
    setIsRestoring(false);
  };

  const statusText = syncStatus.isSynced
    ? `已同步 · ${syncStatus.ipfsHash ? syncStatus.ipfsHash.slice(0, 8) + '…' : ''}`
    : '尚未同步到链上';

  return (
    <div className="flex items-center gap-2 mt-2">
      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${
        syncStatus.isSynced
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-secondary border-border text-muted-foreground'
      }`}>
        {syncStatus.isSynced ? <Check className="w-3 h-3 inline mr-1" /> : null}
        {statusText}
      </span>

      <button
        onClick={handleSync}
        disabled={isSyncing || isRestoring}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-border bg-background text-[10px] font-bold text-foreground hover:bg-secondary disabled:opacity-50 transition-colors"
        title="将名片同步到链上"
      >
        {isSyncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CloudUpload className="w-3 h-3" />}
        同步
      </button>

      <button
        onClick={handleRestore}
        disabled={isSyncing || isRestoring}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-border bg-background text-[10px] font-bold text-foreground hover:bg-secondary disabled:opacity-50 transition-colors"
        title="从链上恢复名片"
      >
        {isRestoring ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CloudDownload className="w-3 h-3" />}
        恢复
      </button>
    </div>
  );
}
