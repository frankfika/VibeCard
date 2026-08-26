import { noteKnowledgeAdapter, type KnowledgeIngestInput, type KnowledgeIngestionResult } from '../shared/knowledge.ts';
import type { Adapter } from './adapter-runtime.ts';

export interface ReferenceNoteInput extends KnowledgeIngestInput {
  now: number;
  sourceId: string;
  chunkIdPrefix: string;
}

/**
 * Reference knowledge integration. The host supplies text and stable ids;
 * this reviewed adapter performs deterministic Core ingestion and never reads
 * a file, URL, environment variable, or credential itself.
 */
export const referenceNoteKnowledgeAdapter: Adapter<ReferenceNoteInput, KnowledgeIngestionResult> = {
  manifest: {
    id: 'reference.note-knowledge',
    version: '1.0.0',
    kind: 'knowledge',
    capabilities: ['ingest_note'],
    permissions: ['read_owner_data'],
  },
  async run({ input }) {
    if (!isReferenceNoteInput(input)) throw new Error('invalid_input');
    return noteKnowledgeAdapter.ingest(input, input.now, {
      sourceId: input.sourceId,
      chunkId: index => `${input.chunkIdPrefix}-${index}`,
    });
  },
};

function isReferenceNoteInput(input: unknown): input is ReferenceNoteInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const value = input as Partial<ReferenceNoteInput>;
  const nonEmpty = (item: unknown): item is string => typeof item === 'string' && item.trim().length > 0;
  if (![value.ownerId, value.title, value.locator, value.content, value.sourceId, value.chunkIdPrefix].every(nonEmpty)) return false;
  if (!Number.isFinite(value.now) || (value.now as number) < 0) return false;
  if (value.visibility !== undefined && !['public', 'agent_only', 'connected', 'private'].includes(value.visibility)) return false;
  if (value.maxCharsPerChunk !== undefined && (!Number.isSafeInteger(value.maxCharsPerChunk) || value.maxCharsPerChunk <= 0)) return false;
  return true;
}
