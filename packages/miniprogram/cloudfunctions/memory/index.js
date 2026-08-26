/**
 * memory cloud function (task 1.1).
 *
 * Data layer for the VibeCard 2.0 `memories` and `conversations` collections.
 *
 * Actions:
 *   listMemories          owner-only; optional { status, visibility, retrievableOnly }
 *   createMemoryProposal  owner-only; creates status='proposed' memory
 *   confirmMemory         owner-only; proposed -> confirmed (optional content/visibility override)
 *   editMemory            owner-only; edit kind/content/visibility
 *   deleteMemory          owner-only; soft delete (status='deleted')
 *   appendMessage         owner-scoped conversation persistence used by owner/visitor chat
 *   getConversation       owner-scoped conversation read
 *
 * Every action is scoped to the caller's OPENID: a memory can only be read
 * or mutated by its owner.
 */

const cloud = require('wx-server-sdk');
const core = require('./lib/core');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { action } = event || {};
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) throw new Error('unauthorized');

  switch (action) {
    case 'listMemories':
      return listMemories(openid, event);
    case 'createMemoryProposal':
      return createMemoryProposal(openid, event);
    case 'confirmMemory':
      return confirmMemory(openid, event);
    case 'editMemory':
      return editMemory(openid, event);
    case 'deleteMemory':
      return deleteMemory(openid, event);
    case 'appendMessage':
      return appendMessage(openid, event);
    case 'getConversation':
      return getConversation(openid, event);
    default:
      throw new Error('invalid_action');
  }
};

async function getOwnedMemory(memoryId, openid) {
  if (!memoryId) throw new Error('memory_id_required');
  const result = await db.collection('memories').doc(memoryId).get().catch(() => null);
  const memory = result && result.data;
  if (!memory || !core.isOwner(memory, openid)) throw new Error('not_found');
  return { _id: memoryId, ...memory };
}

async function listMemories(openid, event) {
  const { status, visibility, retrievableOnly } = event;
  if (status && !core.MEMORY_STATUSES.includes(status)) throw new Error('invalid_status');
  if (visibility && !core.MEMORY_VISIBILITIES.includes(visibility)) throw new Error('invalid_visibility');

  const where = { ownerId: openid };
  if (status) where.status = status;
  if (visibility) where.visibility = visibility;

  const result = await db.collection('memories').where(where).orderBy('updatedAt', 'desc').get();
  let memories = result.data.map(m => ({ _id: m._id, ...m }));
  if (retrievableOnly) memories = memories.filter(core.isRetrievable);
  return { memories };
}

async function createMemoryProposal(openid, event) {
  const payload = {
    kind: event.kind,
    content: event.content,
    visibility: event.visibility || 'private',
  };
  const invalid = core.validateMemoryPayload(payload);
  if (invalid) throw new Error(invalid);

  // Optional stable source key for cross-function retries (task 2.6). A
  // rejected/deleted proposal also counts as handled and must not be recreated.
  const idempotencyKey = typeof event.idempotencyKey === 'string' && event.idempotencyKey.trim()
    ? event.idempotencyKey.trim().slice(0, 200)
    : '';
  if (idempotencyKey) {
    const deterministicId = `decision-${idempotencyKey.slice(idempotencyKey.lastIndexOf(':') + 1)}`;
    const existing = await db.collection('memories').doc(deterministicId).get().catch(() => null);
    if (existing && existing.data) {
      return { memory: { _id: deterministicId, ...existing.data }, deduplicated: true };
    }
  }

  const now = Date.now();
  const memory = core.buildMemory({
    ownerId: openid,
    kind: payload.kind,
    content: payload.content,
    visibility: payload.visibility,
    sourceConversationId: idempotencyKey || event.sourceConversationId || '',
    sourceMessageIds: event.sourceMessageIds || [],
  }, now);

  if (idempotencyKey) {
    // Deterministic document id makes concurrent retries converge on one
    // record. Both writes are byte-equivalent proposed records.
    const deterministicId = `decision-${idempotencyKey.slice(idempotencyKey.lastIndexOf(':') + 1)}`;
    await db.collection('memories').doc(deterministicId).set({ data: memory });
    return { memory: { _id: deterministicId, ...memory }, deduplicated: false };
  }
  const result = await db.collection('memories').add({ data: memory });
  return { memory: { _id: result._id, ...memory }, deduplicated: false };
}

async function confirmMemory(openid, event) {
  const memory = await getOwnedMemory(event.memoryId, openid);
  const override = { content: event.content, visibility: event.visibility };
  if (event.content !== undefined || event.visibility !== undefined) {
    const invalid = core.validateMemoryPayload(
      { kind: memory.kind, content: event.content ?? memory.content, visibility: event.visibility ?? memory.visibility },
    );
    if (invalid) throw new Error(invalid);
  }
  const updated = core.applyConfirm(memory, override, Date.now());
  await db.collection('memories').doc(event.memoryId).update({
    data: { content: updated.content, visibility: updated.visibility, status: updated.status, updatedAt: updated.updatedAt },
  });
  return { memory: updated };
}

async function editMemory(openid, event) {
  const memory = await getOwnedMemory(event.memoryId, openid);
  const patch = { kind: event.kind, content: event.content, visibility: event.visibility };
  const invalid = core.validateMemoryPayload(
    { kind: patch.kind ?? memory.kind, content: patch.content ?? memory.content, visibility: patch.visibility ?? memory.visibility },
  );
  if (invalid) throw new Error(invalid);

  const updated = core.applyEdit(memory, patch, Date.now());
  await db.collection('memories').doc(event.memoryId).update({
    data: { kind: updated.kind, content: updated.content, visibility: updated.visibility, updatedAt: updated.updatedAt },
  });
  return { memory: updated };
}

async function deleteMemory(openid, event) {
  const memory = await getOwnedMemory(event.memoryId, openid);
  const updated = core.applyDelete(memory, Date.now());
  await db.collection('memories').doc(event.memoryId).update({
    data: { status: updated.status, updatedAt: updated.updatedAt },
  });
  return { memory: updated };
}

async function appendMessage(openid, event) {
  const { conversationId, mode = 'owner', role, content, participantId } = event;
  if (!core.CONVERSATION_MODES.includes(mode)) throw new Error('invalid_mode');
  if (!['owner', 'vibe', 'visitor'].includes(role)) throw new Error('invalid_role');
  if (typeof content !== 'string' || !content.trim()) throw new Error('invalid_content');

  const now = Date.now();
  const message = { id: core.nextId('msg'), role, content: content.trim(), createdAt: now };

  if (conversationId) {
    const result = await db.collection('conversations').doc(conversationId).get().catch(() => null);
    const conversation = result && result.data;
    if (!conversation || conversation.ownerId !== openid) throw new Error('not_found');
    await db.collection('conversations').doc(conversationId).update({
      data: {
        messages: db.command.push(message),
        updatedAt: now,
      },
    });
    return { conversationId, message };
  }

  const conversation = {
    ownerId: openid,
    mode,
    participantId: participantId || '',
    messages: [message],
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection('conversations').add({ data: conversation });
  return { conversationId: result._id, message };
}

async function getConversation(openid, event) {
  const { conversationId } = event;
  if (!conversationId) throw new Error('conversation_id_required');
  const result = await db.collection('conversations').doc(conversationId).get().catch(() => null);
  const conversation = result && result.data;
  if (!conversation || conversation.ownerId !== openid) throw new Error('not_found');
  return { conversation: { _id: conversationId, ...conversation } };
}
