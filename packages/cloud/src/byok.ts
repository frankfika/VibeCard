import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import {
  ModelProviderError,
  TEXT_STRUCTURED_CAPABILITIES,
  type CompletionInput,
  type ModelProvider,
} from '../../shared/index.ts';

const METADATA_NAMES = new Set([
  'metadata.google.internal',
  'metadata.aws.internal',
  'instance-data.ec2.internal',
]);

function ipv4Number(value: string): number {
  return value.split('.').reduce((result, octet) => (result << 8) + Number(octet), 0) >>> 0;
}

function inV4Range(value: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4Number(value) & mask) === (ipv4Number(base) & mask);
}

/** Parse every legal compressed/expanded IPv6 spelling into eight 16-bit words. */
function ipv6Words(input: string): number[] | null {
  let value = input.toLowerCase().replace(/^\[|\]$/g, '').split('%', 1)[0]!;
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    if (lastColon < 0) return null;
    const dotted = value.slice(lastColon + 1);
    if (isIP(dotted) !== 4) return null;
    const numeric = ipv4Number(dotted);
    value = `${value.slice(0, lastColon)}:${((numeric >>> 16) & 0xffff).toString(16)}:${(numeric & 0xffff).toString(16)}`;
  }
  if ((value.match(/::/g) ?? []).length > 1) return null;
  const compressed = value.includes('::');
  const [leftRaw, rightRaw = ''] = value.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  if ([...left, ...right].some(word => !/^[0-9a-f]{1,4}$/.test(word))) return null;
  const missing = 8 - left.length - right.length;
  if ((compressed && missing < 1) || (!compressed && missing !== 0)) return null;
  return [...left, ...new Array(compressed ? missing : 0).fill('0'), ...right].map(word => Number.parseInt(word, 16));
}

function embeddedIpv4(words: number[]): string {
  const value = ((words[6]! << 16) | words[7]!) >>> 0;
  return `${value >>> 24}.${(value >>> 16) & 255}.${(value >>> 8) & 255}.${value & 255}`;
}

/** Reject every non-global address class, including cloud metadata ranges. */
export function isPublicProviderAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return ![
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
      ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
      ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
      ['192.88.99.0', 24], ['198.51.100.0', 24], ['203.0.113.0', 24],
      ['224.0.0.0', 4], ['240.0.0.0', 4],
    ].some(([base, bits]) => inV4Range(address, base as string, bits as number));
  }
  if (family === 6) {
    const words = ipv6Words(address);
    if (!words) return false;
    const leadingSixZero = words.slice(0, 6).every(word => word === 0);
    const mapped = words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff;
    // IPv4-mapped (::ffff:a.b.c.d) and deprecated compatible (::a.b.c.d)
    // forms are classified by their final 32 bits, independent of spelling.
    if (mapped || leadingSixZero) return isPublicProviderAddress(embeddedIpv4(words));
    const first = words[0]!; const second = words[1]!;
    const nat64 = first === 0x0064 && second === 0xff9b;
    const discardOnly = first === 0x0100 && words.slice(1, 4).every(word => word === 0);
    const protocolAssignments = first === 0x2001 && (second & 0xfe00) === 0;
    return (first & 0xfe00) !== 0xfc00 // unique-local fc00::/7
      && (first & 0xffc0) !== 0xfe80   // link-local fe80::/10
      && (first & 0xffc0) !== 0xfec0   // deprecated site-local fec0::/10
      && (first & 0xff00) !== 0xff00   // multicast
      && !nat64 && !discardOnly && !protocolAssignments
      && !(first === 0x2001 && second === 0x0db8) // documentation
      && first !== 0x2002                       // 6to4
      && !(first === 0x3fff && (second & 0xf000) === 0); // documentation
  }
  return false;
}

export type ByokLookup = (hostname: string) => Promise<Array<{ address: string; family: 4 | 6 }>>;

const defaultLookup: ByokLookup = async hostname => lookup(hostname, { all: true, verbatim: true }) as Promise<Array<{ address: string; family: 4 | 6 }>>;

