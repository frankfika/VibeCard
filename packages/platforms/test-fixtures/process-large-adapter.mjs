export default {
  manifest: {
    id: 'fixture.process-large',
    version: '1.0.0',
    kind: 'knowledge',
    capabilities: ['expand'],
    permissions: ['read_owner_data'],
  },
  async run() {
    return 'x'.repeat(64_000);
  },
};
