import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import {
  Share, MapPin, Twitter, MessageCircle, Wallet,
  Check, Zap, Coins, QrCode,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useProfile } from '../store';
import { useAccount } from 'wagmi';
import QRCode from 'qrcode';
import { getSocialIcon, getSocialLabel } from '../lib/social';
import OnboardingFlow from '../components/card/OnboardingFlow';
import { useNamecardUrl } from '../hooks/useNamecardUrl';

const EditProfile = lazy(() => import('../components/card/EditProfile'));
const ShareDrawer = lazy(() => import('../components/card/ShareDrawer'));

export default function CardPage() {
  const { profile: myProfile, updateProfile, isSetup } = useProfile();
  const { address } = useAccount();
  const [isEditing, setIsEditing] = useState(false);
  const [showShareDiv, setShowShareDiv] = useState(false);

  // Stable short share URL backed by /api/cards; falls back to legacy base64.
  const { url: shareUrl } = useNamecardUrl(myProfile);
  const shareUrlFull = useMemo(() => {
    if (!shareUrl || shareUrl === window.location.href) return shareUrl;
    const sep = shareUrl.includes('?') ? '&' : '?';
    return `${shareUrl}${sep}view=full`;
  }, [shareUrl]);

  const [qrDataUrl, setQrDataUrl] = useState('');
  useEffect(() => {
    QRCode.toDataURL(shareUrlFull, { width: 200, margin: 1, color: { dark: '#0a0a0a', light: '#ffffff' } })
      .then((url: string) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [shareUrlFull]);

  const syncedAddressRef = useRef<string | null>(null);
  useEffect(() => {
    if (address && address !== syncedAddressRef.current) {
      syncedAddressRef.current = address;
      updateProfile({ verified: { ...myProfile.verified, wallet: address } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);


  if (!isSetup) {
    return <OnboardingFlow onComplete={(data) => updateProfile(data)} />;
  }

  const profile = myProfile;
  const avatarUrl = profile.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${profile.name}&backgroundColor=transparent`;

  return (
    <div className="flex h-full min-h-0 flex-col relative">
      <header className="hidden md:flex px-6 py-4 justify-center items-center z-20 shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground tracking-widest uppercase">
          我的名片
        </span>
      </header>

      <main className="flex-1 overflow-y-auto px-5 sm:px-6 z-10 no-scrollbar relative w-full min-h-0 pb-[140px]">
        <div className="bg-background px-5 py-6 rounded-[28px]">
          <div className="flex flex-col items-center mb-8 pt-2">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }} className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-[32px] mb-5 relative shadow-xl">
              <img src={avatarUrl} loading="lazy" decoding="async" className="w-full h-full rounded-[32px] object-cover bg-gradient-to-br from-secondary to-muted border border-white/10" alt="avatar" />
              {profile.verified?.wallet && (
                <div className="absolute -bottom-2 -right-2 w-7 h-7 bg-foreground rounded-full border-[3px] border-background flex items-center justify-center shadow-md">
                  <Check className="w-3.5 h-3.5 text-background stroke-[3]" />
                </div>
              )}
            </motion.div>
            <motion.h1 initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="text-[24px] sm:text-[28px] md:text-[32px] font-black tracking-tight text-foreground mb-1">{profile.name}</motion.h1>
            {profile.handle && <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }} className="text-[15px] font-bold text-muted-foreground">{profile.handle}</motion.div>}
            {(profile.event || profile.lookingFor) && (
              <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {profile.event && (
                  <span className="px-3 py-1.5 rounded-full bg-secondary/50 flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground backdrop-blur-sm">
                    <MapPin className="w-3.5 h-3.5" />
                    {profile.event}
                  </span>
                )}
                {profile.lookingFor && (
                  <span className="px-3 py-1.5 rounded-full bg-foreground/5 border border-foreground/10 flex items-center gap-1.5 text-[12px] font-bold text-foreground/80 backdrop-blur-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    找: {profile.lookingFor}
                  </span>
                )}
              </motion.div>
            )}

          </div>

          {profile.tags?.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="flex flex-wrap justify-center gap-2 mb-8">
              {profile.tags.map((tag) => (
                <span key={tag.label} className="px-3.5 py-1.5 rounded-full text-[12px] font-bold bg-white/5 border border-white/10 text-foreground backdrop-blur-md shadow-sm">
                  {tag.label}
                </span>
              ))}
            </motion.div>
          )}

          {profile.bio && (
            <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="bg-card/40 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)] rounded-[24px] p-6 mb-5">
              <p className="text-[16px] leading-relaxed font-medium text-foreground/80 text-center">{profile.bio}</p>
            </motion.div>
          )}

          {(profile.mbti || profile.zodiac || profile.age || profile.location) && (
            <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 }} className="flex flex-wrap justify-center gap-2 mb-6">
              {profile.mbti && (
                <span className="px-3 py-1.5 rounded-full text-[12px] font-black bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm border border-indigo-400/20">
                  {profile.mbti}
                </span>
              )}
              {profile.zodiac && (
                <span className="px-3 py-1.5 rounded-full text-[12px] font-bold bg-secondary/80 text-foreground border border-border/50 shadow-sm backdrop-blur-sm">
                  {profile.zodiac}
                </span>
              )}
              {profile.age && (
                <span className="px-3 py-1.5 rounded-full text-[12px] font-bold bg-secondary/80 text-foreground border border-border/50 shadow-sm backdrop-blur-sm">
                  {profile.age}
                </span>
              )}
              {profile.location && (
                <span className="px-3 py-1.5 rounded-full text-[12px] font-bold bg-secondary/80 text-foreground border border-border/50 shadow-sm backdrop-blur-sm flex items-center gap-1">
                  <MapPin className="w-3 h-3 opacity-70" />
                  {profile.location.replace('📍 ', '')}
                </span>
              )}
            </motion.div>
          )}

          {(
            <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="bg-card/40 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)] rounded-[24px] p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">联系方式</h3>
                {profile.verified?.wallet && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                    <Wallet className="w-3 h-3" />
                    {profile.verified.wallet.slice(0, 6)}…{profile.verified.wallet.slice(-4)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-4">
                {profile.contacts && profile.contacts.map(contact => {
                  const Icon = getSocialIcon(contact.platform);
                  const label = getSocialLabel(contact.platform);
                  return (
                    <a
                      key={contact.id || contact.platform}
                      href={contact.url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-2.5 group"
                      onClick={(e) => { if (!contact.url) e.preventDefault(); }}
                    >
                      <div className="w-12 h-12 rounded-[16px] bg-secondary/80 flex items-center justify-center shadow-sm group-hover:bg-secondary transition-colors">
                        <Icon className="w-5 h-5 text-foreground" />
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</span>
                    </a>
                  );
                })}
                {(!profile.contacts || profile.contacts.length === 0) && (
                  <div className="w-full text-center py-4 text-sm text-muted-foreground">
                    暂未添加联系方式，点击右上角编辑添加
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {profile.highlights?.length > 0 && (
            <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45 }} className="w-full mb-8">
              <h3 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Highlights</h3>
              <div className="space-y-2">
                {profile.highlights.filter(h => h.title).map((item) => (
                  <div key={item.id} className="w-full bg-card/40 backdrop-blur-xl border border-white/10 shadow-sm rounded-[16px] p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[12px] bg-secondary flex items-center justify-center text-[18px]">{item.icon}</div>
                      <div className="text-[14px] font-semibold text-foreground leading-tight">{item.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
          {/* Note: an inline QR card used to live here, but the fixed
              bottom action bar covered it on mobile. Use the share drawer
              ("面对面扫码") to view the QR — that path is the only one
              that actually works on small screens. */}
        </div>
      </main>

      <div
        className="fixed left-0 right-0 z-20 pointer-events-none md:bottom-0!"
        style={{ bottom: 'calc(64px + env(safe-area-inset-bottom))' }}
      >
        <div className="h-12 bg-gradient-to-t from-background to-transparent" />
        <div className="bg-background px-5 sm:px-6 pt-2 pb-3 pointer-events-auto">
          <div className="flex gap-3 w-full md:max-w-md md:mx-auto">
            <button
              onClick={() => setIsEditing(true)}
              className="tap-target flex-1 py-3 sm:py-3.5 bg-secondary rounded-xl font-semibold text-[14px] text-foreground active:bg-foreground active:text-background hover:bg-foreground hover:text-background transition-colors"
            >
              编辑名片
            </button>
            <button
              onClick={() => setShowShareDiv(true)}
              className="tap-target flex-1 py-3 sm:py-3.5 bg-foreground rounded-xl font-semibold text-[14px] text-background active:opacity-80 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <Share className="w-4 h-4" />
              分享我的名片
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>{showShareDiv && <Suspense fallback={null}><ShareDrawer onClose={() => setShowShareDiv(false)} shareUrl={shareUrl} detailUrl={shareUrlFull} profile={profile} /></Suspense>}</AnimatePresence>
      <AnimatePresence>{isEditing && <Suspense fallback={null}><EditProfile profile={profile} onSave={(p) => { updateProfile(p); setIsEditing(false); }} onClose={() => setIsEditing(false)} /></Suspense>}</AnimatePresence>
    </div>
  );
}
