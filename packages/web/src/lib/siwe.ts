// siwe.ts — Sign-In With Ethereum (EIP-4361) helpers for VibeCard.
//
// We don't need a full SIWE server (no server in this project). The user
// signs a structured message with their connected wallet; we store the
// signature + message + timestamp. Anyone with the profile can re-verify
// the signature against the address using viem's `recoverMessageAddress`.
//
// Message format follows EIP-4361 loosely — kept as a single readable
// string the user can sanity-check in their wallet before signing.

import { recoverMessageAddress, type Hex } from 'viem';

export interface SiweProof {
  /** Address that signed the message, checksummed. */
  address: string;
  /** The exact message the user signed. */
  message: string;
  /** Hex signature (0x...) returned by the wallet. */
  signature: string;
  /** Unix ms when the user signed. */
  signedAt: number;
}

export const SIWE_DOMAIN = typeof window !== 'undefined' ? window.location.host : 'vibecard.local';
export const SIWE_URI = typeof window !== 'undefined' ? window.location.origin : 'https://vibecard.local';
export const SIWE_STATEMENT = 'Sign in to VibeCard to prove ownership of this wallet address. This signature does not authorize any transactions.';

const CHAIN_ID = 1; // EIP-4361 nonces can be any string; we keep it simple

/**
 * Build the EIP-4361 message the user will sign.
 * `nonce` should be a random opaque string per session.
 */
export function buildSiweMessage(opts: {
  address: string;
  nonce: string;
  issuedAt?: string;
}): string {
  const issuedAt = opts.issuedAt ?? new Date().toISOString();
  return [
    `${SIWE_DOMAIN} wants you to sign in with your Ethereum account:`,
    opts.address,
    '',
    SIWE_STATEMENT,
    '',
    `URI: ${SIWE_URI}`,
    `Version: 1`,
    `Chain ID: ${CHAIN_ID}`,
    `Nonce: ${opts.nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

/** Generate a short opaque nonce. */
export function makeNonce(): string {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Verify a SiweProof by recovering the address from the signature
 * and comparing it to the claimed address (case-insensitive).
 *
 * Returns `{ ok: true }` on success, otherwise an error reason.
 */
export type VerifyResult =
  | { ok: true; address: string }
  | { ok: false; reason: 'malformed' | 'mismatch' | 'recover-failed'; message: string };

export async function verifySiweProof(proof: SiweProof): Promise<VerifyResult> {
  if (!proof.signature.startsWith('0x') || !proof.message) {
    return { ok: false, reason: 'malformed', message: '签名格式无效' };
  }
  try {
    const recovered = await recoverMessageAddress({
      message: proof.message,
      signature: proof.signature as Hex,
    });
    if (recovered.toLowerCase() !== proof.address.toLowerCase()) {
      return {
        ok: false,
        reason: 'mismatch',
        message: `签名地址 (${recovered.slice(0, 6)}…) 与声称地址 (${proof.address.slice(0, 6)}…) 不匹配`,
      };
    }
    return { ok: true, address: recovered };
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return { ok: false, reason: 'recover-failed', message: `验签失败: ${message.slice(0, 80)}` };
  }
}
