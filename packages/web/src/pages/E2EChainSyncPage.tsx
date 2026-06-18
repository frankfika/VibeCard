import { useState } from 'react';
import {
  createWalletClient,
  createPublicClient,
  http,
  formatEther,
  encodeFunctionData,
  decodeFunctionResult,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';
import { uploadToIPFS, fetchFromIPFS, computeContentHash, type ChainContent } from '../lib/web3/ipfs';
import { CONTRACT_ADDRESS } from '../lib/web3/config';
import artifact from '../../../contracts/artifacts/contracts/VibeCardRegistry.sol/DappCardRegistry.json';

const ABI = artifact.abi as any;

const TEST_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const RPC_URL = 'http://127.0.0.1:8545';

export default function E2EChainSyncPage() {
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [passed, setPassed] = useState(false);

  const append = (msg: string) => {
    setLog(prev => [...prev, msg]);
  };

  const run = async () => {
    if (running) return;
    setRunning(true);
    setDone(false);
    setPassed(false);
    setLog(['Starting chain sync E2E test...']);

    try {
      const account = privateKeyToAccount(TEST_PRIVATE_KEY as `0x${string}`);
      append(`Using account ${account.address}`);

      const publicClient = createPublicClient({ chain: hardhat, transport: http(RPC_URL) });
      const walletClient = createWalletClient({
        chain: hardhat,
        transport: http(RPC_URL),
        account,
      });

      const balance = await publicClient.getBalance({ address: account.address });
      append(`Balance: ${formatEther(balance)} ETH`);
      if (balance === 0n) throw new Error('Account has no ETH');

      const chainId = await publicClient.getChainId();
      append(`Chain ID: ${chainId}`);

      const contractAddress = CONTRACT_ADDRESS[chainId];
      if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error(`No contract configured for chain ${chainId}`);
      }
      const bytecode = await publicClient.getBytecode({ address: contractAddress as `0x${string}` });
      if (!bytecode || bytecode === '0x') {
        throw new Error(`Contract not deployed at ${contractAddress}`);
      }
      append(`Using contract at ${contractAddress}`);

      const content: ChainContent = {
        version: '1.0',
        app: 'vibecard',
        type: 'profile',
        data: {
          name: 'E2E Test User',
          handle: 'e2euser',
          avatar: '',
          bio: 'Created by chain sync E2E test',
          tags: [{ label: 'Tester', icon: '' }],
          lookingFor: '',
          highlights: [],
          verified: { wallet: account.address, twitter: '', discord: '', wechat: '' },
          event: '',
        },
        timestamp: Date.now(),
      };

      const contentJson = JSON.stringify(content);
      const [ipfsHash, contentHash] = await Promise.all([
        uploadToIPFS(content),
        computeContentHash(contentJson),
      ]);
      append(`Mock IPFS hash: ${ipfsHash}`);
      append(`Content hash: ${contentHash}`);

      const nonce = await publicClient.getTransactionCount({ address: account.address });
      append(`Next nonce: ${nonce}`);
      const txHash = await walletClient.writeContract({
        chain: hardhat,
        account,
        address: contractAddress as `0x${string}`,
        abi: ABI,
        functionName: 'publish',
        args: ['profile', ipfsHash, contentHash],
        nonce,
      });
      append(`Publish tx: ${txHash}`);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      append('Transaction confirmed');

      const callData = encodeFunctionData({
        abi: ABI,
        functionName: 'getLatestProfile',
        args: [account.address],
      });
      const raw = await publicClient.call({
        to: contractAddress as `0x${string}`,
        data: callData,
      });
      const returnedHash = decodeFunctionResult({
        abi: ABI,
        functionName: 'getLatestProfile',
        data: raw.data as `0x${string}`,
      }) as string;
      append(`Returned IPFS hash: ${returnedHash}`);

      if (returnedHash !== ipfsHash) {
        throw new Error(`Hash mismatch: ${returnedHash} !== ${ipfsHash}`);
      }

      const fetched = await fetchFromIPFS(returnedHash);
      if (!fetched) throw new Error('Failed to fetch content from Mock IPFS');
      if (fetched.type !== 'profile') throw new Error(`Unexpected content type: ${fetched.type}`);
      const fetchedProfile = fetched.data as { name?: string };
      if (fetchedProfile.name !== 'E2E Test User') {
        throw new Error(`Profile mismatch: ${fetchedProfile.name}`);
      }

      append('PASS: full chain sync loop verified');
      setPassed(true);
    } catch (err) {
      append(`FAIL: ${(err as Error).message}`);
      setPassed(false);
    } finally {
      setRunning(false);
      setDone(true);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-8 font-mono text-sm">
      <h1 className="text-xl font-bold mb-4">Chain Sync E2E Test</h1>
      <button
        onClick={run}
        disabled={running}
        data-testid="e2e-run"
        className="mb-4 px-4 py-2 rounded-lg bg-foreground text-background font-bold disabled:opacity-50"
      >
        {running ? 'Running...' : 'Run Test'}
      </button>
      <div
        data-testid="e2e-result"
        data-passed={passed ? 'true' : done ? 'false' : 'pending'}
        className={`inline-block px-3 py-1 rounded-full mb-4 ml-3 font-bold ${
          passed ? 'bg-emerald-100 text-emerald-700' : done ? 'bg-red-100 text-red-700' : 'bg-secondary text-muted-foreground'
        }`}
      >
        {passed ? 'PASS' : done ? 'FAIL' : 'PENDING'}
      </div>
      <pre className="bg-card border border-border rounded-xl p-4 overflow-auto max-w-3xl whitespace-pre-wrap">
        {log.join('\n') || 'Click Run Test to start'}
      </pre>
    </div>
  );
}
