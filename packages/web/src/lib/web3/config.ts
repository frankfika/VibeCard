import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  mainnet,
  sepolia,
  base,
  baseSepolia,
  arbitrum,
  arbitrumSepolia,
  polygon,
  polygonAmoy,
  hardhat,
} from 'wagmi/chains';
import { createConfig, http, createStorage, type Config } from 'wagmi';
import { injected } from 'wagmi/connectors';

export const supportedChains = [
  hardhat,
  sepolia,
  baseSepolia,
  arbitrumSepolia,
  polygonAmoy,
  mainnet,
  base,
  arbitrum,
  polygon,
] as const;

export const chainNames: Record<number, string> = {
  [hardhat.id]: 'Hardhat Local',
  [sepolia.id]: 'Ethereum Sepolia',
  [baseSepolia.id]: 'Base Sepolia',
  [arbitrumSepolia.id]: 'Arbitrum Sepolia',
  [polygonAmoy.id]: 'Polygon Amoy',
  [mainnet.id]: 'Ethereum',
  [base.id]: 'Base',
  [arbitrum.id]: 'Arbitrum',
  [polygon.id]: 'Polygon',
};

export const chainLogos: Record<number, string> = {
  [hardhat.id]: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg',
  [sepolia.id]: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg',
  [baseSepolia.id]: 'https://cryptologos.cc/logos/base-base-logo.svg',
  [arbitrumSepolia.id]: 'https://cryptologos.cc/logos/arbitrum-arb-logo.svg',
  [polygonAmoy.id]: 'https://cryptologos.cc/logos/polygon-matic-logo.svg',
  [mainnet.id]: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg',
  [base.id]: 'https://cryptologos.cc/logos/base-base-logo.svg',
  [arbitrum.id]: 'https://cryptologos.cc/logos/arbitrum-arb-logo.svg',
  [polygon.id]: 'https://cryptologos.cc/logos/polygon-matic-logo.svg',
};

export const walletConnectProjectId = (() => {
  const envId = import.meta.env?.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;
  const id = envId?.trim();
  if (!id || id === 'your_walletconnect_project_id_here' || id === 'vibecard_default_project_id') {
    console.warn(
      '[vibecard] VITE_WALLETCONNECT_PROJECT_ID is missing or invalid. ' +
        'WalletConnect (including email/social login) will not work reliably. ' +
        'Get a free Project ID at https://cloud.walletconnect.com/'
    );
    return '';
  }
  return id;
})();

export const isWalletConnectReady = !!walletConnectProjectId;

const chainsTuple = supportedChains as unknown as [
  typeof hardhat,
  typeof sepolia,
  typeof baseSepolia,
  typeof arbitrumSepolia,
  typeof polygonAmoy,
  typeof mainnet,
  typeof base,
  typeof arbitrum,
  typeof polygon,
];

export let wagmiConfig: Config;

if (walletConnectProjectId) {
  wagmiConfig = getDefaultConfig({
    appName: 'vibecard',
    projectId: walletConnectProjectId,
    chains: chainsTuple,
    ssr: false,
  });
} else {
  const transports = {} as Record<(typeof supportedChains)[number]['id'], ReturnType<typeof http>>;
  for (const chain of supportedChains) {
    transports[chain.id] = http();
  }
  wagmiConfig = createConfig({
    chains: chainsTuple,
    connectors: [injected()],
    transports,
    ssr: false,
    storage: createStorage({
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    }),
  });
}

export const CONTRACT_ADDRESS: Record<number, `0x${string}`> = {
  [hardhat.id]: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  [sepolia.id]: '0x0000000000000000000000000000000000000000',
  [baseSepolia.id]: '0x0000000000000000000000000000000000000000',
  [arbitrumSepolia.id]: '0x0000000000000000000000000000000000000000',
  [polygonAmoy.id]: '0x0000000000000000000000000000000000000000',
  [mainnet.id]: '0x0000000000000000000000000000000000000000',
  [base.id]: '0x0000000000000000000000000000000000000000',
  [arbitrum.id]: '0x0000000000000000000000000000000000000000',
  [polygon.id]: '0x0000000000000000000000000000000000000000',
};

export const CONTRACT_ABI = [
  {
    inputs: [
      { name: 'contentType', type: 'string' },
      { name: 'ipfsHash', type: 'string' },
      { name: 'contentHash', type: 'bytes32' },
    ],
    name: 'publish',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'contentTypes', type: 'string[]' },
      { name: 'ipfsHashes', type: 'string[]' },
      { name: 'contentHashes', type: 'bytes32[]' },
    ],
    name: 'publishBatch',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getUserEntries',
    outputs: [
      {
        components: [
          { name: 'contentType', type: 'string' },
          { name: 'ipfsHash', type: 'string' },
          { name: 'contentHash', type: 'bytes32' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'chainId', type: 'uint256' },
        ],
        name: 'entries',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'contentType', type: 'string' },
    ],
    name: 'getUserEntriesByType',
    outputs: [
      {
        components: [
          { name: 'contentType', type: 'string' },
          { name: 'ipfsHash', type: 'string' },
          { name: 'contentHash', type: 'bytes32' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'chainId', type: 'uint256' },
        ],
        name: 'entries',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getLatestProfile',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'ipfsHash', type: 'string' }],
    name: 'getEntry',
    outputs: [
      {
        components: [
          { name: 'contentType', type: 'string' },
          { name: 'ipfsHash', type: 'string' },
          { name: 'contentHash', type: 'bytes32' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'chainId', type: 'uint256' },
        ],
        name: 'entry',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'address' }, { name: '', type: 'uint256' }],
    name: 'userEntries',
    outputs: [
      { name: 'contentType', type: 'string' },
      { name: 'ipfsHash', type: 'string' },
      { name: 'contentHash', type: 'bytes32' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'chainId', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'author', type: 'address' },
      { indexed: false, name: 'contentType', type: 'string' },
      { indexed: false, name: 'ipfsHash', type: 'string' },
      { indexed: false, name: 'contentHash', type: 'bytes32' },
      { indexed: false, name: 'timestamp', type: 'uint256' },
      { indexed: false, name: 'chainId', type: 'uint256' },
    ],
    name: 'ContentPublished',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'author', type: 'address' },
      { indexed: false, name: 'ipfsHash', type: 'string' },
      { indexed: false, name: 'timestamp', type: 'uint256' },
    ],
    name: 'ProfileUpdated',
    type: 'event',
  },
] as const;
