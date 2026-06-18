import { useEnsName, useEnsAvatar } from 'wagmi';
import { mainnet } from 'wagmi/chains';

export function shortAddress(address?: string | null, chars = 4): string {
  if (!address) return '';
  if (address.length < 2 + chars * 2) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

export interface ENSIdentity {
  address: `0x${string}` | undefined;
  ensName: string | null | undefined;
  ensAvatar: string | null | undefined;
  displayName: string;
  avatar: string | undefined;
  isLoading: boolean;
}

export function useENSIdentity(address?: `0x${string}` | null): ENSIdentity {
  const enabled = !!address;

  const { data: ensName, isLoading: nameLoading } = useEnsName({
    address: address ?? undefined,
    chainId: mainnet.id,
    query: { enabled },
  });

  const { data: ensAvatar, isLoading: avatarLoading } = useEnsAvatar({
    name: ensName ?? undefined,
    chainId: mainnet.id,
    query: { enabled: !!ensName },
  });

  const displayName = ensName || shortAddress(address) || 'Unknown';
  const avatar = ensAvatar || undefined;

  return {
    address: address ?? undefined,
    ensName,
    ensAvatar,
    displayName,
    avatar,
    isLoading: nameLoading || avatarLoading,
  };
}
