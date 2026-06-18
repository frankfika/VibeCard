/**
 * ChainIdentityCard — primary surface in the More tab to show the user's
 * on-chain identity: pseudo-address, reputation, badge collection, recent activity.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAccount } from 'wagmi';
import {
  Shield, ChevronRight, Copy, Check, Sparkles, Layers, Activity, Flame,
  Lock, Trophy, Wallet,
} from 'lucide-react';
import { useChain } from '../../lib/chain/useChain';
import { BADGES, BADGE_BY_ID, rarityColor, rarityRing, type BadgeDef } from '../../lib/chain/badges';
import { tierGradient } from '../../lib/chain/reputation';
import { shortHash } from '../../lib/chain/chain';
import { useENSIdentity } from '../../lib/web3/identity';
import ChainExplorer from './ChainExplorer';

interface Props {
  profileComplete: boolean;
  onOpenExplorer?: () => void;
}

export default function ChainIdentityCard({ profileComplete }: Props) {
  const { state, reputation, evaluate, ready } = useChain();
  const { address: walletAddress, isConnected } = useAccount();
  const walletIdentity = useENSIdentity(walletAddress);
  const [copied, setCopied] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [openBadge, setOpenBadge] = useState<BadgeDef | null>(null);
  const [openExplorer, setOpenExplorer] = useState(false);
  const [newBadges, setNewBadges] = useState<string[]>([]);

  useEffect(() => {
    if (!ready) return;
    evaluate(profileComplete).then(earned => {
      if (earned.length) setNewBadges(earned);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, profileComplete, state?.stats.txCount]);

  const earnedSet = useMemo(() => new Set(state?.badges ?? []), [state?.badges]);
  const sorted = useMemo(() => {
    const order: Record<string, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };
    return [...BADGES].sort((a, b) => {
      const aHas = earnedSet.has(a.id) ? 0 : 1;
      const bHas = earnedSet.has(b.id) ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      return order[a.rarity] - order[b.rarity];
    });
  }, [earnedSet]);

  if (!state) {
    return (
      <div className="rounded-[24px] border border-border/50 bg-card/70 p-5 shadow-sm backdrop-blur-md animate-pulse">
        <div className="h-4 w-24 bg-secondary rounded mb-4" />
        <div className="h-12 bg-secondary rounded mb-3" />
        <div className="h-3 bg-secondary rounded w-2/3" />
      </div>
    );
  }

  const copyAddress = () => {
    navigator.clipboard.writeText(state.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const copyWallet = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopiedWallet(true);
    setTimeout(() => setCopiedWallet(false), 1400);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-[24px] border border-border/50 bg-card/80 backdrop-blur-md shadow-sm overflow-hidden"
      >
        <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${tierGradient(reputation.tier)} opacity-[0.18]`} />
        <div className="relative p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">On-Chain Identity</h3>
            </div>
            <button
              onClick={() => setOpenExplorer(true)}
              className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              Explorer <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Address */}
          <button
            onClick={copyAddress}
            className="group flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-foreground/5 hover:bg-foreground/10 transition-all w-fit max-w-full"
          >
            <code className="font-mono text-[12px] font-semibold text-foreground truncate">
              {shortHash(state.address, 8, 6)}
            </code>
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />}
          </button>

          {/* Linked Wallet */}
          {isConnected && walletAddress ? (
            <button
              onClick={copyWallet}
              className="group flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-foreground/5 hover:bg-foreground/10 transition-all w-fit max-w-full"
            >
              <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
              <code className="font-mono text-[12px] font-semibold text-foreground truncate">
                {walletIdentity.ensName ?? shortHash(walletAddress, 8, 6)}
              </code>
              {walletIdentity.ensName && (
                <span className="text-[10px] font-bold text-muted-foreground hidden sm:inline">
                  {shortHash(walletAddress, 4, 4)}
                </span>
              )}
              {copiedWallet ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />}
            </button>
          ) : null}

          {/* Reputation Bar */}
          <div className="mb-5">
            <div className="flex items-baseline justify-between mb-1.5">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[28px] font-black tracking-tight text-foreground tabular-nums">{reputation.total}</span>
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">DappRep</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[12px] font-bold bg-gradient-to-r ${tierGradient(reputation.tier)} bg-clip-text text-transparent`}>
                    Lv.{reputation.level} · {reputation.tier}
                  </span>
                </div>
              </div>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${reputation.progress * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className={`h-full bg-gradient-to-r ${tierGradient(reputation.tier)} rounded-full`}
              />
            </div>
            <div className="text-[10px] font-medium text-muted-foreground mt-1.5">
              下一等级 {Math.max(0, reputation.nextLevelAt - reputation.total)} DappRep
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            <Stat icon={Layers}    label="Blocks"  value={state.stats.blockCount} />
            <Stat icon={Activity}  label="Txs"     value={state.stats.txCount} />
            <Stat icon={Flame}     label="Streak"  value={state.stats.streak} suffix="d" />
          </div>

          {/* Badges */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Badges {earnedSet.size}/{BADGES.length}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
              {sorted.slice(0, 12).map(b => {
                const earned = earnedSet.has(b.id);
                return (
                  <button
                    key={b.id}
                    onClick={() => setOpenBadge(b)}
                    className={`group aspect-square rounded-2xl flex items-center justify-center text-[20px] transition-all active:scale-95 bg-gradient-to-br ${rarityColor(b.rarity)} ${earned ? rarityRing(b.rarity) : 'ring-1 ring-border opacity-30 grayscale'}`}
                    aria-label={b.name}
                  >
                    {earned ? <span>{b.emoji}</span> : <Lock className="w-4 h-4" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {/* New Badge Toast */}
      <AnimatePresence>
        {newBadges.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-28 md:bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
          >
            <button
              onClick={() => {
                setOpenBadge(BADGE_BY_ID[newBadges[0]] ?? null);
                setNewBadges([]);
              }}
              className="px-5 py-3 rounded-full bg-foreground text-background shadow-2xl flex items-center gap-2.5 active:scale-95 transition-transform"
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-[13px] font-bold">
                解锁新徽章 · {BADGE_BY_ID[newBadges[0]]?.name}
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Badge Detail */}
      <AnimatePresence>
        {openBadge && (
          <BadgeDetail
            badge={openBadge}
            earned={earnedSet.has(openBadge.id)}
            onClose={() => setOpenBadge(null)}
          />
        )}
      </AnimatePresence>

      {/* Explorer */}
      <AnimatePresence>
        {openExplorer && <ChainExplorer onClose={() => setOpenExplorer(false)} />}
      </AnimatePresence>
    </>
  );
}

function Stat({
  icon: Icon, label, value, suffix,
}: { icon: any; label: string; value: number | string; suffix?: string }) {
  return (
    <div className="rounded-2xl bg-secondary/60 px-3 py-2.5">
      <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
        <Icon className="w-3 h-3" />
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-[18px] font-black tabular-nums text-foreground leading-tight">
        {value}{suffix && <span className="text-[12px] font-bold text-muted-foreground ml-0.5">{suffix}</span>}
      </div>
    </div>
  );
}

function BadgeDetail({
  badge, earned, onClose,
}: { badge: BadgeDef; earned: boolean; onClose: () => void }) {
  const Icon = badge.icon;
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50"
      />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.96 }}
        transition={{ type: 'spring', damping: 28, stiffness: 240 }}
        className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto z-50 rounded-3xl bg-background border border-border shadow-2xl p-6"
      >
        <div className={`mx-auto w-20 h-20 rounded-3xl flex items-center justify-center text-[40px] mb-4 bg-gradient-to-br ${rarityColor(badge.rarity)} ${rarityRing(badge.rarity)} ${earned ? '' : 'grayscale opacity-50'}`}>
          {earned ? badge.emoji : <Lock className="w-7 h-7" />}
        </div>
        <div className="text-center mb-4">
          <h3 className="text-[20px] font-black tracking-tight text-foreground mb-1">{badge.name}</h3>
          <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
            {badge.rarity}
          </div>
          <p className="text-[14px] font-medium text-muted-foreground leading-relaxed">
            {badge.description}
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-[11px] font-bold text-muted-foreground mb-5">
          <Icon className="w-3.5 h-3.5" />
          <span className="uppercase tracking-widest">{earned ? 'Earned' : 'Locked'}</span>
        </div>
        <button
          onClick={onClose}
          className="w-full h-11 rounded-xl bg-foreground text-background font-bold text-[14px] hover:opacity-90 transition-opacity"
        >
          关闭
        </button>
      </motion.div>
    </>
  );
}
