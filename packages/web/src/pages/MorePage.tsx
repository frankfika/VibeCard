import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Compass, Gamepad2, ChevronRight, Sparkles, Box, Sun, Moon,
} from 'lucide-react';
import DiscoverPage from './DiscoverPage';
import GamesPage from './GamesPage';
import WalletConnect from '../components/WalletConnect';
import ChainIdentityCard from '../components/chain/ChainIdentityCard';
import PointsCard from '../components/chain/PointsCard';
import { useProfile } from '../store';
import { useTheme } from '../components/ThemeProvider';
import { useToast } from '../components/ui/ToastProvider';

export default function MorePage() {
  const [activeView, setActiveView] = useState<'index' | 'discover' | 'games'>('index');
  const { profile } = useProfile();
  const { theme, resolved, toggle } = useTheme();
  const toast = useToast();
  const profileComplete = !!(
    profile.name && profile.bio && profile.tags?.length >= 3 &&
    (profile.verified?.wallet || profile.verified?.twitter || profile.verified?.discord)
  );

  if (activeView === 'discover') {
    return (
      <div className="h-full flex flex-col relative bg-background">
        <header className="px-5 py-3 border-b border-border flex items-center shrink-0">
          <button
            onClick={() => setActiveView('index')}
            className="text-[14px] font-semibold text-muted-foreground hover:text-foreground"
          >
            ← 返回
          </button>
        </header>
        <DiscoverPage />
      </div>
    );
  }

  if (activeView === 'games') {
    return (
      <div className="h-full flex flex-col relative bg-background">
        <header className="px-5 py-3 border-b border-border flex items-center shrink-0">
          <button
            onClick={() => setActiveView('index')}
            className="text-[14px] font-semibold text-muted-foreground hover:text-foreground"
          >
            ← 返回
          </button>
        </header>
        <GamesPage />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <header className="px-6 pt-5 pb-4 shrink-0 z-10">
        <h2 className="text-[22px] font-black tracking-tight text-foreground">发现与工具</h2>
      </header>

      <main className="flex-1 overflow-y-auto px-6 pb-32 space-y-6 no-scrollbar">
        {/* Vibe Points — economic layer (primary surface) */}
        <section>
          <PointsCard />
        </section>

        {/* On-Chain Identity (DappChain microchain — primary surface) */}
        <section>
          <ChainIdentityCard profileComplete={profileComplete} />
        </section>

        {/* Wallet Anchor (advanced, collapsed by default) */}
        <section>
          <details className="group rounded-[20px] border border-border/50 bg-card/60 backdrop-blur-md overflow-hidden">
            <summary className="list-none cursor-pointer px-5 py-4 flex items-center justify-between active:bg-secondary/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[12px] bg-secondary flex items-center justify-center">
                  <Box className="w-4 h-4 text-foreground" />
                </div>
                <div>
                  <h4 className="text-[14px] font-bold text-foreground leading-tight">链上锚定（高级）</h4>
                  <p className="text-[11px] font-medium text-muted-foreground mt-0.5">把本地链摘要存到真实测试网</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-open:rotate-90 transition-transform" />
            </summary>
            <div className="px-5 pb-5 pt-0">
              <WalletConnect />
              <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                本地链已记录所有活动 — 连接钱包仅用于把最新区块哈希锚定到 EVM 测试网，作为外部存证。日常使用无需连接。
              </p>
            </div>
          </details>
        </section>

        {/* Discover Module */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">发现</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              // Discover-companion feature is on the roadmap; clicking tells
              // the user it's not live yet instead of leaving a dead button.
              toast.show({ message: '搭子发现功能即将上线, 关注更新', type: 'info', duration: 3000 });
            }}
            className="w-full bg-card/40 backdrop-blur-xl border border-border rounded-[24px] p-6 flex items-center justify-between group hover:bg-card/60 active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[16px] bg-foreground flex items-center justify-center shadow-lg">
                <Compass className="w-6 h-6 text-background" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-[17px] font-bold text-foreground leading-tight">发现搭子</h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">即将上线</span>
                </div>
                <p className="text-[13px] font-medium text-muted-foreground">探索并连接志同道合的朋友</p>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center">
              <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
            </div>
          </button>
        </section>

        {/* Utilities Module */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Box className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">工具</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <motion.button
              whileHover={{ scale: 0.98 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveView('games')}
              className="text-left p-5 rounded-[20px] bg-card border border-border/50 shadow-sm flex flex-col gap-3 group"
            >
              <div className="w-10 h-10 rounded-[12px] bg-secondary flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-colors">
                <Gamepad2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-[15px] font-bold text-foreground leading-tight">互动卡片</h4>
                <p className="text-[11px] font-medium text-muted-foreground mt-1">破冰与深入交流的小游戏</p>
              </div>
            </motion.button>

            <button
              onClick={toggle}
              className="text-left p-5 rounded-[20px] bg-card border border-border/50 shadow-sm flex flex-col gap-3 group hover:bg-secondary/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-[12px] bg-secondary flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-colors">
                {resolved === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </div>
              <div>
                <h4 className="text-[15px] font-bold text-foreground leading-tight">
                  {theme === 'system' ? '跟随系统' : theme === 'dark' ? '深色模式' : '浅色模式'}
                </h4>
                <p className="text-[11px] font-medium text-muted-foreground mt-1">
                  点击切换主题：系统 / 浅色 / 深色
                </p>
              </div>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