export async function resolvePublicByokBase(raw: string, resolver: ByokLookup = defaultLookup): Promise<{ url: URL; addresses: Array<{ address: string; family: 4 | 6 }> }> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ModelProviderError('permission_denied', 'BYOK base must be a public HTTPS URL'); }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const literalFamily = isIP(hostname);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !hostname
      || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
      || (!literalFamily && !hostname.includes('.')) || METADATA_NAMES.has(hostname)) {
    throw new ModelProviderError('permission_denied', 'BYOK base must be a public HTTPS URL without credentials, query, or fragment');
  }
  let addresses: Array<{ address: string; family: 4 | 6 }>;
  if (literalFamily) addresses = [{ address: hostname, family: literalFamily as 4 | 6 }];
  else {
    try { addresses = await resolver(hostname); }
    catch { throw new ModelProviderError('model_unavailable', 'BYOK hostname could not be resolved'); }
  }
  if (!addresses.length || addresses.some(item => !isPublicProviderAddress(item.address))) {
    throw new ModelProviderError('permission_denied', 'BYOK hostname resolves to a private or reserved address');
  }
  addresses.sort((a, b) => a.address.localeCompare(b.address));
  return { url, addresses };
}

function endpointFor(base: URL): URL {
  const value = new URL(base.toString());
  value.pathname = `${value.pathname.replace(/\/+$/, '')}${value.pathname.replace(/\/+$/, '').endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions'}`;
  return value;
}

function readContent(payload: unknown): string {
  const choices = (payload as any)?.choices;
  const content = Array.isArray(choices) ? choices[0]?.message?.content : undefined;
  if (typeof content !== 'string') throw new ModelProviderError('invalid_model_output', 'endpoint returned an unreadable envelope');
  return content;
}

/**
 * DNS is resolved on every call and the TLS socket is pinned to that exact
 * validated address. `servername` and `Host` retain the original hostname,
 * so certificate validation still works while a DNS-rebinding answer cannot
 * redirect the actual connection to an internal address.
 */
export function createPinnedByokProvider(options: { base: string; model: string; apiKey: string; timeoutMs: number; resolver?: ByokLookup }): ModelProvider {
  return {
    name: 'byok-openai-compatible',
    capabilities: { ...TEXT_STRUCTURED_CAPABILITIES },
    async complete(input: CompletionInput): Promise<string> {
      const resolved = options.resolver
        ? await resolvePublicByokBase(options.base, options.resolver)
        : await resolvePublicByokBase(options.base);
      const endpoint = endpointFor(resolved.url);
      const pinned = resolved.addresses[0]!;
      const payload = JSON.stringify({
        model: options.model,
        messages: [...(input.system ? [{ role: 'system', content: input.system }] : []), ...input.messages],
        response_format: { type: 'json_object' },
      });
      return new Promise<string>((resolve, reject) => {
        const req = request({
          protocol: 'https:', hostname: pinned.address, family: pinned.family,
          port: endpoint.port || 443, method: 'POST', path: `${endpoint.pathname}${endpoint.search}`,
          servername: endpoint.hostname,
          headers: {
            host: endpoint.host, 'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload), authorization: `Bearer ${options.apiKey}`,
          },
          timeout: options.timeoutMs,
        }, response => {
          const chunks: Buffer[] = []; let bytes = 0;
          response.on('data', chunk => {
            bytes += chunk.length;
            if (bytes > 2 * 1024 * 1024) req.destroy(new Error('provider response too large'));
            else chunks.push(chunk);
          });
          response.on('end', () => {
            if (response.statusCode === 429) { reject(new ModelProviderError('rate_limited', 'provider rate limit reached')); return; }
            if (response.statusCode === 401 || response.statusCode === 403) { reject(new ModelProviderError('permission_denied', 'provider rejected the configured credentials')); return; }
            if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) { reject(new ModelProviderError('model_unavailable', 'the model is temporarily unavailable')); return; }
            try { resolve(readContent(JSON.parse(Buffer.concat(chunks).toString('utf8')))); }
            catch (error) { reject(error instanceof ModelProviderError ? error : new ModelProviderError('invalid_model_output', 'endpoint returned invalid JSON')); }
          });
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', error => reject(error instanceof ModelProviderError ? error : new ModelProviderError('model_unavailable', 'the model is temporarily unavailable')));
        req.end(payload);
      });
    },
  };
}
