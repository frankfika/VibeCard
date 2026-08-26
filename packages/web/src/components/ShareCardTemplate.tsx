import { forwardRef } from 'react';
import {
  Hexagon, Zap, MapPin, Twitter, MessageCircle, Github,
  Send, Mail, Globe, Linkedin, Link as LinkIcon
} from 'lucide-react';
import { type Profile, type Contact } from '../store';

import { getSocialIcon, getSocialLabel } from '../lib/social';

export type CardTheme = 'dark' | 'light' | 'neon' | 'retro' | 'chill';
export type CardLayout = 'center' | 'left';
export type CardOrientation = 'portrait' | 'landscape';

export interface CardVisibleFields {
  avatar: boolean;
  name: boolean;
  handle: boolean;
  event: boolean;
  tags: boolean;
  bio: boolean;
  specialTags: boolean;
  verified: boolean;
  highlights: boolean;
  qr: boolean;
}

export interface ShareCardProps {
  profile: Profile;
  qrDataUrl?: string;
  theme?: CardTheme;
  layout?: CardLayout;
  orientation?: CardOrientation;
  visible?: Partial<CardVisibleFields>;
}

const DEFAULT_VISIBLE: CardVisibleFields = {
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
};

export const ShareCardTemplate = forwardRef<HTMLDivElement, ShareCardProps>(({
  profile,
  qrDataUrl,
  theme = 'dark',
  layout = 'center',
  orientation = 'portrait',
  visible,
}, ref) => {
  const show = { ...DEFAULT_VISIBLE, ...visible };
  const avatarUrl = profile.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${profile.name}&backgroundColor=transparent`;
  const tags = profile.tags?.slice(0, 8) ?? [];
  const highlights = profile.highlights?.filter(h => h.title).slice(0, 4) ?? [];

  const isPortrait = orientation === 'portrait';
  const isCenter = layout === 'center' && isPortrait;

  const cardWidth = isPortrait ? 800 : 1100;
  const cardHeight = isPortrait ? 1100 : 800;

  const tokens = {
    dark: {
      pageBg: '#09090b',
      cardBg: '#18181b',
      cardBorder: 'rgba(255,255,255,0.09)',
      primary: '#fafafa',
      secondary: '#a1a1aa',
      muted: '#71717a',
      tagBg: 'rgba(255,255,255,0.08)',
      pillBg: 'rgba(255,255,255,0.05)',
      avatarBg: '#1a1a1a',
      qrBg: '#ffffff',
    },
    light: {
      pageBg: '#f4f4f5',
      cardBg: '#ffffff',
      cardBorder: 'rgba(0,0,0,0.08)',
      primary: '#18181b',
      secondary: '#52525b',
      muted: '#a1a1aa',
      tagBg: '#f4f4f5',
      pillBg: '#f4f4f5',
      avatarBg: '#ffffff',
      qrBg: '#ffffff',
    },
    neon: {
      pageBg: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
      cardBg: 'rgba(255,255,255,0.07)',
      cardBorder: 'rgba(255,255,255,0.12)',
      primary: '#ffffff',
      secondary: 'rgba(255,255,255,0.72)',
      muted: 'rgba(255,255,255,0.52)',
      tagBg: 'rgba(255,255,255,0.10)',
      pillBg: 'rgba(255,255,255,0.08)',
      avatarBg: '#1a1a1a',
      qrBg: '#ffffff',
    },
    retro: {
      pageBg: '#EAE0D5',
      cardBg: '#F5F0E8',
      cardBorder: 'rgba(62,54,46,0.14)',
      primary: '#3E362E',
      secondary: '#5C5346',
      muted: '#8C7E6D',
      tagBg: '#EAE0D5',
      pillBg: '#EAE0D5',
      avatarBg: '#ffffff',
      qrBg: '#ffffff',
    },
    chill: {
      pageBg: '#E1EFE6',
      cardBg: '#F4FAF6',
      cardBorder: 'rgba(45,71,57,0.14)',
      primary: '#2D4739',
      secondary: '#4A6B58',
      muted: '#6B8E7D',
      tagBg: '#E1EFE6',
      pillBg: '#E1EFE6',
      avatarBg: '#ffffff',
      qrBg: '#ffffff',
    },
  }[theme];

  const socialItems = (profile.contacts || []).map(contact => {
    const Icon = getSocialIcon(contact.platform);
    return {
      key: contact.id || contact.platform,
      icon: Icon,
      label: getSocialLabel(contact.platform),
      value: contact.value,
    };
  });

  const fallbackSocial = null;

  const visibleCount = [
    show.avatar,
    show.name && profile.name,
    show.handle && profile.handle,
    show.event && profile.event,
    show.tags && tags.length > 0,
    show.bio && profile.bio,
    show.specialTags && (profile.mbti || profile.zodiac || profile.age || profile.location),
    show.verified && socialItems.length > 0,
    show.highlights && highlights.length > 0,
    show.qr,
  ].filter(Boolean).length;
  const isSparse = visibleCount <= 5;

  const renderSocials = () => {
    if (!show.verified || socialItems.length === 0) return null;
    return (
      <div className={`flex flex-wrap ${isCenter ? 'justify-center' : 'justify-start'} gap-2.5`}>
        {socialItems.map(s => (
          <div
            key={s.key}
            className="flex items-center gap-2 px-3 py-2 rounded-2xl border"
            style={{ background: tokens.pillBg, borderColor: tokens.cardBorder }}
          >
            <s.icon className="w-4 h-4" style={{ color: tokens.secondary }} />
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: tokens.muted }}>{s.label}</span>
              <span className="text-[12px] font-bold leading-tight" style={{ color: tokens.primary }}>{s.value}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderTags = () => {
    if (!show.tags) return null;
    return tags.length > 0 ? (
      <div className={`flex flex-wrap ${isCenter ? 'justify-center' : 'justify-start'} gap-2`}>
        {tags.map(tag => (
          <span
            key={tag.label}
            className="px-3 py-1.5 rounded-xl text-[13px] font-bold border"
            style={{ background: tokens.tagBg, color: tokens.primary, borderColor: tokens.cardBorder }}
          >
            {tag.label}
          </span>
        ))}
      </div>
    ) : null;
  };

  const renderBio = () => {
    if (!show.bio || !profile.bio) return null;
    return (
      <div
        className={`rounded-2xl p-4 text-[16px] leading-relaxed font-medium italic ${isCenter ? 'text-center' : 'text-left'}`}
        style={{ background: tokens.pillBg, color: tokens.secondary }}
      >
        {profile.bio}
      </div>
    );
  };

  const renderSpecialTags = () => {
    if (!show.specialTags) return null;
    if (!profile.mbti && !profile.zodiac && !profile.age && !profile.location) return null;
    return (
      <div className={`flex flex-wrap ${isCenter ? 'justify-center' : 'justify-start'} gap-2`}>
        {profile.mbti && (
          <span className="px-3 py-1.5 rounded-full text-[14px] font-black shadow-sm" style={{ background: tokens.tagBg, color: tokens.primary }}>
            {profile.mbti}
          </span>
        )}
        {profile.zodiac && (
          <span className="px-3 py-1.5 rounded-full text-[14px] font-bold shadow-sm" style={{ background: tokens.tagBg, color: tokens.primary }}>
            {profile.zodiac}
          </span>
        )}
        {profile.age && (
          <span className="px-3 py-1.5 rounded-full text-[14px] font-bold shadow-sm" style={{ background: tokens.tagBg, color: tokens.primary }}>
            {profile.age}
          </span>
        )}
        {profile.location && (
          <span className="px-3 py-1.5 rounded-full text-[14px] font-bold shadow-sm flex items-center gap-1" style={{ background: tokens.tagBg, color: tokens.primary }}>
            <MapPin className="w-3 h-3" />
            {profile.location.replace('📍 ', '')}
          </span>
        )}
      </div>
    );
  };

  const renderHighlights = () => {
    if (!show.highlights) return null;
    return highlights.length > 0 ? (
      <div className="space-y-2">
        {highlights.map(item => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-2xl p-3 border"
            style={{ background: tokens.pillBg, borderColor: tokens.cardBorder }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[18px] shrink-0"
              style={{ background: tokens.tagBg }}
            >
              {item.icon}
            </div>
            <div className="text-[14px] font-semibold truncate" style={{ color: tokens.primary }}>{item.title}</div>
          </div>
        ))}
      </div>
    ) : null;
  };

  const renderQR = (size = 88) => {
    if (!show.qr) return null;
    return (
      <div
        className="rounded-2xl p-1.5 shrink-0 shadow-xl"
        style={{ background: tokens.qrBg, width: size, height: size }}
      >
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR" className="w-full h-full object-contain rounded-xl" />
        ) : (
          <div className="w-full h-full rounded-xl flex items-center justify-center text-center text-[10px] font-bold text-black/50">
            QR<br/>Code
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={ref}
      className="relative overflow-hidden flex items-center justify-center font-sans"
      style={{
        width: cardWidth,
        height: cardHeight,
        backgroundColor: theme === 'neon' ? undefined : tokens.pageBg,
        backgroundImage: theme === 'neon' ? tokens.pageBg : undefined,
      }}
    >
      {theme === 'neon' && (
        <>
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600/30 rounded-full mix-blend-screen filter blur-[100px] opacity-70 pointer-events-none" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-600/30 rounded-full mix-blend-screen filter blur-[120px] opacity-70 pointer-events-none" />
        </>
      )}

      {isPortrait ? (
        <div
          className={`w-[calc(100%-64px)] h-[calc(100%-64px)] rounded-[40px] p-8 flex flex-col shadow-2xl ${isSparse ? 'justify-center' : 'justify-start'}`}
          style={{ background: tokens.cardBg, border: `1px solid ${tokens.cardBorder}` }}
        >
          {isSparse ? (
            <div className={`flex flex-col gap-6 overflow-hidden ${isCenter ? 'items-center text-center' : 'items-start text-left'}`}>
              {show.avatar && (
                <img
                  src={avatarUrl}
                  crossOrigin="anonymous"
                  className="w-28 h-28 rounded-[28px] object-cover shadow-lg"
                  style={{ background: tokens.avatarBg }}
                  alt="avatar"
                />
              )}
              {show.name && (
                <h1 className="text-[44px] font-black leading-none" style={{ color: tokens.primary }}>
                  {profile.name || 'Anonymous'}
                </h1>
              )}
              {show.handle && profile.handle && (
                <div className="text-[22px] font-medium" style={{ color: tokens.secondary }}>
                  {profile.handle}
                </div>
              )}
              {show.event && profile.event && (
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-bold border"
                  style={{ background: tokens.tagBg, color: tokens.secondary, borderColor: tokens.cardBorder }}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {profile.event}
                </div>
              )}
              {renderTags()}
              {renderBio()}
              {renderSpecialTags()}
              {renderSocials()}
              {renderHighlights()}
              {show.qr && (
                <div className="flex flex-col items-center gap-2 mt-2">
                  {renderQR(96)}
                  <div className="text-[15px] font-bold" style={{ color: tokens.secondary }}>扫码查看更多</div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Identity Header */}
              <div className={`flex flex-col ${isCenter ? 'items-center text-center' : 'items-start text-left'} shrink-0 mb-5`}>
                {show.avatar && (
                  <img
                    src={avatarUrl}
                    crossOrigin="anonymous"
                    className="w-28 h-28 rounded-[28px] object-cover mb-4 shadow-lg"
                    style={{ background: tokens.avatarBg }}
                    alt="avatar"
                  />
                )}
                {show.name && (
                  <h1 className="text-[44px] font-black leading-none mb-2" style={{ color: tokens.primary }}>
                    {profile.name || 'Anonymous'}
                  </h1>
                )}
                {show.handle && profile.handle && (
                  <div className="text-[22px] font-medium mb-3" style={{ color: tokens.secondary }}>
                    {profile.handle}
                  </div>
                )}
                {show.event && profile.event && (
                  <div
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-bold border"
                    style={{ background: tokens.tagBg, color: tokens.secondary, borderColor: tokens.cardBorder }}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    {profile.event}
                  </div>
                )}
              </div>

              {/* Main Content */}
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4">
                {renderTags()}
                {renderBio()}
                {renderSpecialTags()}
                {renderSocials()}
                {renderHighlights()}
              </div>

              {/* Footer */}
              {show.qr && (
                <div
                  className="mt-5 pt-5 shrink-0 flex items-center justify-between border-t"
                  style={{ borderColor: tokens.cardBorder }}
                >
                  <div>
                    <div className="text-[22px] font-black" style={{ color: tokens.primary }}>来连接</div>
                    <div className="text-[13px] font-medium" style={{ color: tokens.secondary }}>扫码查看完整主页与动态</div>
                  </div>
                  {renderQR(88)}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div
          className="w-[calc(100%-64px)] h-[calc(100%-64px)] rounded-[36px] p-8 flex flex-row gap-8 shadow-2xl"
          style={{ background: tokens.cardBg, border: `1px solid ${tokens.cardBorder}` }}
        >
          {/* Left Column */}
          <div
            className="w-[320px] shrink-0 flex flex-col items-center text-center justify-center border-r pr-8"
            style={{ borderColor: tokens.cardBorder }}
          >
            {show.avatar && (
              <img
                src={avatarUrl}
                crossOrigin="anonymous"
                className="w-36 h-36 rounded-[32px] object-cover mb-5 shadow-xl"
                style={{ background: tokens.avatarBg }}
                alt="avatar"
              />
            )}
            {show.name && (
              <h1 className="text-[40px] font-black leading-none mb-2" style={{ color: tokens.primary }}>
                {profile.name || 'Anonymous'}
              </h1>
            )}
            {show.handle && profile.handle && (
              <div className="text-[20px] font-medium mb-4" style={{ color: tokens.secondary }}>
                {profile.handle}
              </div>
            )}
            {show.event && profile.event && (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-bold border mb-4"
                style={{ background: tokens.tagBg, color: tokens.secondary, borderColor: tokens.cardBorder }}
              >
                <MapPin className="w-3.5 h-3.5" />
                {profile.event}
              </div>
            )}
            {renderTags()}
            {show.qr && <div className="mt-6">{renderQR(96)}</div>}
          </div>

          {/* Right Column */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-4 overflow-hidden">
            {renderBio()}
            {renderSpecialTags()}
            {renderSocials()}
            {renderHighlights()}
          </div>
        </div>
      )}
    </div>
  );
});
