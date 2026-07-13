import { Twitter, MessageCircle, Github, Send, Mail, Globe, Linkedin, Link as LinkIcon, Wallet, MessageSquare } from 'lucide-react';

export const getSocialIcon = (platform: string) => {
  switch (platform.toLowerCase()) {
    case 'twitter':
    case 'x':
      return Twitter;
    case 'discord':
      return MessageCircle;
    case 'github':
      return Github;
    case 'telegram':
      return Send;
    case 'email':
      return Mail;
    case 'website':
      return Globe;
    case 'linkedin':
      return Linkedin;
    case 'wechat':
      return MessageSquare;
    case 'wallet':
      return Wallet;
    default:
      return LinkIcon;
  }
};

export const getSocialLabel = (platform: string) => {
  switch (platform.toLowerCase()) {
    case 'twitter':
    case 'x':
      return 'X';
    case 'discord':
      return 'Discord';
    case 'github':
      return 'GitHub';
    case 'telegram':
      return 'Telegram';
    case 'email':
      return 'Email';
    case 'website':
      return 'Website';
    case 'linkedin':
      return 'LinkedIn';
    case 'wechat':
      return 'WeChat';
    case 'wallet':
      return 'Wallet';
    default:
      return platform.charAt(0).toUpperCase() + platform.slice(1);
  }
};