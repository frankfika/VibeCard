export interface CompanionCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  subcategories: { id: string; name: string }[];
}

export const companionTypes: CompanionCategory[] = [
  { id: 'sport', name: '运动', icon: '', color: '#FF6B6B', subcategories: [{ id: 'running', name: '跑步' }, { id: 'fitness', name: '健身' }, { id: 'hiking', name: '徒步' }, { id: 'swimming', name: '游泳' }, { id: 'ball', name: '球类' }, { id: 'yoga', name: '瑜伽' }] },
  { id: 'travel', name: '旅行', icon: '', color: '#4ECDC4', subcategories: [{ id: 'nearby', name: '周边游' }, { id: 'longtrip', name: '长途旅行' }, { id: 'selfdrive', name: '自驾' }, { id: 'camping', name: '露营' }] },
  { id: 'food', name: '饭搭子', icon: '', color: '#FFE66D', subcategories: [{ id: 'explore', name: '探店' }, { id: 'cooking', name: '做饭' }, { id: 'afternoon', name: '下午茶' }, { id: 'latenight', name: '夜宵' }] },
  { id: 'study', name: '学习', icon: '', color: '#95E1D3', subcategories: [{ id: 'postgrad', name: '考研' }, { id: 'civilservice', name: '考公' }, { id: 'language', name: '语言学习' }, { id: 'bookclub', name: '读书会' }] },
  { id: 'movie', name: '观影', icon: '', color: '#A8E6CF', subcategories: [{ id: 'cinema', name: '电影' }, { id: 'theater', name: '话剧' }, { id: 'concert', name: '音乐会' }, { id: 'exhibition', name: '展览' }] },
  { id: 'game', name: '游戏', icon: '', color: '#B4A7D6', subcategories: [{ id: 'boardgame', name: '桌游' }, { id: 'videogame', name: '电子游戏' }, { id: 'script', name: '剧本杀' }, { id: 'escape', name: '密室' }] },
  { id: 'pet', name: '遛宠', icon: '', color: '#FFB6C1', subcategories: [{ id: 'dogwalk', name: '遛狗' }, { id: 'catcafe', name: '猫咖' }, { id: 'petparty', name: '宠物聚会' }] },
  { id: 'hobby', name: '兴趣', icon: '', color: '#FFDAB9', subcategories: [{ id: 'painting', name: '画画' }, { id: 'photography', name: '摄影' }, { id: 'handcraft', name: '手作' }, { id: 'music', name: '音乐' }] },
];

export interface Activity {
  id: string;
  title: string;
  category: string;
  subcategory: string;
  location: string;
  time: string;
  participants: number;
  maxParticipants: number;
  avatar: string;
  creator: string;
}

// mockActivities removed — activities are now loaded from chain/backend only
export const mockActivities: Activity[] = [];
