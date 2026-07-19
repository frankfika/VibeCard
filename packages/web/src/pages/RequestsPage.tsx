import { Inbox } from 'lucide-react';

/**
 * 联系请求（Connection requests inbox）。
 *
 * Task 0.2 placeholder: the real inbox (list + detail + owner actions) is
 * built on top of `ConnectionRequest` contracts in later milestones. For now
 * this page owns the navigation destination and the empty state.
 */
export default function RequestsPage() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <header className="hidden md:flex px-6 py-4 justify-center items-center z-20 shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground tracking-widest uppercase">
          联系请求
        </span>
      </header>

      <main className="flex-1 overflow-y-auto px-6 no-scrollbar">
        <div className="h-full flex flex-col items-center justify-center text-center gap-4 pb-24">
          <div className="w-16 h-16 rounded-[22px] bg-secondary flex items-center justify-center">
            <Inbox className="w-7 h-7 text-muted-foreground" />
          </div>
          <div className="space-y-2 max-w-[260px]">
            <h2 className="text-[17px] font-bold text-foreground">还没有人想认识你</h2>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              分享你的 Card，真正理解你的人会带着具体的理由来找你。是否认识，永远由你决定。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
