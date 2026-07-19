/**
 * agent cloud function — provider-independent AI boundary.
 *
 * Actions:
 *   ownerMessage           { messages: [{role, content}] } -> OwnerAgentResult
 *   extractMemoryProposal  { messages } -> { proposal | null }
 *   generateCardDraft      { currentCard? } -> { draft, keptFields }
 *   visitorMessage         { ownerId, messages, roundCount? } -> VisitorAgentResult (task 2.2)
 *   summarizeConnection    { requestId } -> { summary } (task 2.4, owner-only)
 *
 * The provider secret lives only in cloud env vars; clients always receive
 * either a schema-validated result or a typed error, never raw model output.
 *
 * Visitor mode reads memories with visibility filters in the `where` clause:
 * public memories are quotable evidence, agent_only memories may only steer
 * the agent's judgment. connected / private memories are never read here.
 */

const cloud = require('wx-server-sdk');
const { getProvider } = require('./lib/providers');
const { runOwnerAgent, extractMemoryProposal, runCardDraft, runVisitorAgent, runConnectionSummary } = require('./lib/agent');
const { typedError } = require('./lib/schema');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { action } = event || {};
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) return typedError('unauthorized', 'login required');

  const provider = getProvider();

  try {
    switch (action) {
      case 'ownerMessage': {
        const memories = await listConfirmedMemories(openid);
        return await runOwnerAgent({ provider, memories, messages: event.messages });
      }
      case 'extractMemoryProposal': {
        const memories = await listConfirmedMemories(openid);
        return await extractMemoryProposal({ provider, memories, messages: event.messages });
      }
      case 'generateCardDraft': {
        const memories = await listConfirmedMemories(openid);
        return await runCardDraft({ provider, memories, currentCard: event.currentCard });
      }
      case 'visitorMessage': {
        const { ownerId, messages, roundCount } = event;
        if (typeof ownerId !== 'string' || !ownerId.trim()) {
          return typedError('invalid_request', 'ownerId is required');
        }
        const owner = await getUserByOpenid(ownerId);
        if (!owner) return typedError('not_found', 'owner not found');
        // Permission filtering at query stage: only public + agent_only,
        // confirmed memories are ever read for a visitor conversation.
        const [publicMemories, agentMemories] = await Promise.all([
          listMemoriesWithVisibility(ownerId, 'public'),
          listMemoriesWithVisibility(ownerId, 'agent_only'),
        ]);
        const card = buildVisitorCardContext(owner, publicMemories);
        return await runVisitorAgent({
          provider,
          card,
          publicMemories,
          agentMemories,
          messages,
          roundCount: typeof roundCount === 'number' ? roundCount : 0,
        });
      }
      case 'summarizeConnection': {
        const { requestId } = event;
        if (typeof requestId !== 'string' || !requestId.trim()) {
          return typedError('invalid_request', 'requestId is required');
        }
        const requestResult = await db.collection('requests').doc(requestId).get().catch(() => null);
        const request = requestResult && requestResult.data;
        if (!request || request.ownerId !== openid) return typedError('not_found', 'request not found');
        const conversationExcerpt = await loadConversationExcerpt(request);
        return await runConnectionSummary({ provider, request, conversationExcerpt });
      }
      default:
        return typedError('invalid_action', 'unknown action');
    }
  } catch (error) {
    // Provider/network failures surface as a typed error; details stay server-side.
    console.error('agent function error:', error && error.message);
    return typedError('provider_unavailable', 'the model is temporarily unavailable');
  }
};

async function listConfirmedMemories(openid) {
  const result = await db.collection('memories').where({ ownerId: openid, status: 'confirmed' }).get();
  return result.data;
}

async function listMemoriesWithVisibility(ownerId, visibility) {
  const result = await db.collection('memories')
    .where({ ownerId, status: 'confirmed', visibility })
    .get();
  return result.data;
}

async function getUserByOpenid(openid) {
  const result = await db.collection('users').where({ openid }).get();
  return result.data[0] || null;
}

/**
 * Minimal public Card context for visitor grounding. Only known-safe fields
 * are read — contact-bearing namecard fields are never touched here.
 */
function buildVisitorCardContext(user, publicMemories) {
  const sorted = [...publicMemories].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const byKind = kind => sorted.filter(m => m.kind === kind).map(m => m.content);
  const interests = user.namecard && Array.isArray(user.namecard.interests) ? user.namecard.interests : [];
  return {
    name: user.nickname || '',
    headline: (user.namecard && user.namecard.motto) || user.bio || '',
    currentFocus: byKind('current')[0] || '',
    canHelpWith: byKind('fact').slice(0, 5),
    wantsToMeet: byKind('preference').slice(0, 5),
    topics: interests.filter(s => typeof s === 'string' && s.trim()).slice(0, 8),
  };
}

/** Latest visitor-conversation excerpt as summary evidence, if linked. */
async function loadConversationExcerpt(request) {
  if (!request.conversationId) return '';
  const result = await db.collection('conversations').doc(request.conversationId).get().catch(() => null);
  const conversation = result && result.data;
  if (!conversation || !Array.isArray(conversation.messages)) return '';
  return conversation.messages
    .slice(-8)
    .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 200) : ''}`)
    .join('\n');
}
