import { PinataSDK } from 'pinata-web3';

const PINATA_JWT = (import.meta as any).env?.VITE_PINATA_JWT || '';
const PINATA_GATEWAY = (import.meta as any).env?.VITE_PINATA_GATEWAY || 'gateway.pinata.cloud';

let pinataClient: PinataSDK | null = null;

function getPinataClient(): PinataSDK {
  if (!pinataClient) {
    if (!PINATA_JWT) {
      throw new Error('Pinata JWT not configured. Set VITE_PINATA_JWT in .env');
    }
    pinataClient = new PinataSDK({
      pinataJwt: PINATA_JWT,
      pinataGateway: PINATA_GATEWAY,
    });
  }
  return pinataClient;
}

export interface ChainContent {
  version: string;
  app: string;
  type: 'profile' | 'activity' | 'game';
  data: unknown;
  timestamp: number;
}

export async function uploadToIPFS(content: ChainContent): Promise<string> {
  try {
    const client = getPinataClient();
    const blob = new Blob([JSON.stringify(content)], { type: 'application/json' });
    const file = new File([blob], `vibecard-${content.type}-${content.timestamp}.json`, {
      type: 'application/json',
    });
    const result = await client.upload.file(file);
    return result.IpfsHash;
  } catch (error) {
    console.warn('Pinata upload failed, using mock IPFS hash for development:', error);
    return `QmMock${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

export async function fetchFromIPFS(ipfsHash: string): Promise<ChainContent | null> {
  try {
    const gateways = [
      `https://${PINATA_GATEWAY}/ipfs/${ipfsHash}`,
      `https://ipfs.io/ipfs/${ipfsHash}`,
      `https://gateway.ipfs.io/ipfs/${ipfsHash}`,
    ];

    for (const url of gateways) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (response.ok) {
          const data = await response.json();
          return data as ChainContent;
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function getIPFSUrl(ipfsHash: string): string {
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
