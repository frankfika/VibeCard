export { allCards, getCardsByTags, shuffleArray } from './cards';
export type { Card } from './cards';
export { tags, tagCategories, presets, getTagsByCategory } from './tags';
export type { TagDefinition, TagCategory, Preset } from './tags';
export { companionTypes } from './companion-types';
export type { CompanionCategory, Activity } from './companion-types';

// VibeCard 2.0 domain contracts (task 0.1). Types only — no runtime cost.
export type {
  VibeCard,
  VibeCardHighlight,
  ContactMethod,
  ContactMethodKind,
  Memory,
  MemoryKind,
  MemoryVisibility,
  MemoryStatus,
  ConnectionRequest,
  ConnectionAction,
} from './vibe';
export type { NowItem, NowItemStatus, NowItemTopic } from './now';
export {
  isNowItemActive,
  filterActiveNow,
  latestActiveNow,
  canProjectMemoryToNow,
} from './now';
export * as vibeFixtures from './fixtures/vibe';
export * as nowFixtures from './fixtures/now';
