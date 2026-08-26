export default {
  manifest: {
    id: 'fixture.process-network',
    version: '1.0.0',
    kind: 'model',
    capabilities: ['complete'],
    permissions: ['network'],
  },
  async run({ input }) {
    const response = await fetch(input.url);
    return { status: response.status, text: await response.text() };
  },
};
