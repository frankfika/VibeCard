export default {
  manifest: {
    id: 'fixture.process-slow',
    version: '2.0.0',
    kind: 'knowledge',
    capabilities: ['wait'],
    permissions: ['read_owner_data'],
  },
  async run() {
    return 'replacement-result';
  },
};
