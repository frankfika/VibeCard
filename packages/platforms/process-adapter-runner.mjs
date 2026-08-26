import { createWriteStream } from 'node:fs';
import { pathToFileURL } from 'node:url';

const protocol = createWriteStream(null, { fd: 3, autoClose: false });

function reply(message) {
  protocol.end(JSON.stringify({ protocolVersion: 1, ...message }));
}

async function readInput(maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('input_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

try {
  const inputLimit = Number(process.argv[2]);
  if (!Number.isSafeInteger(inputLimit) || inputLimit <= 0) throw new Error('invalid_input_limit');
  const request = await readInput(inputLimit);
  if (request.protocolVersion !== 1 || !request.manifest || !request.invocation) {
    throw new Error('invalid_protocol');
  }
  const loaded = await import(pathToFileURL(request.modulePath).href);
  const adapter = loaded[request.exportName];
  if (!adapter || typeof adapter.run !== 'function') throw new Error('invalid_adapter_export');
  if (JSON.stringify(adapter.manifest) !== JSON.stringify(request.manifest)) {
    throw new Error('manifest_mismatch');
  }
  const controller = new AbortController();
  process.once('SIGTERM', () => controller.abort());
  const value = await adapter.run(request.invocation, {
    signal: controller.signal,
    getCredential() {
      if (controller.signal.aborted) throw new Error('adapter_aborted');
      return request.hasCredential === true ? request.credential : undefined;
    },
  });
  if (value === undefined) throw new Error('undefined_adapter_output');
  reply({ ok: true, value });
} catch {
  // Raw adapter errors and stacks never cross the process boundary.
  reply({ ok: false });
}
