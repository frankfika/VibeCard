/**
 * usePoints — reactive view over the local-first points ledger.
 *
 * Subscribes to the ledger so any award/spend anywhere in the app updates all
 * consumers. Also listens to cross-tab storage pings. Exposes the derived
 * reputation tier (matching the on-chain VibeSocial tiers) and convenience
 * actions for the common reward flows.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  loadLedger, award, spend, subscribe, checkEligibility, tierForScore,
  type PointsLedger, type PointsReason, type SpendReason,
  type AwardResult, type SpendResult, type Eligibility, type TierInfo,
} from './points';

interface UsePointsResult {
  balance: number;
  entries: PointsLedger['entries'];
  tier: TierInfo;
  award: (reason: PointsReason, customAmount?: number) => AwardResult;
  spend: (reason: SpendReason) => SpendResult;
  canEarn: (reason: PointsReason) => Eligibility;
}

export function usePoints(): UsePointsResult {
  const [ledger, setLedger] = useState<PointsLedger>(() => loadLedger());

  useEffect(() => {
    const refresh = () => setLedger(loadLedger());
    const unsub = subscribe(refresh);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'vibecard_points_v1' || e.key === 'vibecard_points_ping') refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      unsub();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const awardFn = useCallback((reason: PointsReason, customAmount?: number) => {
    return award(reason, customAmount);
  }, []);

  const spendFn = useCallback((reason: SpendReason) => {
    return spend(reason);
  }, []);

  const canEarn = useCallback((reason: PointsReason) => {
    return checkEligibility(reason);
  }, []);

  return {
    balance: ledger.balance,
    entries: ledger.entries,
    tier: tierForScore(ledger.balance),
    award: awardFn,
    spend: spendFn,
    canEarn,
  };
}
