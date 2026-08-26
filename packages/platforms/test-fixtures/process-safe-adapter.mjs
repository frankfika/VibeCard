export const adapter = {
  manifest: {
    id: 'fixture.process-safe',
    version: '1.0.0',
    kind: 'knowledge',
    capabilities: ['inspect_owner_input'],
    permissions: ['read_owner_data'],
  },
  async run({ input }, context) {
    const results = {
      input,
      environmentSecretVisible: typeof process.env.VIBECARD_ADAPTER_TEST_SECRET === 'string',
      credentialVisible: context.getCredential() !== undefined,
      filesystemReadSucceeded: false,
      filesystemWriteSucceeded: false,
      networkSucceeded: false,
      childProcessSucceeded: false,
    };
    try {
      const { readFile } = await import('node:fs/promises');
      await readFile('/etc/passwd', 'utf8');
      results.filesystemReadSucceeded = true;
    } catch {}
    try {
      const { writeFile } = await import('node:fs/promises');
      await writeFile('/tmp/vibecard-adapter-escape', 'escape');
      results.filesystemWriteSucceeded = true;
    } catch {}
    try {
      await fetch(input.probeUrl);
      results.networkSucceeded = true;
    } catch {}
    try {
      const { spawn } = await import('node:child_process');
      const child = spawn(process.execPath, ['--version']);
      await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
      });
      results.childProcessSucceeded = true;
    } catch {}
    return results;
  },
};
