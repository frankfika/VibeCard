// genai.ts — Google Gemini image generation helper for VibeCard onboarding.
//
// We surface this as an opt-in button: if VITE_GEMINI_API_KEY is set, the
// user gets a real generative avatar; if not, we fall back to a dicebear
// seed shuffle and toast a notice. This keeps the demo build working
// without committing any real keys, while letting production deploys
// enable the feature by setting one env var.
//
// Security note: VITE_GEMINI_API_KEY is exposed to the browser bundle by
// design (it's a frontend project). Treat it as a rate-limited demo key.

import { GoogleGenAI, Modality } from '@google/genai';

const ENV_KEY = (import.meta.env?.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? '';

export const isGenaiConfigured = ENV_KEY.length > 0;

const SYSTEM_PROMPT = [
  'You generate stylized portrait avatars for a social business card.',
  'The avatar must be a square, centered, head-and-shoulders portrait.',
  'Use a clean, modern illustration style suitable for a profile picture.',
  'Background should be a soft solid color or simple gradient; no busy scenes.',
  'No text, no logos, no watermarks.',
].join(' ');

export type GenaiAvatarResult =
  | { ok: true; dataUrl: string }
  | { ok: false; reason: 'unconfigured' | 'no-image' | 'error'; message: string };

/**
 * Generate an avatar data URL from a textual prompt using Gemini.
 *
 * Always returns a discriminated union — never throws. Callers should
 * narrow on `ok` and handle the failure case (e.g. fall back to a random
 * dicebear seed).
 */
export async function generateAvatarFromPrompt(prompt: string): Promise<GenaiAvatarResult> {
  if (!isGenaiConfigured) {
    return {
      ok: false,
      reason: 'unconfigured',
      message: '未配置 VITE_GEMINI_API_KEY，已为你随机一个头像。',
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: ENV_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: prompt.trim() || 'a friendly, professional person',
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const inline = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
      if (inline?.data) {
        const mime = inline.mimeType || 'image/png';
        return { ok: true, dataUrl: `data:${mime};base64,${inline.data}` };
      }
    }

    return {
      ok: false,
      reason: 'no-image',
      message: '模型没返回图片, 已为你随机一个头像。',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return {
      ok: false,
      reason: 'error',
      message: `生成失败 (${message.slice(0, 80)}), 已为你随机一个头像。`,
    };
  }
}

/** Pick a random seed from the dicebear seed pool, for graceful fallback. */
export function pickRandomAvatarSeed<T>(pool: readonly T[]): T {
  if (pool.length === 0) throw new Error('empty avatar seed pool');
  return pool[Math.floor(Math.random() * pool.length)]!;
}
