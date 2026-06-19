/**
 * VibeCard Embed Widget
 *
 * 用法：
 * <script
 *   src="https://你的域名/widget.js"
 *   data-address="0x..."
 *   data-chain-id="8453"
 *   data-theme="dark"
 *   data-locale="zh"
 * ></script>
 *
 * 或直接按 CID：
 * <script
 *   src="https://你的域名/widget.js"
 *   data-cid="Qm..."
 *   data-theme="dark"
 * ></script>
 */
(function () {
  'use strict';

  const script = document.currentScript;
  if (!script) return;

  const address = script.getAttribute('data-address');
  const cid = script.getAttribute('data-cid');
  const chainId = script.getAttribute('data-chain-id') || '1';
  const theme = script.getAttribute('data-theme') || 'light';
  const locale = script.getAttribute('data-locale') || 'zh';

  const origin = new URL(script.src).origin;
  let embedUrl = origin + '/';
  if (address) {
    embedUrl += '?address=' + encodeURIComponent(address) + '&chainId=' + encodeURIComponent(chainId);
  } else if (cid) {
    embedUrl += '?cid=' + encodeURIComponent(cid);
  } else {
    console.warn('[vibecard-widget] 缺少 data-address 或 data-cid');
    return;
  }

  const texts = {
    zh: { title: '查看名片', powered: '由 vibecard 提供', loading: '加载中…', error: '名片加载失败' },
    en: { title: 'View Card', powered: 'Powered by vibecard', loading: 'Loading…', error: 'Failed to load' },
  };
  const t = texts[locale] || texts.en;

  const styles = {
    card: {
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      width: '280px',
      borderRadius: '20px',
      padding: '16px',
      boxShadow: theme === 'dark'
        ? '0 10px 40px rgba(0,0,0,0.5)'
        : '0 10px 40px rgba(0,0,0,0.08)',
      background: theme === 'dark' ? '#171717' : '#ffffff',
      color: theme === 'dark' ? '#fafafa' : '#0a0a0a',
      border: theme === 'dark' ? '1px solid #262626' : '1px solid #e8e8e8',
      cursor: 'pointer',
      transition: 'transform 150ms ease, box-shadow 150ms ease',
      boxSizing: 'border-box',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '12px',
    },
    avatar: {
      width: '48px',
      height: '48px',
      borderRadius: '14px',
      background: theme === 'dark' ? '#262626' : '#f5f5f5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '24px',
      flexShrink: 0,
      overflow: 'hidden',
    },
    avatarImg: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    name: {
      fontSize: '16px',
      fontWeight: 800,
      lineHeight: 1.2,
      margin: 0,
    },
    handle: {
      fontSize: '12px',
      opacity: 0.6,
      marginTop: '2px',
    },
    button: {
      width: '100%',
      padding: '10px 0',
      borderRadius: '12px',
      border: 'none',
      background: theme === 'dark' ? '#fafafa' : '#0a0a0a',
      color: theme === 'dark' ? '#0a0a0a' : '#fafafa',
      fontSize: '13px',
      fontWeight: 700,
      cursor: 'pointer',
      marginTop: '12px',
    },
    footer: {
      fontSize: '10px',
      opacity: 0.4,
      textAlign: 'center',
      marginTop: '10px',
    },
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.4)',
      backdropFilter: 'blur(4px)',
      zIndex: 999999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    },
    modal: {
      width: '100%',
      maxWidth: '440px',
      height: '80vh',
      maxHeight: '640px',
      borderRadius: '24px',
      overflow: 'hidden',
      background: theme === 'dark' ? '#171717' : '#ffffff',
      boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
      position: 'relative',
    },
    iframe: {
      width: '100%',
      height: '100%',
      border: 0,
    },
    close: {
      position: 'absolute',
      top: '12px',
      right: '12px',
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      border: 'none',
      background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
      color: theme === 'dark' ? '#fff' : '#000',
      fontSize: '18px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
  };

  function apply(el, style) {
    Object.assign(el.style, style);
  }

  function truncate(addr) {
    return addr.slice(0, 6) + '…' + addr.slice(-4);
  }

  async function fetchConfig() {
    try {
      const res = await fetch(origin + '/widget-config.json', { cache: 'no-cache' });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function fetchWithFallback(urls) {
    for (let i = 0; i < urls.length; i++) {
      try {
        const res = await fetch(urls[i]);
        if (res.ok) return await res.json();
      } catch {}
    }
    return null;
  }

  async function fetchProfileByCid(cidValue) {
    return fetchWithFallback([
      'https://gateway.pinata.cloud/ipfs/' + cidValue,
      'https://ipfs.io/ipfs/' + cidValue,
      'https://cloudflare-ipfs.com/ipfs/' + cidValue,
    ]);
  }

  function encodeGetLatestProfile(addr) {
    const methodId = '0x9bd2c0e7';
    const padded = addr.toLowerCase().replace('0x', '').padStart(64, '0');
    return methodId + padded;
  }

  function decodeStringResult(hex) {
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

  async function fetchLatestCidFromChain(addr, chainIdValue, config) {
    const chain = config?.chains?.[chainIdValue];
    if (!chain?.rpcUrl || !chain?.contractAddress) return null;
    if (chain.contractAddress === '0x0000000000000000000000000000000000000000') return null;

    try {
      const res = await fetch(chain.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to: chain.contractAddress, data: encodeGetLatestProfile(addr) }, 'latest'],
        }),
      });
      if (!res.ok) return null;
      const result = await res.json();
      if (result.error) return null;
      return decodeStringResult(result.result);
    } catch {
      return null;
    }
  }

  async function resolveProfile(config) {
    if (cid) {
      const data = await fetchProfileByCid(cid);
      if (data?.type === 'profile') return data.data;
      return data;
    }
    if (address) {
      const resolvedCid = await fetchLatestCidFromChain(address, chainId, config);
      if (!resolvedCid) return null;
      const data = await fetchProfileByCid(resolvedCid);
      if (data?.type === 'profile') return data.data;
      return data;
    }
    return null;
  }

  function createAvatar(profile) {
    const avatar = document.createElement('div');
    apply(avatar, styles.avatar);

    if (profile?.avatar) {
      const img = document.createElement('img');
      apply(img, styles.avatarImg);
      img.src = profile.avatar;
      img.alt = profile.name || '';
      avatar.appendChild(img);
    } else if (profile?.name) {
      avatar.textContent = profile.name.slice(0, 1).toUpperCase();
    } else {
      avatar.textContent = '👤';
    }
    return avatar;
  }

  function createCard(profile) {
    const card = document.createElement('div');
    apply(card, styles.card);
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', t.title);

    const header = document.createElement('div');
    apply(header, styles.header);

    const avatar = createAvatar(profile);

    const meta = document.createElement('div');
    const name = document.createElement('div');
    apply(name, styles.name);
    name.textContent = profile?.name || (address ? truncate(address) : 'vibecard');

    const handle = document.createElement('div');
    apply(handle, styles.handle);
    handle.textContent = profile?.handle || profile?.bio || (address ? 'Web3 社交名片' : cid.slice(0, 12) + '…');

    meta.appendChild(name);
    meta.appendChild(handle);
    header.appendChild(avatar);
    header.appendChild(meta);

    const btn = document.createElement('button');
    apply(btn, styles.button);
    btn.textContent = t.title;

    const footer = document.createElement('div');
    apply(footer, styles.footer);
    footer.textContent = t.powered;

    card.appendChild(header);
    card.appendChild(btn);
    card.appendChild(footer);

    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = theme === 'dark'
        ? '0 14px 48px rgba(0,0,0,0.6)'
        : '0 14px 48px rgba(0,0,0,0.12)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = styles.card.boxShadow;
    });

    card.addEventListener('click', openModal);
    return card;
  }

  function createSkeleton() {
    const card = createCard(null);
    const name = card.querySelector('div[style*="font-weight: 800"]');
    if (name) name.textContent = t.loading;
    const handle = card.querySelector('div[style*="opacity: 0.6"]');
    if (handle) handle.textContent = '…';
    return card;
  }

  function openModal() {
    const overlay = document.createElement('div');
    apply(overlay, styles.overlay);

    const modal = document.createElement('div');
    apply(modal, styles.modal);

    const iframe = document.createElement('iframe');
    apply(iframe, styles.iframe);
    iframe.src = embedUrl;
    iframe.title = 'vibecard';
    iframe.allow = 'clipboard-write';

    const close = document.createElement('button');
    apply(close, styles.close);
    close.innerHTML = '&times;';
    close.setAttribute('aria-label', 'Close');

    modal.appendChild(iframe);
    modal.appendChild(close);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    close.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', esc);
      }
    });
  }

  async function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    let card = createSkeleton();
    script.parentNode.insertBefore(card, script.nextSibling);

    const config = await fetchConfig();
    const profile = await resolveProfile(config);

    const newCard = createCard(profile);
    card.replaceWith(newCard);
    card = newCard;
  }

  init();
})();
