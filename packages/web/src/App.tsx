import { useState, useEffect, lazy, Suspense, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Layers, Menu, ChevronLeft } from 'lucide-react';
import CardPage from './pages/CardPage';
import EmbedCardPage from './pages/EmbedCardPage';
import PublicCardPage from './pages/PublicCardPage';
import IMBrowserNotice from './components/IMBrowserNotice';
import { useProfile } from './store';

const ThreadsPage = lazy(() => import('./pages/ThreadsPage'));
const MorePage = lazy(() => import('./pages/MorePage'));

const E2EChainSyncPage = import.meta.env.DEV
  ? lazy(() => import('./pages/E2EChainSyncPage'))
  : null;

type Tab = 'card' | 'threads' | 'more';

const TAB_CONFIG: { id: Tab; icon: ReactNode; label: string }[] = [
  { id: 'card', icon: <User className="w-5 h-5" />, label: '名片' },
  { id: 'threads', icon: <Layers className="w-5 h-5" />, label: '动态' },
  { id: 'more', icon: <Menu className="w-5 h-5" />, label: '更多' },
];

function MobileHeader({ activeTab, onBack, hidden, onboarding }: { activeTab: string; onBack?: () => void; hidden?: boolean; onboarding?: boolean }) {
  const getTitle = () => {
    if (onboarding) return '创建你的名片';
    switch (activeTab) {
      case 'card': return '我的名片';
      case 'threads': return '动态';
      case 'more': return '发现与工具';
      default: return 'vibecard';
    }
  };

  if (hidden) return null;

  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-50 pointer-events-auto">
      <div className="bg-background/85 backdrop-blur-2xl pt-safe border-b border-border/50 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="h-12 flex items-center justify-between px-4 w-full relative">
          <div className="w-10 flex items-center justify-start">
            {onBack && (
              <button
                onClick={onBack}
                aria-label="返回"
                className="tap-target p-2 -ml-2 rounded-full hover:bg-foreground/5 active:bg-foreground/10 transition-colors active:scale-95 flex items-center justify-center"
              >
                <ChevronLeft className="w-6 h-6 text-foreground" />
              </button>
            )}
          </div>
          <h1 className="text-[16px] font-bold tracking-tight text-foreground flex-1 text-center truncate px-2">
            {getTitle()}
          </h1>
          <div className="w-10 flex items-center justify-end">
            {/* 预留右侧操作区，如发布、设置等 */}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    return (localStorage.getItem('vibecard_tab') as Tab) || 'card';
  });
  const { isSetup } = useProfile();

  const searchParams = new URLSearchParams(window.location.search);
  const isSharedView = searchParams.has('c') || searchParams.has('id');
  const isEmbedView = searchParams.has('address') || searchParams.has('cid');
  const isE2EChainSync = window.location.pathname === '/e2e/chain-sync';

  useEffect(() => {
    if (!isSharedView && !isEmbedView && !isE2EChainSync) {
      localStorage.setItem('vibecard_tab', activeTab);
    }
  }, [activeTab, isSharedView, isEmbedView, isE2EChainSync]);

  if (isE2EChainSync && E2EChainSyncPage) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <E2EChainSyncPage />
      </Suspense>
    );
  }

  if (isSharedView) {
    return <PublicCardPage />;
  }

  if (isEmbedView) {
    return <EmbedCardPage />;
  }

  return (
    <>
      <IMBrowserNotice />
      <div className="min-h-dvh bg-background text-foreground flex md:flex-row flex-col">
        <MobileHeader activeTab={activeTab} hidden={isSharedView} onboarding={!isSetup} />

        {/* Desktop Sidebar */}
        {!isSharedView && (
          <aside className="hidden md:flex flex-col w-56 lg:w-64 border-r border-border bg-sidebar shrink-0">
            <div className="p-6 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
                <User className="w-4 h-4 text-background" />
              </div>
              <div>
                <span className="font-black text-lg tracking-tight block leading-none">vibecard</span>
              </div>
            </div>

            <nav className="flex-1 px-3 py-2 space-y-0.5" role="tablist" aria-label="主导航">
              {TAB_CONFIG.map(tab => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
          </aside>
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col h-dvh md:h-auto relative overflow-hidden">
          <div
            className="flex-1 flex flex-col overflow-hidden relative"
            style={{
              paddingTop: isSharedView ? 0 : 'calc(48px + env(safe-area-inset-top))',
              paddingBottom: isSharedView ? 0 : 'calc(64px + env(safe-area-inset-bottom))',
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                {activeTab === 'card' && <CardPage />}
                {activeTab === 'threads' && (
                  <Suspense fallback={<PageSkeleton />}>
                    <ThreadsPage />
                  </Suspense>
                )}
                {activeTab === 'more' && (
                  <Suspense fallback={<PageSkeleton />}>
                    <MorePage />
                  </Suspense>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Mobile Bottom Tab Bar */}
          {!isSharedView && (
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
              <div className="h-6 bg-gradient-to-t from-background/80 to-transparent" />
              <nav
                role="tablist"
                aria-label="主导航"
                className="bg-background/90 backdrop-blur-2xl px-2 pt-2 pointer-events-auto border-t border-border/50 shadow-[0_-8px_30px_rgba(0,0,0,0.04)]"
                style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
              >
                <div className="flex items-stretch justify-between w-full">
                  {TAB_CONFIG.map(tab => (
                    <div key={tab.id} className="flex-1 flex justify-center">
                      <TabBtn
                        icon={tab.icon}
                        label={tab.label}
                        active={activeTab === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                      />
                    </div>
                  ))}
                </div>
              </nav>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

function PageSkeleton() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6">
      <div className="flex-1 rounded-[28px] bg-secondary/30 animate-pulse" />
    </div>
  );
}

function TabBtn({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      aria-label={label}
      className="tap-target relative flex flex-col items-center justify-center gap-1 px-4 py-1.5 rounded-2xl transition-all duration-300 ease-out group"
    >
      {/* Background Highlight */}
      <div
        className={`absolute inset-0 rounded-2xl transition-all duration-300 ease-out ${
          active ? 'bg-foreground/10 scale-100 opacity-100' : 'bg-foreground/0 scale-50 opacity-0 group-active:bg-foreground/5 group-active:scale-100 group-active:opacity-100'
        }`}
      />

      {/* Icon Container */}
      <div
        className={`relative z-10 transition-all duration-300 ease-out ${
          active ? 'text-foreground scale-110 -translate-y-0.5' : 'text-muted-foreground scale-100 translate-y-0 group-active:text-foreground/80'
        }`}
      >
        {icon}
      </div>

      {/* Label Container */}
      <div
        className={`relative z-10 text-[10px] font-bold tracking-wider transition-all duration-300 ease-out ${
          active ? 'text-foreground opacity-100 translate-y-0' : 'text-muted-foreground opacity-70 translate-y-0.5'
        }`}
      >
        {label}
      </div>
    </button>
  );
}
