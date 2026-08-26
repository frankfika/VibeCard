export default {
  manifest: {
    id: 'fixture.process-credential',
    version: '1.0.0',
    kind: 'model',
    capabilities: ['complete'],
    permissions: ['network', 'store_credentials'],
  },
  async run({ input }, context) {
    const credential = context.getCredential();
    return { input, credentialMatches: credential?.token === 'adapter-own-secret' };
  },
};
