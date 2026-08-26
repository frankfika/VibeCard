export default {
  manifest: {
    id: 'fixture.process-public',
    version: '1.0.0',
    kind: 'exporter',
    capabilities: ['export_public_card'],
    permissions: ['read_public_card'],
  },
  async run({ input }) {
    return input;
  },
};
