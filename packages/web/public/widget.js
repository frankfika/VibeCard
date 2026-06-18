/**
 * VibeCard Embed Widget
 *
 * 用法：
 * <script
 *   src="https://你的域名/widget.js"
 *   data-address="0x..."
 *   data-chain-id="31337"
 *   data-theme="light"
 *   data-locale="zh"
 * ></script>
 *
 * 或按 CID：
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
  const chainId = script.getAttribute('data-chain-id') || '31337';
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
    zh: { title: '查看名片', powered: '由 vibecard 提供' },
    en: { title: 'View Card', powered: 'Powered by vibecard' },
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

  function createCard() {
    const card = document.createElement('div');
    apply(card, styles.card);
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', t.title);

    const header = document.createElement('div');
    apply(header, styles.header);

    const avatar = document.createElement('div');
    apply(avatar, styles.avatar);
    avatar.textContent = '👤';

    const meta = document.createElement('div');
    const name = document.createElement('div');
    apply(name, styles.name);
    name.textContent = address ? truncate(address) : 'vibecard';

    const handle = document.createElement('div');
    apply(handle, styles.handle);
    handle.textContent = address ? 'Web3 社交名片' : cid.slice(0, 12) + '…';

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

  function truncate(addr) {
    return addr.slice(0, 6) + '…' + addr.slice(-4);
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

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    const card = createCard();
    script.parentNode.insertBefore(card, script.nextSibling);
  }

  init();
})();
