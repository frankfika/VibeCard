/**
 * PointsCard — primary points surface for the More page.
 *
 * Shows the live balance, reputation tier with progress toward the next tier,
 * a daily check-in button (cooldown-aware), and a collapsible history of
 * recent earn/spend entries. All driven by the local-first points ledger.
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Coins, Gift, ChevronRight, TrendingUp, Check } from 'lucide-react';
import { usePoints } from '../../lib/web3/usePoints';
import { tierGradient, formatCooldown, REWARD_RULES } from '../../lib/web3/points';
import { useToast } from '../ui/ToastProvider';

export default function PointsCard() {
  const { balance, entries, tier, award, canEarn } = usePoints();
  const toast = useToast();
  const [showHistory, setShowHistory] = useState(false);
  const [signinState, setSigninState] = useState(() => canEarn('daily_signin'));

  // Keep the signin eligibility fresh (cooldown ticks down).
  useEffect(() => {
    const timer = setInterval(() => setSigninState(canEarn('daily_signin')), 1000);
    return () => clearInterval(timer);
  }, [canEarn, balance]);

  const handleSignin = () => {
    const res = award('daily_signin');
    if (res.ok) {
      toast.show({ message: `签到成功，+${res.awarded} 积分`, type: 'success', duration: 2500 });
    } else if (res.blocked?.reason === 'cooldown') {
      toast.show({ message: `今日已签到，${formatCooldown(res.blocked.remainingMs ?? 0)}后可再次签到`, type: 'info', duration: 2500 });
    }
    setSigninState(canEarn('daily_signin'));
  };

  const recentEntries = [...entries].reverse().slice(0, 12);

  return (
    <div className="rounded-[24px] overflow-hidden border border-border/50 bg-card/60 backdrop-blur-md shadow-sm">
      {/* Header: balance + tier */}
      <div className={`relative px-5 pt-5 pb-6 bg-gradient-to-br ${tierGradient(tier.tier)}`}>
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-white/80 text-[11px] font-bold uppercase tracking-widest mb-1">
              <Coins className="w-3.5 h-3.5" />
              Vibe Points
            </div>
            <div className="text-white text-[34px] font-black tracking-tight leading-none">
              {balance.toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm border border-white/25">
              <TrendingUp className="w-3.5 h-3.5 text-white" />
              <span className="text-white text-[12px] font-bold">{tier.label}</span>
            </div>
          </div>
        </div>

        {/* Progress to next tier */}
        {tier.next !== null && (
          <div className="relative mt-4">
            <div className="flex items-center justify-between text-[10px] font-bold text-white/80 mb-1.5">
              <span>距下一等级</span>
              <span>{balance} / {tier.next}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/25 overflow-hidden">
              <motion.div
                className="h-full bg-white rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${tier.progress * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Daily check-in */}
      <div className="px-5 py-4">
        <button
          onClick={handleSignin}
          disabled={!signinState.ok}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl font-bold text-[14px] transition-all active:scale-[0.98] ${
            signinState.ok
              ? 'bg-foreground text-background hover:opacity-90'
              : 'bg-secondary text-muted-foreground cursor-not-allowed'
          }`}
        >
          <span className="flex items-center gap-2">
            {signinState.ok ? <Gift className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            {signinState.ok ? '每日签到' : '今日已签到'}
          </span>
          <span className="text-[12px] font-bold opacity-80">
            {signinState.ok
              ? `+${REWARD_RULES.daily_signin.amount}`
              : signinState.remainingMs
                ? formatCooldown(signinState.remainingMs)
                : ''}
          </span>
        </button>
      </div>

      {/* History toggle */}
      <button
        onClick={() => setShowHistory(v => !v)}
        className="w-full px-5 py-3 flex items-center justify-between border-t border-border/50 active:bg-secondary/40 transition-colors"
      >
        <span className="text-[13px] font-bold text-foreground">积分明细</span>
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${showHistory ? 'rotate-90' : ''}`} />
      </button>

      {showHistory && (
        <div className="px-5 pb-4 max-h-[260px] overflow-y-auto no-scrollbar">
          {recentEntries.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-4 text-center">还没有积分记录，开始使用赚取积分吧</p>
          ) : (
            <div className="space-y-1">
              {recentEntries.map(entry => (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-foreground truncate">{entry.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <span className={`text-[14px] font-black tabular-nums shrink-0 ml-3 ${entry.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {entry.amount >= 0 ? '+' : ''}{entry.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
