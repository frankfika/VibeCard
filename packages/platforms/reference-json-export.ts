import type { VibeCard } from '../shared/index.ts';
import type { Adapter } from './adapter-runtime.ts';

/** Reference adapter: exports only the already-sanitized public Card input. */
export const jsonPublicCardExporter: Adapter<VibeCard, string> = {
  manifest: {
    id: 'reference.public-card-json',
    version: '1.0.0',
    kind: 'exporter',
    capabilities: ['export_public_card'],
    permissions: ['read_public_card'],
  },
  async run({ input }) {
    return JSON.stringify(input);
  },
};
