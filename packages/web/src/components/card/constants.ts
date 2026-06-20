export const AVATAR_SEEDS = ['Alex', 'Luna', 'Max', 'Zoe', 'Kai', 'Nova', 'Aria', 'Leo', 'Mia', 'Finn', 'Sage', 'River'];

export const MBTI_OPTIONS = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
];

export const ZODIAC_OPTIONS = [
  '♈️ 白羊座', '♉️ 金牛座', '♊️ 双子座', '♋️ 巨蟹座',
  '♌️ 狮子座', '♍️ 处女座', '♎️ 天秤座', '♏️ 天蝎座',
  '♐️ 射手座', '♑️ 摩羯座', '♒️ 水瓶座', '♓️ 双鱼座',
];

export const AGE_OPTIONS = [
  '05后', '00后', '95后', '90后', '85后', '80后', '70后',
];

export const LOCATION_PRESETS = [
  '远程 / Nomad', '北京', '上海', '杭州', '深圳', '广州', '成都',
  '香港', '台北', '新加坡', '硅谷', '纽约', '伦敦', '东京',
];

/** Backward-compatible helper: old stored values may start with "📍 ". */
export function stripLocationPrefix(value: string): string {
  return value.replace(/^📍\s*/, '');
}

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
