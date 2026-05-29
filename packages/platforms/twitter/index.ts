import { detectBrowser } from '../../../web/src/lib/compatibility/browser';

// Twitter/X Web App / Card integration utilities
// Reference: https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards

interface TwitterWidget {
  ready: (callback: () => void) => void;
  widgets: {
    load: () => void;
    createShareButton: (
      url: string,
      element: HTMLElement,
      options?: Record<string, unknown>
    ) => Promise<HTMLElement>;
    createFollowButton: (
      screenName: string,
      element: HTMLElement,
      options?: Record<string, unknown>
    ) => Promise<HTMLElement>;
    createTweetEmbed: (
      tweetId: string,
      element: HTMLElement,
      options?: Record<string, unknown>
    ) => Promise<HTMLElement>;
  };
}

declare global {
  interface Window {
    twttr?: TwitterWidget;
  }
}

export {};

export function isTwitterBrowser(): boolean {
  return detectBrowser().imBrowser === 'twitter';
}

export function loadTwitterWidgets(): Promise<void> {
  return new Promise((resolve) => {
    if (window.twttr) {
      window.twttr.ready(() => {
        window.twttr!.widgets.load();
        resolve();
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://platform.twitter.com/widgets.js';
    script.async = true;
    script.onload = () => {
      window.twttr?.ready(() => {
        window.twttr!.widgets.load();
        resolve();
      });
    };
    document.head.appendChild(script);
  });
}

export function getTwitterShareUrl(params: {
  text?: string;
  url?: string;
  hashtags?: string[];
  via?: string;
}): string {
  const url = new URL('https://twitter.com/intent/tweet');
  if (params.text) url.searchParams.set('text', params.text);
  if (params.url) url.searchParams.set('url', params.url);
  if (params.hashtags?.length) url.searchParams.set('hashtags', params.hashtags.join(','));
  if (params.via) url.searchParams.set('via', params.via);
  return url.toString();
}

export function openTwitterShare(params: {
  text?: string;
  url?: string;
  hashtags?: string[];
  via?: string;
}): void {
  const shareUrl = getTwitterShareUrl(params);
  window.open(shareUrl, '_blank', 'width=550,height=420');
}

export function setTwitterCardMeta(meta: {
  card?: string;
  site?: string;
  creator?: string;
  title?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
}) {
  const setMeta = (name: string, content?: string) => {
    if (!content) return;
    let element = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
    if (!element) {
      element = document.createElement('meta');
      element.name = name;
      document.head.appendChild(element);
    }
    element.content = content;
  };

  setMeta('twitter:card', meta.card || 'summary_large_image');
  setMeta('twitter:site', meta.site);
  setMeta('twitter:creator', meta.creator);
  setMeta('twitter:title', meta.title);
  setMeta('twitter:description', meta.description);
  setMeta('twitter:image', meta.image);
  setMeta('twitter:image:alt', meta.imageAlt);
}

export function updateTwitterCardForProfile(profile: {
  name?: string;
  bio?: string;
  avatar?: string;
  handle?: string;
}): void {
  setTwitterCardMeta({
    card: 'summary_large_image',
    title: `${profile.name || 'Someone'} on vibecard`,
    description: profile.bio || 'Check out my vibecard profile!',
    image: profile.avatar,
    creator: profile.handle?.replace('@', ''),
  });
}
