import { CONTRACT_ADDRESS, CONTRACT_ABI, chainNames } from './config';

function getRpcUrl(chainId: number): string {
  const alchemyKey = import.meta.env?.VITE_ALCHEMY_KEY as string | undefined;
  const urls: Record<number, string> = {
    1: alchemyKey
      ? `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`
      : 'https://ethereum.publicnode.com',
    8453: alchemyKey
      ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
      : 'https://mainnet.base.org',
    42161: alchemyKey
      ? `https://arb-mainnet.g.alchemy.com/v2/${alchemyKey}`
      : 'https://arb1.arbitrum.io/rpc',
    137: alchemyKey
      ? `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`
      : 'https://polygon-rpc.com',
    11155111: alchemyKey
      ? `https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`
      : 'https://rpc.sepolia.org',
    84532: alchemyKey
      ? `https://base-sepolia.g.alchemy.com/v2/${alchemyKey}`
      : 'https://sepolia.base.org',
    421614: alchemyKey
      ? `https://arb-sepolia.g.alchemy.com/v2/${alchemyKey}`
      : 'https://sepolia-rollup.arbitrum.io/rpc',
    80002: alchemyKey
      ? `https://polygon-amoy.g.alchemy.com/v2/${alchemyKey}`
      : 'https://rpc-amoy.polygon.technology',
    31337: 'http://127.0.0.1:8545',
  };
  return urls[chainId] || '';
}

function isChainConfigured(chainId: number, contractAddr?: string): boolean {
  if (!contractAddr) return false;
  if (contractAddr === '0x0000000000000000000000000000000000000000') return false;
  return !!getRpcUrl(chainId);
}

function encodeGetLatestProfile(address: string): string {
  const methodId = '0x9bd2c0e7';
  const paddedAddress = address.toLowerCase().replace('0x', '').padStart(64, '0');
  return methodId + paddedAddress;
}

function decodeStringResult(hex: string): string | null {
  try {
    if (hex === '0x' || hex.length < 130) return null;
    const offsetBytes = parseInt(hex.slice(2, 66), 16);
    const lengthBytes = parseInt(hex.slice(66, 130), 16);
    const dataStartHex = 2 + (offsetBytes + 32) * 2;
    const dataLengthHex = lengthBytes * 2;
    if (dataStartHex + dataLengthHex > hex.length) return null;
    const strHex = hex.slice(dataStartHex, dataStartHex + dataLengthHex);
    if (!strHex) return null;
    const bytes = [];
    for (let i = 0; i < strHex.length; i += 2) {
      bytes.push(parseInt(strHex.slice(i, i + 2), 16));
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

export interface ChainProfileResult {
  ok: boolean;
  ipfsHash?: string;
  error?: string;
}

export async function fetchLatestProfileHashFromChain(
  address: string,
  chainId: number
): Promise<ChainProfileResult> {
  const contractAddr = CONTRACT_ADDRESS[chainId];
  if (!isChainConfigured(chainId, contractAddr)) {
    return {
      ok: false,
      error: `${chainNames[chainId] ?? `Chain ${chainId}`} 尚未部署合约`,
    };
  }
  const rpcUrl = getRpcUrl(chainId);
  if (!rpcUrl) {
    return { ok: false, error: '没有可用的 RPC 节点' };
  }

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [
          {
            to: contractAddr,
            data: encodeGetLatestProfile(address),
          },
          'latest',
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC HTTP error: ${response.status}`);
    }

    const result = await response.json();
    if (result.error) {
      throw new Error(`RPC error: ${result.error.message || JSON.stringify(result.error)}`);
    }

    if (result.result && result.result !== '0x') {
      const ipfsHash = decodeStringResult(result.result);
      if (ipfsHash) return { ok: true, ipfsHash };
    }
    return { ok: false, error: '链上暂无该地址的名片数据' };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export { CONTRACT_ABI, CONTRACT_ADDRESS, chainNames, getRpcUrl };
export type { ChainContent } from './ipfs';
