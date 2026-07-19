/**
 * Agent orchestration (task 1.2).
 *
 * Owner mode only for now (ownerMessage / extractMemoryProposal). The
 * provider's raw text is parsed and schema-validated; one retry on invalid
 * output, then a typed error. Raw model output, prompts, and stack traces
 * never reach the client.
 */

const { validateOwnerAgentResult, validateCardDraft, typedError, ok } = require('./schema');

const OWNER_SYSTEM_PROMPT = [
  '你是用户的私有 Vibe：温暖、敏锐、简洁，从不谄媚。',
  '你在帮用户整理「此刻的自己」。普通对话就是训练，不要像问卷。',
  '每条回复最多提出一条值得长期记住的记忆（memoryProposal），大多数回复不需要提议。',
  '值得记住：稳定的偏好、当下重心的变化、代表性经历、隐私或关系边界、想认识谁。',
  '不值得记住：寒暄、一时的情绪、第三方信息、已经记住过的事实。',
  '只输出 JSON：{"reply": string, "memoryProposal": {"kind","content","suggestedVisibility","sourceMessageIds"} | null, "cardUpdateSuggested": boolean}。',
  'kind ∈ fact|current|preference|boundary；suggestedVisibility ∈ public|agent_only|connected|private，默认从 private 开始。',
].join('\n');

function buildMemoryContext(memories) {
  if (!memories || memories.length === 0) return '（还没有已确认的记忆。）';
  return memories
    .map(m => `- [${m.kind}/${m.visibility}] ${m.content}`)
    .join('\n');
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return null;
  const normalized = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
  return normalized.length > 0 ? normalized : null;
}

async function callAndValidate(provider, system, messages) {
  const raw = await provider.complete({ system, messages });
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'invalid_json' };
  }
  const invalid = validateOwnerAgentResult(parsed);
  if (invalid) return { error: invalid };
  return { value: parsed };
}

/**
 * Run the owner-mode agent. Returns { ok, result } or { ok:false, error }.
 */
async function runOwnerAgent({ provider, memories, messages }) {
  const normalized = normalizeMessages(messages);
  if (!normalized) return typedError('invalid_request', 'messages must be a non-empty array');

  const system = `${OWNER_SYSTEM_PROMPT}\n\n已确认的记忆（只有用户确认过的内容）：\n${buildMemoryContext(memories)}`;

  let attempt = await callAndValidate(provider, system, normalized);
  if (attempt.error) {
    // Retry once with the same validated contract, then give up as a typed error.
    attempt = await callAndValidate(provider, system, normalized);
    if (attempt.error) {
      return typedError('invalid_model_output', 'model output failed schema validation');
    }
  }
  return ok(attempt.value);
}

/**
 * Extract at most one memory proposal from a conversation excerpt.
 */
async function extractMemoryProposal({ provider, memories, messages }) {
  const outcome = await runOwnerAgent({ provider, memories, messages });
  if (!outcome.ok) return outcome;
  return ok({ proposal: outcome.result.memoryProposal || null });
}

const CARD_DRAFT_SYSTEM_PROMPT = [
  '你在为主人的 VibeCard 起草更新建议。规则：',
  '- 只能使用「已确认的记忆」，不得编造；没有依据的部分留空，由下游剔除。',
  '- 主人自己写过的内容如果更具体，保留主人的原文（在 keptFields 里列出字段名）。',
  '- 不得包含任何联系方式（微信号、手机号、邮箱等）。',
  '- 每个列表最多 3-5 条，宁缺毋滥；亮点 highlights 最多 3 条。',
  '只输出 JSON：{"headline": string, "currentFocus": string, "canHelpWith": string[], "wantsToMeet": string[], "topics": string[], "highlights": [{"title","url?"}], "keptFields": string[]}。',
].join('\n');

/**
 * Generate a Card draft from confirmed memories only. The draft is a
 * suggestion — publishing is always a separate owner action.
 */
async function runCardDraft({ provider, memories, currentCard }) {
  const confirmed = (memories || []).filter(m => m.status === 'confirmed');
  if (confirmed.length === 0) {
    return typedError('no_confirmed_memories', '还没有已确认的记忆，先和 Vibe 聊几句吧');
  }

  const memoryContext = confirmed.map(m => `- [${m.kind}] ${m.content}`).join('\n');
  const currentContext = currentCard
    ? `\n\n主人当前 Card（已写的内容优先保留）：\n${JSON.stringify(currentCard).slice(0, 2000)}`
    : '';
  const system = `${CARD_DRAFT_SYSTEM_PROMPT}\n\n已确认的记忆：\n${memoryContext}${currentContext}`;
  const messages = [{ role: 'user', content: '请基于这些记忆，为我的 Card 起草一份更新建议。' }];

  let raw;
  try {
    raw = await provider.complete({ system, messages });
  } catch (error) {
    return typedError('provider_unavailable', 'the model is temporarily unavailable');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return typedError('invalid_model_output', 'model output failed schema validation');
  }

  const { draft, error } = validateCardDraft(parsed);
  if (error) return typedError('invalid_model_output', `card draft rejected: ${error}`);
  return ok({ draft, keptFields: Array.isArray(parsed.keptFields) ? parsed.keptFields : [] });
}

module.exports = { runOwnerAgent, extractMemoryProposal, runCardDraft, OWNER_SYSTEM_PROMPT };
