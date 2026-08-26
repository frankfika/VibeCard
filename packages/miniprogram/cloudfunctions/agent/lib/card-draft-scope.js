/** Defense-in-depth for first-run public Card drafts. */
function normalizeMemoryIds(rawMemoryIds) {
  return Array.isArray(rawMemoryIds)
    ? [...new Set(rawMemoryIds.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))].slice(0, 10)
    : [];
}

function filterPublicCardDraftMemories(memories, rawMemoryIds) {
  const allowed = new Set(normalizeMemoryIds(rawMemoryIds));
  return (memories || []).filter(memory => memory
    && memory.status === 'confirmed'
    && memory.visibility === 'public'
    && allowed.has(memory._id || memory.id));
}

module.exports = { normalizeMemoryIds, filterPublicCardDraftMemories };
