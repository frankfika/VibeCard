/**
 * useChain — React hook + provider for the local DappChain.
 * Wraps lib/chain to give components a reactive view of chain state.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  initChain, emit, getChain, verify, resetChain,
  type ChainState, type TxType, type Transaction,
} from './chain';
import { evaluateBadges, BADGE_BY_ID } from './badges';
import { computeReputation, type ReputationBreakdown } from './reputation';

interface UseChainResult {
  state: ChainState | null;
  ready: boolean;
  reputation: ReputationBreakdown;
  emit: (type: TxType, payload?: Record<string, unknown>) => Promise<Transaction | null>;
  evaluate: (profileComplete: boolean) => Promise<string[]>;
  refresh: () => void;
  verify: () => Promise<{ ok: boolean; brokenAt?: number }>;
  reset: () => void;
}

export function useChain(): UseChainResult {
  const [state, setState] = useState<ChainState | null>(() => getChain());
  const [ready, setReady] = useState<boolean>(!!getChain());

  useEffect(() => {
    let cancelled = false;
    if (!state) {
      initChain().then(s => {
        if (!cancelled) {
          setState(s);
          setReady(true);
        }
      });
    } else {
      setReady(true);
    }
    return () => { cancelled = true; };
  }, [state]);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'vibecard_chain_v1') setState(getChain());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const refresh = useCallback(() => setState(getChain()), []);

  const emitTx = useCallback(async (type: TxType, payload: Record<string, unknown> = {}) => {
    try {
      const { tx, state: next } = await emit(type, payload);
      setState(next);
      return tx;
    } catch (err) {
      console.warn('chain.emit failed', err);
      return null;
    }
  }, []);

  const evaluate = useCallback(async (profileComplete: boolean) => {
    const current = getChain();
    if (!current) return [];
    const newBadges = evaluateBadges(current, profileComplete);
    if (newBadges.length === 0) return [];

    let chain = current;
    for (const id of newBadges) {
      const def = BADGE_BY_ID[id];
      if (!def) continue;
      const updated: ChainState = { ...chain, badges: [...chain.badges, id] };
      localStorage.setItem('vibecard_chain_v1', JSON.stringify(updated));
      await emit('badge.earn', { badge: id, name: def.name });
      chain = getChain() ?? updated;
    }
    setState(chain);
    return newBadges;
  }, []);

  const reputation = computeReputation(state);

  return {
    state,
    ready,
    reputation,
    emit: emitTx,
    evaluate,
    refresh,
    verify,
    reset: () => { resetChain(); setState(null); setReady(false); },
  };
}
