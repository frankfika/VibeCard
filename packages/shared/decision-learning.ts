/**
 * Owner-controlled learning from connection decisions (task 2.6).
 *
 * A click is interaction data, never durable memory. This module only decides
 * whether the evidence is strong enough to ASK the owner about one private
 * preference/boundary memory. The normal Memory lifecycle still owns confirm,
 * reject, edit, pause, and delete.
 */

import type { ConnectionRequest, MemoryKind } from './vibe';
import type { MemoryProposal } from './agent-schema';
import type { OwnerAction } from './connection';

export const DECISION_LEARNING_SOURCE_PREFIX = 'connection-decision:';

export interface ExplicitDecisionPreference {
  kind: Extract<MemoryKind, 'preference' | 'boundary'>;
  /** Owner-authored first-person preference/boundary, never visitor profile data. */
  content: string;
}

export interface DecisionLearningSignal {
  requestId: string;
  decision: OwnerAction;
  /** Privacy-minimized topic labels only; no reason, identity, URL, or free-form visitor profile. */
  contexts: string[];
}

export interface DecisionLearningEvidence {
  current: DecisionLearningSignal;
  prior: DecisionLearningSignal[];
  explicitPreference?: ExplicitDecisionPreference;
  /** Visitor-derived fragments that must not appear in model output. */
  forbiddenFragments: string[];
}

export interface DecisionLearningProposal extends MemoryProposal {
  kind: 'preference' | 'boundary';
  suggestedVisibility: 'private' | 'agent_only';
  sourceRequestIds: string[];
  /** Stable across retries; used as the proposal's idempotency source key. */
  idempotencyKey: string;
}

export type DecisionLearningEligibility =
  | { eligible: false; reason: 'ambiguous_single_decision' | 'unsafe_third_party_information' }
  | {
      eligible: true;
      kind: 'preference' | 'boundary';
      suggestedContent: string;
      sourceRequestIds: string[];
      repeatedContext?: string;
    };

function clean(value: string, max = 120): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalized(value: string): string {
  return clean(value).toLocaleLowerCase('zh-CN');
}

function unique(values: readonly string[], max = 20): string[] {
  return [...new Set(values.map((value) => clean(value)).filter(Boolean))].slice(0, max);
}

/**
 * Repeated learning accepts only a deliberately small, product-level topic
 * vocabulary. `possibleSharedContext` is visitor-controlled, so an arbitrary
 * repeated string is never treated as a topic. Unknown text is discarded.
 */
const SAFE_TOPIC_RULES: ReadonlyArray<{ label: string; patterns: RegExp[] }> = [
  { label: '个人 AI 分身', patterns: [/^(?:双方)?都?(?:在)?(?:做|开发|研究)?(?:个人)?ai分身$/i, /^(?:both)?personalaiagents?$/i] },
  { label: '自托管 AI', patterns: [/^(?:双方)?都?(?:在)?(?:做|研究)?自托管ai$/i, /^(?:both)?selfhostedai$/i] },
  { label: 'AI 社交产品', patterns: [/^(?:双方)?都?(?:在)?(?:做|开发|研究)?ai社交产品$/i, /^(?:both)?aisocialproducts?$/i] },
  { label: '隐私边界', patterns: [/^(?:双方)?都?(?:关注|研究)?隐私边界$/i, /^(?:both)?privacyboundar(?:y|ies)$/i] },
  { label: '数据隐私', patterns: [/^(?:双方)?都?(?:关注|研究)?数据隐私$/i, /^(?:both)?dataprivacy$/i] },
  { label: '模型安全', patterns: [/^(?:双方)?都?(?:关注|研究)?模型安全$/i, /^(?:both)?modelsafety$/i] },
  { label: '知识检索', patterns: [/^(?:双方)?都?(?:在)?(?:做|研究)?知识检索$/i, /^(?:both)?knowledgeretrieval$/i] },
  { label: '微信小程序', patterns: [/^(?:双方)?都?(?:在)?(?:做|开发)?微信小程序$/i, /^(?:both)?wechatminiprograms?$/i] },
  { label: '开源软件', patterns: [/^(?:双方)?都?(?:在)?(?:做|开发|贡献)?开源软件$/i, /^(?:both)?opensource(?:software)?$/i] },
  { label: '产品设计', patterns: [/^(?:双方)?都?(?:在)?(?:做|研究)?产品设计$/i, /^(?:both)?productdesign$/i] },
  { label: '用户研究', patterns: [/^(?:双方)?都?(?:在)?(?:做|研究)?用户研究$/i, /^(?:both)?userresearch$/i] },
  { label: '软件开发', patterns: [/^(?:双方)?都?(?:在)?(?:做|从事)?软件开发$/i, /^(?:both)?softwaredevelopment$/i] },
];

