export type ManagedPlan = 'free' | 'pro';
export type BillingStatus = 'active' | 'past_due' | 'canceled';

export interface Usage {
  modelCalls: number;
  retrievalCalls: number;
  knowledgeBytes: number;
  estimatedCents: number;
}

export interface PlanLimits {
  modelCalls: number;
  retrievalCalls: number;
  knowledgeBytes: number;
  knowledgeSources: number;
  maxSourceBytes: number;
  memoryRecords: number;
  monthlyCents: number;
}

export const PLAN_LIMITS: Record<ManagedPlan, PlanLimits> = {
  free: {
    modelCalls: 100,
    retrievalCalls: 500,
    knowledgeBytes: 1_000_000,
    knowledgeSources: 25,
    maxSourceBytes: 256_000,
    memoryRecords: 500,
    monthlyCents: 0,
  },
  pro: {
    modelCalls: 10_000,
    retrievalCalls: 50_000,
    // The reference gateway exports one bounded JSON bundle. Keep the whole
    // legal plan within the verified 10 MB portable envelope; operators that
    // add streaming/paginated export may advertise a larger custom tier.
    knowledgeBytes: 10_000_000,
    knowledgeSources: 1_000,
    maxSourceBytes: 10_000_000,
    memoryRecords: 50_000,
    monthlyCents: 1_500,
  },
};

export function checkManagedUsage(input: {
  plan: ManagedPlan;
  billingStatus: BillingStatus;
  usage: Usage;
  modelCalls?: number;
  retrievalCalls?: number;
  knowledgeBytes?: number;
}) {
  if (input.billingStatus !== 'active') return { ok: false as const, code: 'billing_required', message: 'managed plan is not active' };
  const limits = PLAN_LIMITS[input.plan];
  if (input.usage.modelCalls + (input.modelCalls ?? 0) > limits.modelCalls) return { ok: false as const, code: 'quota_exceeded', message: 'managed model quota exceeded' };
  if (input.usage.retrievalCalls + (input.retrievalCalls ?? 0) > limits.retrievalCalls) return { ok: false as const, code: 'quota_exceeded', message: 'managed retrieval quota exceeded' };
  if (input.usage.knowledgeBytes + (input.knowledgeBytes ?? 0) > limits.knowledgeBytes) return { ok: false as const, code: 'quota_exceeded', message: 'managed knowledge quota exceeded' };
  return { ok: true as const };
}

export function addUsage(usage: Usage, delta: { modelCalls?: number; retrievalCalls?: number; knowledgeBytes?: number; estimatedCents?: number }): Usage {
  return {
    modelCalls: usage.modelCalls + (delta.modelCalls ?? 0),
    retrievalCalls: usage.retrievalCalls + (delta.retrievalCalls ?? 0),
    knowledgeBytes: usage.knowledgeBytes + (delta.knowledgeBytes ?? 0),
    estimatedCents: usage.estimatedCents + (delta.estimatedCents ?? 0),
  };
}
