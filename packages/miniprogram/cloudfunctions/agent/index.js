/**
 * agent cloud function (task 1.2) — provider-independent AI boundary.
 *
 * Actions:
 *   ownerMessage           { messages: [{role, content}] } -> OwnerAgentResult
 *   extractMemoryProposal  { messages } -> { proposal | null }
 *
 * The provider secret lives only in cloud env vars; clients always receive
 * either a schema-validated result or a typed error, never raw model output.
 */

const cloud = require('wx-server-sdk');
const { getProvider } = require('./lib/providers');
const { runOwnerAgent, extractMemoryProposal } = require('./lib/agent');
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
