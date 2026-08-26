import assert from 'node:assert/strict';
import { AdapterRuntime, type Adapter, type AdapterInvocation } from './adapter-runtime.ts';
import { validateAdapterManifest, type AdapterPermission } from './adapter-contract.ts';

export interface AdapterConformanceCase<TInput, TOutput> {
  adapter: Adapter<TInput, TOutput>;
  invocation: AdapterInvocation<TInput>;
  assertOutput(output: TOutput): void | Promise<void>;
}

/** Reusable contribution suite shared by every reviewed reference adapter. */
export async function runAdapterConformance<TInput, TOutput>(subject: AdapterConformanceCase<TInput, TOutput>): Promise<void> {
  assert.equal(validateAdapterManifest(subject.adapter.manifest).ok, true, 'manifest must be valid');
  const runtime = new AdapterRuntime();
  let runs = 0;
  const wrapped: Adapter<TInput, TOutput> = {
    manifest: subject.adapter.manifest,
    run: async (...args) => {
      runs += 1;
      return subject.adapter.run(...args);
    },
  };
  runtime.register(wrapped);
  const id = subject.adapter.manifest.id;
  await assert.rejects(runtime.invoke(id, subject.invocation), /adapter_disabled/);
  runtime.enable(id);
  await assert.rejects(runtime.invoke(id, {
    ...subject.invocation,
    capability: '__undeclared_conformance_capability__',
  }), /unsupported_capability/);
  const wrongPermission = differentPermission(subject.invocation.permission);
  await assert.rejects(runtime.invoke(id, { ...subject.invocation, permission: wrongPermission }), /permission_denied/);
  assert.equal(runs, 0, 'invalid calls must be rejected before adapter code runs');
  const output = await runtime.invoke<TInput, TOutput>(id, subject.invocation);
  await subject.assertOutput(output);
  runtime.disable(id);
  assert.equal(runtime.isEnabled(id), false);
  await assert.rejects(runtime.invoke(id, subject.invocation), /adapter_disabled/);
  runtime.remove(id);
  await assert.rejects(runtime.invoke(id, subject.invocation), /adapter_not_found/);
}

function differentPermission(permission: AdapterPermission): AdapterPermission {
  return permission === 'read_public_card' ? 'read_owner_data' : 'read_public_card';
}
