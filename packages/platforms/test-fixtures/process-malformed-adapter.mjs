import { writeSync } from 'node:fs';

export default {
  manifest: {
    id: 'fixture.process-malformed',
    version: '1.0.0',
    kind: 'knowledge',
    capabilities: ['corrupt'],
    permissions: ['read_owner_data'],
  },
  async run() {
    writeSync(3, Buffer.from('not-json'));
    process.exit(17);
  },
};
