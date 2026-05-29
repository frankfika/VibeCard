import { detectBrowser } from '../../../web/src/lib/compatibility/browser';

let tgInstance: Window['Telegram']['WebApp'] | null = null;

export function initTelegramWebApp() {
  const env = detectBrowser();
  if (env.imBrowser !== 'telegram') return null;
  if (typeof window === 'undefined' || !window.Telegram?.WebApp) return null;

  tgInstance = window.Telegram.WebApp;
  tgInstance.ready();
  tgInstance.expand();
  tgInstance.enableClosingConfirmation();

  // Set theme colors to match vibecard
  tgInstance.setHeaderColor('#F7F9F8');
  tgInstance.setBackgroundColor('#F7F9F8');

  return tgInstance;
}

export function getTelegramWebApp(): Window['Telegram']['WebApp'] | null {
  return tgInstance;
}

export function isTelegramWebApp(): boolean {
  return detectBrowser().imBrowser === 'telegram';
}

export function getTelegramUser() {
  return tgInstance?.initDataUnsafe?.user;
}

export function showTelegramAlert(message: string) {
  if (tgInstance) {
    tgInstance.showAlert(message);
  } else {
    alert(message);
  }
}

export function showTelegramConfirm(message: string): Promise<boolean> {
  if (tgInstance) {
    return tgInstance.showConfirm(message);
  }
  return Promise.resolve(confirm(message));
}

export function vibrateTelegram(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') {
  tgInstance?.HapticFeedback?.impactOccurred(style);
}

export function setTelegramMainButton(text: string, onClick: () => void, visible = true) {
  if (!tgInstance) return;
  tgInstance.MainButton.setText(text);
  tgInstance.MainButton.onClick(onClick);
  if (visible) tgInstance.MainButton.show();
  else tgInstance.MainButton.hide();
}

export function hideTelegramMainButton() {
  tgInstance?.MainButton?.hide();
}

export function sendTelegramData(data: Record<string, unknown>) {
  tgInstance?.sendData(JSON.stringify(data));
}
