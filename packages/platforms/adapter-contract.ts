export type AdapterKind = 'model' | 'storage' | 'knowledge' | 'theme' | 'share' | 'importer' | 'exporter';
export type AdapterPermission = 'network' | 'read_public_card' | 'read_owner_data' | 'write_owner_data' | 'store_credentials';

export interface AdapterManifest {
  id: string;
  version: string;
  kind: AdapterKind;
  capabilities: string[];
  permissions: AdapterPermission[];
  /**
   * Optional explicit input-permission binding for adapters with more than one
   * data permission. Ambient permissions such as `network` and
   * `store_credentials` must never be usable to relabel owner/public input.
   */
  capabilityPermissions?: Record<string, AdapterPermission>;
}

const DATA_PERMISSIONS: AdapterPermission[] = ['read_public_card', 'read_owner_data', 'write_owner_data'];

function coreCapabilityPermission(capability: string): AdapterPermission | null {
  // These are host-owned semantic capabilities, not adapter-selected labels.
  // Their input is always a public Card projection even if the adapter also
  // declares ambient network access or tries to bind them differently.
  if (/(?:^|_)public_card(?:$|_)/.test(capability) || /^(?:share|render|export)_card$/.test(capability)) {
    return 'read_public_card';
  }
  return null;
}

export function requiredPermissionForCapability(
  manifest: AdapterManifest,
  capability: string,
): AdapterPermission | null {
  const coreRequired = coreCapabilityPermission(capability);
  if (coreRequired) return manifest.permissions.includes(coreRequired) ? coreRequired : null;
  const explicit = manifest.capabilityPermissions?.[capability];
  if (explicit) return explicit;
  const dataPermissions = manifest.permissions.filter(permission => DATA_PERMISSIONS.includes(permission));
  if (dataPermissions.length === 1) return dataPermissions[0]!;
  if (dataPermissions.length > 1) return null;
  // A capability with no data access may be an outbound provider operation.
  return manifest.permissions.includes('network') ? 'network' : null;
}

export function validateAdapterManifest(manifest: unknown): { ok: true; value: AdapterManifest } | { ok: false; error: string } {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return { ok: false, error: 'manifest must be an object' };
  const value = manifest as Partial<AdapterManifest>;
  if (!value.id || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(value.id)) return { ok: false, error: 'invalid adapter id' };
  if (!value.version || typeof value.version !== 'string') return { ok: false, error: 'version is required' };
  const kinds: AdapterKind[] = ['model', 'storage', 'knowledge', 'theme', 'share', 'importer', 'exporter'];
  if (!kinds.includes(value.kind as AdapterKind)) return { ok: false, error: 'invalid adapter kind' };
  if (!Array.isArray(value.capabilities) || value.capabilities.some(item => typeof item !== 'string')) return { ok: false, error: 'capabilities must be strings' };
  if (!Array.isArray(value.permissions) || value.permissions.some(item => !['network', 'read_public_card', 'read_owner_data', 'write_owner_data', 'store_credentials'].includes(item))) return { ok: false, error: 'invalid permission' };
  if (value.permissions.includes('read_owner_data') && value.permissions.includes('read_public_card') === false && value.kind === 'share') return { ok: false, error: 'share adapters may not request owner data without public projection permission' };
  if (value.capabilityPermissions !== undefined && (!value.capabilityPermissions || typeof value.capabilityPermissions !== 'object' || Array.isArray(value.capabilityPermissions))) return { ok: false, error: 'capabilityPermissions must be an object' };
  const bindings = { ...(value.capabilityPermissions ?? {}) } as Record<string, AdapterPermission>;
  for (const [capability, permission] of Object.entries(bindings)) {
    if (!value.capabilities.includes(capability)) return { ok: false, error: `binding for undeclared capability: ${capability}` };
    if (!value.permissions.includes(permission)) return { ok: false, error: `binding uses undeclared permission: ${permission}` };
    const coreRequired = coreCapabilityPermission(capability);
    if (coreRequired && permission !== coreRequired) return { ok: false, error: `capability requires ${coreRequired}: ${capability}` };
  }
  const checked: AdapterManifest = { id: value.id, version: value.version, kind: value.kind as AdapterKind, capabilities: [...value.capabilities], permissions: [...value.permissions], ...(Object.keys(bindings).length ? { capabilityPermissions: bindings } : {}) };
  for (const capability of checked.capabilities) {
    if (!requiredPermissionForCapability(checked, capability)) return { ok: false, error: `capability requires an explicit permission binding: ${capability}` };
  }
  return { ok: true, value: checked };
}

export function removeAdapterCredentials(store: Record<string, unknown>, adapterId: string): Record<string, unknown> {
  const copy = { ...store };
  delete copy[adapterId];
  return copy;
}
