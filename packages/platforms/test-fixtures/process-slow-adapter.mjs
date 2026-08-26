export default {
  manifest: {
    id: 'fixture.process-slow',
    version: '1.0.0',
    kind: 'knowledge',
    capabilities: ['wait'],
    permissions: ['read_owner_data'],
  },
  async run() {
    await new Promise(() => setInterval(() => {}, 1_000));
  },
};
