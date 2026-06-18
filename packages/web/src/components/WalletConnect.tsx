import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  ChevronDown,
  Wallet,
  AlertCircle,
  ExternalLink,
  Loader2,
  Unlink,
} from 'lucide-react';
import { useAccount, useSwitchChain } from 'wagmi';
import { detectBrowser } from '@/src/lib/compatibility/browser';
import { isWalletConnectReady, supportedChains, chainNames } from '@/src/lib/web3/config';
import { useENSIdentity } from '@/src/lib/web3/identity';

export default function WalletConnect() {
  const env = detectBrowser();
  const { isConnected } = useAccount();

  if (!isWalletConnectReady) {
    return (
      <button
        type="button"
        data-testid="wallet-unconfigured"
        onClick={() =>
          window.open('https://cloud.walletconnect.com/', '_blank', 'noopener,noreferrer')
        }
        className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100"
        title="WalletConnect Project ID 未配置，邮箱/社交登录不可用"
      >
        <AlertCircle className="w-4 h-4" />
        登录未配置
      </button>
    );
  }

  if (env.isIMBrowser && !env.hasEthereum) {
    return (
      <button
        onClick={() => {
          const link = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
          window.location.href = link;
        }}
        data-testid="wallet-open-in-app"
        className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100"
      >
        <ExternalLink className="w-4 h-4" />
        在钱包中打开
      </button>
    );
  }

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        authenticationStatus,
        openAccountModal,
        openChainModal,
        openConnectModal,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected = ready && account && chain && (!authenticationStatus || authenticationStatus === 'authenticated');

        if (!connected) {
          return (
            <button
              onClick={openConnectModal}
              type="button"
              data-testid="wallet-connect"
              disabled={!ready}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3.5 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:opacity-50"
            >
              {ready ? <Wallet className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
              连接钱包
            </button>
          );
        }

        return (
          <ConnectedWallet
            account={account}
            chain={chain}
            openAccountModal={openAccountModal}
            openChainModal={openChainModal}
          />
        );
      }}
    </ConnectButton.Custom>
  );
}

function ConnectedWallet({
  account,
  chain,
  openAccountModal,
  openChainModal,
}: {
  account: {
    address?: string;
    displayName: string;
    ensName?: string;
    ensAvatar?: string;
    balanceDecimals?: number;
    balanceFormatted?: string;
    balanceSymbol?: string;
  };
  chain: { id?: number; name?: string; hasIcon?: boolean; iconUrl?: string; iconBackground?: string };
  openAccountModal: () => void;
  openChainModal: () => void;
}) {
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const identity = useENSIdentity(account.address as `0x${string}` | undefined);
  const isUnsupported = !supportedChains.some(c => c.id === chain.id);

  return (
    <div className="flex items-center gap-2" data-testid="wallet-connected">
      <button
        onClick={openChainModal}
        type="button"
        data-testid="wallet-chain"
        disabled={isSwitching}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background/70 transition-colors hover:border-foreground hover:text-foreground disabled:opacity-50 ${
          isUnsupported ? 'border-rose-200 text-rose-600' : 'border-border text-muted-foreground'
        }`}
        title={isUnsupported ? `不支持的网路：${chain.name ?? chain.id}` : chain.name ?? '切换网络'}
      >
        {isSwitching ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : chain.hasIcon ? (
          <div
            className="h-4 w-4 overflow-hidden rounded-full"
            style={{ background: chain.iconBackground }}
          >
            {chain.iconUrl ? (
              <img alt={chain.name ?? 'Chain icon'} src={chain.iconUrl} className="h-4 w-4" />
            ) : null}
          </div>
        ) : (
          <Unlink className="h-4 w-4" />
        )}
      </button>

      <button
        onClick={openAccountModal}
        type="button"
        className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:border-foreground"
      >
        {identity.avatar ? (
          <img
            src={identity.avatar}
            alt=""
            className="h-5 w-5 rounded-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : null}
        <span className="max-w-[120px] truncate">{identity.displayName}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {isUnsupported && switchChain && (
        <button
          type="button"
          onClick={() => chain.id && switchChain({ chainId: chain.id })}
          className="text-[11px] font-bold text-rose-600 underline underline-offset-2"
        >
          切换网络
        </button>
      )}
    </div>
  );
}

export function WalletNetworkLabel({ chainId }: { chainId?: number }) {
  if (!chainId) return null;
  return <span className="text-[11px] font-bold text-muted-foreground">{chainNames[chainId] ?? `Chain ${chainId}`}</span>;
}
