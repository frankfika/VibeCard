export const AVATAR_SEEDS = ['Alex', 'Luna', 'Max', 'Zoe', 'Kai', 'Nova', 'Aria', 'Leo', 'Mia', 'Finn', 'Sage', 'River'];

export const LOOKING_FOR_OPTIONS = [
  '🚀 找合伙人',
  '💼 寻找机会',
  '🤝 寻求投资',
  '☕️ 随便聊聊',
  '💡 交流想法',
  '👥 招募队友',
];

export const EVENT_OPTIONS = [
  'ETHGlobal',
  'Devcon',
  'Token2049',
  'Hackathon',
  'Remote',
  'Local',
];

export const TAG_OPTIONS = [
  '🛠️ Builder', '🎨 Designer', '💡 Founder', '💻 Developer', '🔍 Researcher',
  '🤝 Community', '📦 Product', '🤖 AI', '🌐 Web3', '✍️ Creator',
  '💰 Investor', '🚀 Indie Hacker', '🧠 Strategy', '📱 Mobile', '🌍 Remote',
];

export function createTag(label: string) {
  return { label: label.trim(), icon: '' };
}

export function addTagItem(
  currentTags: { label: string; icon: string }[],
  rawLabel: string,
) {
  const label = rawLabel.trim();
  if (!label) return currentTags;
  const exists = currentTags.some(tag => tag.label.toLowerCase() === label.toLowerCase());
  if (exists) return currentTags;
  return [...currentTags, createTag(label)].slice(0, 5);
}

export function removeTagItem(
  currentTags: { label: string; icon: string }[],
  rawLabel: string,
) {
  return currentTags.filter(tag => tag.label !== rawLabel);
}