function compactTopic(value: string): string {
  return clean(value, 100)
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function normalizeSafeDecisionTopic(value: string): string | null {
  const compact = compactTopic(value);
  if (!compact) return null;
  for (const rule of SAFE_TOPIC_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(compact))) return rule.label;
  }
  return null;
}

function identifiableFragments(value: string): string[] {
  const raw = clean(value, 500);
  if (!raw) return [];
  const found: string[] = [raw];
  found.push(...raw.split(/[\s,，。；;、|/]+/).filter((part) => part.length >= 3));
  found.push(...(raw.match(/https?:\/\/[^\s]+|www\.[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|@[A-Za-z0-9_.-]{2,}|\b\+?\d[\d\s().-]{6,}\d\b/gi) ?? []));
  found.push(...(raw.match(/\b[A-Z][a-z]{1,30}(?:\s+[A-Z][a-z]{1,30})+\b/g) ?? []));
  // Visitor text often presents a Chinese name without an explicit marker
  // (for example “张伟想和你交流”). Capture conservative surname-led
  // candidates so a model cannot copy that identity into durable memory.
  for (const match of raw.matchAll(/(?=([赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹][\u3400-\u9fff]{1,2}))/g)) {
    if (match[1]) found.push(match[1].slice(0, 2), match[1]);
  }
  found.push(...(raw.match(/(?:欧阳|司马|上官|诸葛|东方|皇甫|尉迟|公孙)[\u3400-\u9fff]{1,2}/g) ?? []));
  for (const match of raw.matchAll(/(?:我是|我叫|叫做|介绍|认识|联系|寻找)\s*([\u3400-\u9fff]{2,4})(?=给|来|和|，|。|、|,|\s|$)/g)) {
    if (match[1]) found.push(match[1]);
  }
  for (const match of raw.matchAll(/来自\s*([\u3400-\u9fff]{2,12})(?=，|。|、|,|\s|$)/g)) {
    if (match[1]) found.push(match[1]);
  }
  return unique(found, 40);
}

/**
 * Extract only bounded topic labels for learning evidence. Identifiable
 * request fields (`visitorId`, summary, reason, URL) intentionally never
 * enter the returned signal.
 */
export function connectionDecisionSignal(
  request: Readonly<ConnectionRequest>,
  decision: OwnerAction = request.ownerAction as OwnerAction,
): DecisionLearningSignal {
  return {
    requestId: request.id,
    decision,
    contexts: unique(
      (request.possibleSharedContext ?? [])
        .map((context) => normalizeSafeDecisionTopic(context))
        .filter((context): context is string => !!context),
      5,
    ),
  };
}

/** Potential third-party fragments used as a post-model privacy deny-list. */
export function thirdPartyFragments(request: Readonly<ConnectionRequest>): string[] {
  const unsafeContexts = (request.possibleSharedContext ?? [])
    .filter((context) => normalizeSafeDecisionTopic(context) === null);
  const values = [
    request.visitorId,
    request.visitorSummary,
    request.visitorWorkUrl ?? '',
    request.reason,
    ...unsafeContexts,
  ];
  return unique(
    values.flatMap(identifiableFragments),
    80,
  );
}

export function validateExplicitDecisionPreference(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'invalid_learning_preference';
  const record = value as Record<string, unknown>;
  if (record.kind !== 'preference' && record.kind !== 'boundary') return 'invalid_learning_kind';
  if (typeof record.content !== 'string' || !record.content.trim() || record.content.length > 500) {
    return 'invalid_learning_content';
  }
  return null;
}

/** Reject output that contains an identifiable visitor-derived fragment. */
export function containsForbiddenThirdPartyInformation(
  content: string,
  fragments: readonly string[],
): boolean {
  const target = normalized(content);
  return fragments.some((fragment) => {
    const needle = normalized(fragment);
    // Chinese names are commonly only two characters (for example “张伟”).
    // Keep the three-character floor for general fragments to avoid noisy
    // matches, but never let that floor exempt a two-character CJK identity.
    const isShortCjkIdentity = /^[\u3400-\u9fff]{2}$/.test(needle);
    return (needle.length >= 3 || isShortCjkIdentity) && target.includes(needle);
  });
}

/**
 * One explicit owner statement is clear evidence. Without one, the same
 * bounded context must appear in at least two decisions with the same action.
 */
export function evaluateDecisionLearning(
  evidence: DecisionLearningEvidence,
): DecisionLearningEligibility {
  if (evidence.explicitPreference) {
    if (
      validateExplicitDecisionPreference(evidence.explicitPreference) ||
      containsForbiddenThirdPartyInformation(
        evidence.explicitPreference.content,
        evidence.forbiddenFragments,
      )
    ) {
      return { eligible: false, reason: 'unsafe_third_party_information' };
    }
    return {
      eligible: true,
      kind: evidence.explicitPreference.kind,
      suggestedContent: clean(evidence.explicitPreference.content, 500),
      sourceRequestIds: [evidence.current.requestId],
    };
  }

  const currentContexts = new Map(
    evidence.current.contexts.map((context) => [normalized(context), clean(context)]),
  );
  for (const prior of evidence.prior) {
    if (prior.decision !== evidence.current.decision) continue;
    for (const context of prior.contexts) {
      const label = currentContexts.get(normalized(context));
      if (!label) continue;
      const positive = evidence.current.decision === 'connect';
      const suggestedContent = positive
        ? `我更愿意认识能围绕「${label}」进行具体交流的人。`
        : `对于围绕「${label}」的连接邀请，我希望先看到更明确、合适的交流理由。`;
      if (containsForbiddenThirdPartyInformation(suggestedContent, evidence.forbiddenFragments)) {
        continue;
      }
      return {
        eligible: true,
        kind: positive ? 'preference' : 'boundary',
        suggestedContent,
        sourceRequestIds: [prior.requestId, evidence.current.requestId].sort(),
        repeatedContext: label,
      };
    }
  }
  return { eligible: false, reason: 'ambiguous_single_decision' };
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function stableFingerprint(value: string): string {
  return `${fnv1a(value)}${fnv1a([...value].reverse().join(''))}`;
}

export function decisionLearningIdempotencyKey(
  ownerId: string,
  decidedRequestId: string,
): string {
  // Bound to the decision, not model wording or a mutable set of prior
  // evidence. One decided request can therefore yield at most one proposal.
  return `${DECISION_LEARNING_SOURCE_PREFIX}${stableFingerprint(`${ownerId}|${decidedRequestId}`)}`;
}

/** Validate untrusted agent output and attach server-owned source metadata. */
export function finalizeDecisionLearningProposal(
  value: unknown,
  evidence: DecisionLearningEvidence,
  ownerId: string,
): DecisionLearningProposal | null {
  const eligibility = evaluateDecisionLearning(evidence);
  if (!eligibility.eligible) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== 'preference' && record.kind !== 'boundary') return null;
  if (record.kind !== eligibility.kind) return null;
  if (typeof record.content !== 'string' || !record.content.trim() || record.content.length > 500) return null;
  if (record.suggestedVisibility !== 'private' && record.suggestedVisibility !== 'agent_only') return null;
  if (containsForbiddenThirdPartyInformation(record.content, evidence.forbiddenFragments)) return null;
  const content = clean(record.content, 500);
  return {
    kind: record.kind,
    content,
    suggestedVisibility: record.suggestedVisibility,
    sourceMessageIds: eligibility.sourceRequestIds,
    sourceRequestIds: eligibility.sourceRequestIds,
    idempotencyKey: decisionLearningIdempotencyKey(ownerId, evidence.current.requestId),
  };
}
