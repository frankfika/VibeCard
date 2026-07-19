import { Sparkles } from 'lucide-react';

/**
 * 我的 Vibe（owner conversation）。
 *
 * Task 0.2 placeholder: the owner chat with memory proposals is built in
 * Milestone 1 on top of the shared `Memory` contract. For now this page owns
 * the navigation destination and explains what Vibe is, with an empty state.
 */
export default function MyVibePage() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <header className="hidden md:flex px-6 py-4 justify-center items-center z-20 shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground tracking-widest uppercase">
          我的 Vibe
        </span>
      </header>

      <main className="flex-1 overflow-y-auto px-6 no-scrollbar">
        <div className="h-full flex flex-col items-center justify-center text-center gap-4 pb-24">
          <div className="w-16 h-16 rounded-[22px] bg-foreground flex items-center justify-center shadow-lg">
            <Sparkles className="w-7 h-7 text-background" />
          </div>
          <div className="space-y-2 max-w-[280px]">
            <h2 className="text-[17px] font-bold text-foreground">你的私有 Vibe</h2>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              在这里和它随便聊聊：最近在做什么、喜欢什么、不希望别人知道什么。
              它只会记住你确认过的内容。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
