import { useState, useEffect, useRef } from 'react';
import {
  Share, Twitter, Send, Download, QrCode,
  CheckCircle2, Link2, X, Code, Palette, LayoutTemplate, Smartphone, Monitor, Check,
} from 'lucide-react';
import { motion } from 'motion/react';
import QRCode from 'qrcode';
import { toPng } from 'html-to-image';
import type { Profile } from '../../store';
import { ShareCardTemplate, type CardTheme, type CardLayout, type CardOrientation, type CardVisibleFields } from '../ShareCardTemplate';

const THEMES: { id: CardTheme; label: string }[] = [
  { id: 'dark', label: 'Dark Vibe' },
  { id: 'light', label: 'Pure Light' },
  { id: 'neon', label: 'Web3 Neon' },
  { id: 'chill', label: 'Chill Breeze' },
  { id: 'retro', label: 'Retro Classic' },
];

const LOADING_TEXTS = [
  "捕捉你的 Vibe...",
  "正在注入灵魂...",
  "调整光影细节...",
  "生成专属名片...",
];

export default function ShareDrawer({
  onClose,
  shareUrl,
  detailUrl,
  profile,
}: {
  onClose: () => void;
  shareUrl: string;
  detailUrl: string;
  profile: Profile;
}) {
  const [mode, setMode] = useState<'menu' | 'qr' | 'posterBuilder' | 'imagePreview'>('menu');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrError, setQrError] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isEmbedCopied, setIsEmbedCopied] = useState(false);
  const [isScriptEmbedCopied, setIsScriptEmbedCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');

  // Customization states
  const [theme, setTheme] = useState<CardTheme>('dark');
  const [layout, setLayout] = useState<CardLayout>('center');
  const [orientation, setOrientation] = useState<CardOrientation>('portrait');
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);

  const [visible, setVisible] = useState<CardVisibleFields>({
    avatar: true,
    name: true,
    handle: true,
    event: true,
    tags: true,
    bio: true,
    specialTags: true,
    verified: true,
    highlights: true,
    qr: true,
  });

  // Preview Scale State
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.35);

  const hiddenCardRef = useRef<HTMLDivElement>(null);

  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

  const shareText = `${profile.name || 'TA'} 的 vibecard 名片 — 一张卡片，连接无限可能`;

  useEffect(() => {
    setQrError(false);
    QRCode.toDataURL(detailUrl, { width: 280, margin: 2, color: { dark: '#0a0a0a', light: '#ffffff' } })
      .then((url: string) => { setQrDataUrl(url); setQrError(false); })
      .catch(() => { setQrDataUrl(''); setQrError(true); });
  }, [detailUrl]);

  useEffect(() => {
    if (isSaving) {
      const interval = setInterval(() => {
        setLoadingTextIndex(i => (i + 1) % LOADING_TEXTS.length);
      }, 600);
      return () => clearInterval(interval);
    } else {
      setLoadingTextIndex(0);
    }
  }, [isSaving]);

  const copyToClipboard = async (text: string, setState: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setState(true);
      setTimeout(() => setState(false), 1500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setState(true);
        setTimeout(() => setState(false), 1500);
      } catch {}
      document.body.removeChild(textarea);
    }
  };

  const copyLink = () => copyToClipboard(shareUrl, setIsCopied);

  const embedCode = `<iframe\n  src="${shareUrl}"\n  width="100%"\n  height="640"\n  style="border:0;border-radius:24px;max-width:420px;"\n  title="vibecard"\n></iframe>`;

  const scriptEmbedCode = `<script\n  src="${window.location.origin}/widget.js"\n  data-address="${profile.verified?.wallet ?? ''}"\n  data-theme="light"\n></script>`;

  const copyEmbedCode = () => copyToClipboard(embedCode, setIsEmbedCopied);
  const copyScriptEmbedCode = () => copyToClipboard(scriptEmbedCode, setIsScriptEmbedCopied);

  const nativeShare = async () => {
    try {
      await navigator.share({ title: shareText, text: shareText, url: shareUrl });
    } catch {
      /* user cancelled */
    }
  };

  // 动态计算完美缩放比例
  useEffect(() => {
    if (mode !== 'posterBuilder') return;
    const el = previewContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      // 避免 ResizeObserver loop 报错，使用 requestAnimationFrame 延迟更新
      window.requestAnimationFrame(() => {
        if (!entries.length) return;
        const { width, height } = entries[0].contentRect;
        const targetWidth = orientation === 'portrait' ? 800 : 1100;
        const targetHeight = orientation === 'portrait' ? 1100 : 800;

        // 计算缩放比例，留出极小的 padding 即可
        const padding = 16;
        const scaleX = (width - padding) / targetWidth;
        const scaleY = (height - padding) / targetHeight;

        setPreviewScale(Math.min(scaleX, scaleY));
      });
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [mode, orientation]);

  const generateCardImage = async () => {
    if (!hiddenCardRef.current) return;
    setIsSaving(true);

    // Give it a tiny delay to ensure React has fully rendered the hidden ref with the new theme
    await new Promise(r => setTimeout(r, 50));

    try {
      const dataUrl = await toPng(hiddenCardRef.current, {
        pixelRatio: 2,
        backgroundColor: theme === 'light' || theme === 'chill' || theme === 'retro' ? '#ffffff' : '#0a0a0a',
        style: {
          transform: 'none',
        }
      });
      setImagePreviewUrl(dataUrl);
      setMode('imagePreview');
    } catch (e) {
      console.error('Save image failed', e);
    } finally {
      setIsSaving(false);
    }
  };

  const downloadCardImage = () => {
    if (!imagePreviewUrl) return;
    const link = document.createElement('a');
    link.download = `vibecard-${profile.name || 'namecard'}.png`;
    link.href = imagePreviewUrl;
    link.click();
  };

  const openPlatform = (key: string) => {
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(shareText);
    const urls: Record<string, string> = {
      x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      discord: `https://discord.com/channels/@me`,
      weibo: `https://service.weibo.com/share/share.php?title=${encodedText}&url=${encodedUrl}`,
    };
    if (urls[key]) window.open(urls[key], '_blank', 'width=600,height=500,noopener,noreferrer');
  };

  if (mode === 'qr') {
    return (
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-foreground/20 z-50" />
        <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute bottom-0 left-0 right-0 bg-background rounded-t-[28px] p-6 pt-5 z-50 border-t border-border">
          <div className="w-10 h-[4px] bg-border rounded-full mx-auto mb-5" />
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[18px] font-bold text-foreground">二维码分享</h3>
            <button onClick={() => setMode('menu')} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-foreground hover:text-background transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col items-center gap-4 mb-4">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR" className="w-52 h-52 rounded-2xl border border-border shadow-sm" />
            ) : qrError ? (
              <div className="w-52 h-52 rounded-2xl bg-secondary flex items-center justify-center">
                <span className="text-[13px] text-muted-foreground">二维码生成失败</span>
              </div>
            ) : (
              <div className="w-52 h-52 rounded-2xl bg-secondary flex items-center justify-center">
                <span className="text-[13px] text-muted-foreground">生成中…</span>
              </div>
            )}
            <p className="text-[13px] text-muted-foreground font-medium text-center">微信扫码即可查看名片<br />长按可保存二维码</p>
          </div>
          <button onClick={copyLink} className="w-full py-3.5 bg-secondary rounded-xl font-semibold text-[14px] text-foreground hover:bg-foreground hover:text-background transition-colors flex items-center justify-center gap-2">
            {isCopied ? <CheckCircle2 className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
            {isCopied ? '已复制链接' : '复制名片链接'}
          </button>
        </motion.div>
      </>
    );
  }

  if (mode === 'posterBuilder') {
    const targetWidth = orientation === 'portrait' ? 800 : 1100;
    const targetHeight = orientation === 'portrait' ? 1100 : 800;

    return (
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMode('menu')} className="fixed inset-0 bg-foreground/20 backdrop-blur-[2px] z-50" />
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed inset-0 md:inset-4 lg:inset-6 z-50 bg-background md:rounded-[28px] border-0 md:border border-border shadow-2xl overflow-hidden flex flex-col md:flex-row"
        >
          {/* Left Config Sidebar */}
          <div className="w-full md:w-[320px] lg:w-[360px] shrink-0 bg-background border-b md:border-b-0 md:border-r border-border flex flex-col max-h-[48vh] md:max-h-none">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between shrink-0">
              <h3 className="text-[16px] font-black text-foreground tracking-tight">定制海报</h3>
              <button onClick={() => setMode('menu')} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-foreground hover:text-background transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-6 overflow-y-auto flex-1">
              {/* Theme */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Palette className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[13px] font-bold text-foreground uppercase tracking-widest">选择主题 Vibe</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {THEMES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={`px-3 py-1.5 rounded-xl text-[12px] font-bold border transition-all ${
                        theme === t.id
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-transparent bg-secondary text-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Orientation */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Smartphone className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[13px] font-bold text-foreground uppercase tracking-widest">海报方向</span>
                </div>
                <div className="flex gap-1.5 p-1 bg-secondary/50 rounded-xl border border-border/50">
                  <button
                    onClick={() => setOrientation('portrait')}
                    className={`flex-1 py-2 rounded-[10px] text-[12px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                      orientation === 'portrait' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    竖版
                  </button>
                  <button
                    onClick={() => setOrientation('landscape')}
                    className={`flex-1 py-2 rounded-[10px] text-[12px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                      orientation === 'landscape' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    横版
                  </button>
                </div>
              </div>

              {/* Layout */}
              {orientation === 'portrait' && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <LayoutTemplate className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[13px] font-bold text-foreground uppercase tracking-widest">排版布局</span>
                  </div>
                  <div className="flex gap-1.5 p-1 bg-secondary/50 rounded-xl border border-border/50">
                    <button
                      onClick={() => setLayout('center')}
                      className={`flex-1 py-2 rounded-[10px] text-[12px] font-bold transition-all ${
                        layout === 'center' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      居中
                    </button>
                    <button
                      onClick={() => setLayout('left')}
                      className={`flex-1 py-2 rounded-[10px] text-[12px] font-bold transition-all ${
                        layout === 'left' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      左侧
                    </button>
                  </div>
                </div>
              )}

              {/* Visibility */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <LayoutTemplate className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[13px] font-bold text-foreground uppercase tracking-widest">展示内容</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'avatar', label: '头像' },
                    { key: 'name', label: '名字' },
                    { key: 'handle', label: 'Handle' },
                    { key: 'event', label: '活动' },
                    { key: 'tags', label: '标签' },
                    { key: 'bio', label: '简介' },
                    { key: 'specialTags', label: '特殊标识' },
                    { key: 'verified', label: '联系方式' },
                    { key: 'highlights', label: '亮点' },
                    { key: 'qr', label: '扫码查看更多' },
                  ].map((field) => (
                    <button
                      key={field.key}
                      onClick={() => setVisible((prev: CardVisibleFields) => ({ ...prev, [field.key]: !prev[field.key as keyof CardVisibleFields] }))}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-[12px] font-bold border transition-all ${
                        visible[field.key as keyof CardVisibleFields]
                          ? 'bg-foreground text-background border-foreground'
                          : 'bg-secondary text-muted-foreground border-transparent hover:bg-secondary/80'
                      }`}
                    >
                      {field.label}
                      {visible[field.key as keyof CardVisibleFields] && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-border/50 shrink-0">
              <button
                onClick={generateCardImage}
                disabled={isSaving}
                className="w-full h-12 bg-foreground rounded-2xl font-bold text-[15px] text-background active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-80"
              >
                {isSaving ? (
                  <motion.span
                    key={loadingTextIndex}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="flex items-center gap-2"
                  >
                    <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                    {LOADING_TEXTS[loadingTextIndex]}
                  </motion.span>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    生成高清海报
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Preview Area */}
          <div className="flex-1 bg-secondary/10 flex items-center justify-center relative overflow-hidden p-4 md:p-8">
            <div ref={previewContainerRef} className="relative flex items-center justify-center w-full h-full">
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring', damping: 25, stiffness: 300 }}
                className="relative rounded-[20px] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.2)] bg-white border border-border/50"
                style={{
                  width: targetWidth * previewScale,
                  height: targetHeight * previewScale,
                }}
              >
                <div
                  className="absolute top-0 left-0 origin-top-left pointer-events-none"
                  style={{
                    width: targetWidth,
                    height: targetHeight,
                    transform: `scale(${previewScale})`,
                  }}
                >
                  <ShareCardTemplate profile={profile} qrDataUrl={qrDataUrl} theme={theme} layout={layout} orientation={orientation} visible={visible} />
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Hidden Full-Size Template for High-Res Capture */}
        <div className="fixed pointer-events-none z-[-1]" style={{ top: '-20000px', left: '-20000px' }}>
          <ShareCardTemplate ref={hiddenCardRef} profile={profile} qrDataUrl={qrDataUrl} theme={theme} layout={layout} orientation={orientation} visible={visible} />
        </div>
      </>
    );
  }

  if (mode === 'imagePreview') {
    return (
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-foreground/40 z-50" />
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="absolute inset-x-4 top-[10%] bottom-[10%] bg-background rounded-[28px] p-5 z-50 border border-border shadow-2xl flex flex-col">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h3 className="text-[16px] font-bold text-foreground">海报已生成</h3>
            <button onClick={() => setMode('posterBuilder')} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-foreground hover:text-background transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[12px] text-muted-foreground mb-3 shrink-0">iOS 用户请长按下方图片，选择「存储图像」保存到相册。</p>
          <div className="flex-1 flex flex-col items-center justify-center overflow-hidden rounded-2xl bg-secondary relative">
            {imagePreviewUrl ? (
              <img src={imagePreviewUrl} alt="名片预览" className="max-w-full max-h-full rounded-2xl shadow-lg object-contain" />
            ) : (
              <span className="text-[13px] text-muted-foreground">图片生成中…</span>
            )}
          </div>
          <div className="mt-4 shrink-0 space-y-3">
            <p className="text-[12px] text-muted-foreground text-center leading-relaxed">
              {isIOS ? 'iOS 用户请长按上方图片，选择「存储图像」保存到相册。' : '预览效果满意后，点击下方按钮保存高清名片图。'}
            </p>
            {!isIOS && (
              <button
                onClick={downloadCardImage}
                disabled={!imagePreviewUrl}
                className="w-full py-3.5 bg-foreground rounded-xl font-semibold text-[14px] text-background hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                下载图片
              </button>
            )}
          </div>
        </motion.div>
      </>
    );
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-foreground/20 z-50 backdrop-blur-[2px]" />
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute bottom-0 left-0 right-0 bg-background rounded-t-[32px] p-6 pt-5 z-50 border-t border-border shadow-[0_-8px_30px_-15px_rgba(0,0,0,0.1)]">
        <div className="w-12 h-[5px] bg-secondary-foreground/20 rounded-full mx-auto mb-6" />

        <div className="flex items-center justify-between mb-6">
          <h3 className="text-[22px] font-black text-foreground tracking-tight">分享名片</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary-foreground/10 transition-colors">
            <X className="w-4 h-4 text-foreground/70" />
          </button>
        </div>

        {/* 核心操作区 */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <button onClick={() => setMode('posterBuilder')} className="group relative overflow-hidden flex flex-col items-center gap-3 p-5 rounded-[24px] bg-foreground hover:opacity-95 transition-all active:scale-[0.98]">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="w-12 h-12 rounded-full bg-background/20 text-background flex items-center justify-center relative z-10 backdrop-blur-sm">
              <Palette className="w-6 h-6" />
            </div>
            <span className="text-[14px] font-bold text-background relative z-10">定制专属海报</span>
          </button>

          <button onClick={() => setMode('qr')} className="flex flex-col items-center gap-3 p-5 rounded-[24px] bg-secondary hover:bg-secondary/80 transition-all active:scale-[0.98]">
            <div className="w-12 h-12 rounded-full bg-background text-foreground flex items-center justify-center shadow-sm">
              <QrCode className="w-6 h-6" />
            </div>
            <span className="text-[14px] font-bold text-foreground">面对面扫码</span>
          </button>
        </div>

        {/* 链接与系统分享 */}
        <div className="space-y-3 mb-8">
          <button onClick={copyLink} className="w-full flex items-center justify-between px-5 py-4 bg-secondary rounded-[20px] hover:bg-secondary/80 active:scale-[0.98] transition-all group">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                <Link2 className="w-4 h-4 text-foreground" />
              </div>
              <span className="text-[15px] font-semibold text-foreground">复制名片链接</span>
            </div>
            {isCopied ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <span className="text-[13px] font-medium text-muted-foreground">复制</span>}
          </button>

          {canNativeShare && (
            <button onClick={nativeShare} className="w-full flex items-center justify-between px-5 py-4 bg-secondary rounded-[20px] hover:bg-secondary/80 active:scale-[0.98] transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <Share className="w-4 h-4 text-foreground" />
                </div>
                <span className="text-[15px] font-semibold text-foreground">通过系统分享</span>
              </div>
            </button>
          )}
        </div>

        {/* 社交媒体 */}
        <div className="mb-8">
          <p className="text-[12px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-1">分享至社交媒体</p>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 px-1 -mx-1">
            <button onClick={() => openPlatform('x')} className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-secondary hover:bg-secondary/80 transition-colors shrink-0">
              <Twitter className="w-4 h-4" />
              <span className="text-[14px] font-bold text-foreground">X (Twitter)</span>
            </button>
            <button onClick={() => openPlatform('telegram')} className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-secondary hover:bg-secondary/80 transition-colors shrink-0">
              <Send className="w-4 h-4" />
              <span className="text-[14px] font-bold text-foreground">Telegram</span>
            </button>
            <button onClick={() => openPlatform('weibo')} className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-secondary hover:bg-secondary/80 transition-colors shrink-0">
              <span className="text-[14px] font-bold text-foreground">Weibo</span>
            </button>
          </div>
        </div>

        {/* 开发者嵌入 */}
        <div className="pt-6 border-t border-border/50">
          <p className="text-[12px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-1">开发者选项</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={copyEmbedCode} className="w-full flex items-center justify-center gap-2 py-3.5 bg-background border border-border rounded-xl font-semibold text-[13px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all">
              {isEmbedCopied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Code className="w-4 h-4" />}
              {isEmbedCopied ? '已复制' : '获取 iframe 代码'}
            </button>
            <button onClick={copyScriptEmbedCode} className="w-full flex items-center justify-center gap-2 py-3.5 bg-background border border-border rounded-xl font-semibold text-[13px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all">
              {isScriptEmbedCopied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Code className="w-4 h-4" />}
              {isScriptEmbedCopied ? '已复制' : '获取 JS Widget'}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
