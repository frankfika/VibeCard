import { PinataSDK } from 'pinata-web3';

const PINATA_JWT = import.meta.env?.VITE_PINATA_JWT || '';
const PINATA_GATEWAY = import.meta.env?.VITE_PINATA_GATEWAY || 'gateway.pinata.cloud';
const MOCK_IPFS = import.meta.env?.VITE_MOCK_IPFS === 'true';

const MOCK_STORAGE_KEY = 'vibecard_mock_ipfs';

let pinataClient: PinataSDK | null = null;

function getPinataClient(): PinataSDK {
  if (!pinataClient) {
    if (!PINATA_JWT || PINATA_JWT === 'your_pinata_jwt_here') {
      throw new Error('Pinata JWT 未配置。请在 .env 中设置 VITE_PINATA_JWT，或设置 VITE_MOCK_IPFS=true 使用本地 Mock 模式。');
    }
    pinataClient = new PinataSDK({
      pinataJwt: PINATA_JWT,
      pinataGateway: PINATA_GATEWAY,
    });
  }
  return pinataClient;
}

function getMockStorage(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MOCK_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function setMockStorage(store: Record<string, string>) {
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(store));
}

async function mockCid(content: ChainContent): Promise<string> {
  const json = JSON.stringify(content);
  const hash = await computeContentHash(json);
  return `mock-${hash.slice(2, 24)}`;
}

export interface ChainContent {
  version: string;
  app: string;
  type: 'profile' | 'activity' | 'game';
  data: unknown;
  timestamp: number;
}

export async function uploadToIPFS(content: ChainContent): Promise<string> {
  if (MOCK_IPFS) {
    const cid = await mockCid(content);
    const store = getMockStorage();
    store[cid] = JSON.stringify(content);
    setMockStorage(store);
    return cid;
  }

  const client = getPinataClient();
  const blob = new Blob([JSON.stringify(content)], { type: 'application/json' });
  const file = new File([blob], `vibecard-${content.type}-${content.timestamp}.json`, {
    type: 'application/json',
  });
  const result = await client.upload.file(file);
  if (!result.IpfsHash) {
    throw new Error('Pinata 上传未返回 IPFS 哈希');
  }
  return result.IpfsHash;
}

export async function fetchFromIPFS(ipfsHash: string): Promise<ChainContent | null> {
  if (MOCK_IPFS || ipfsHash.startsWith('mock-')) {
    const store = getMockStorage();
    const raw = store[ipfsHash];
    if (raw) {
      try {
        return JSON.parse(raw) as ChainContent;
      } catch {
        return null;
      }
    }
    if (ipfsHash.startsWith('mock-')) {
      return null;
    }
  }

  const gateways = [
    `https://${PINATA_GATEWAY}/ipfs/${ipfsHash}`,
    `https://ipfs.io/ipfs/${ipfsHash}`,
    `https://gateway.ipfs.io/ipfs/${ipfsHash}`,
  ];

  for (const url of gateways) {
    try {
      const signal =
        typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
          ? AbortSignal.timeout(8000)
          : undefined;
      const response = await fetch(url, { signal });
      if (response.ok) {
        const data = await response.json();
        return data as ChainContent;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function getIPFSUrl(ipfsHash: string): string {
  if (ipfsHash.startsWith('mock-')) {
    return '#';
  }
  return `https://${PINATA_GATEWAY}/ipfs/${ipfsHash}`;
}

export async function computeContentHash(content: string): Promise<`0x${string}`> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex as `0x${string}`;
}
