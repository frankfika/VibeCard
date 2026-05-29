/**
 * Companion type categories and subcategories
 * Defines all available companion types for the vibecard mini-program
 */

const companionTypes = {
  sport: {
    id: 'sport',
    name: '运动搭子',
    icon: '🏃',
    color: '#FF6B6B',
    subcategories: [
      { id: 'running', name: '跑步' },
      { id: 'fitness', name: '健身' },
      { id: 'hiking', name: '徒步' },
      { id: 'swimming', name: '游泳' },
      { id: 'ball', name: '球类' },
      { id: 'yoga', name: '瑜伽' }
    ]
  },
  travel: {
    id: 'travel',
    name: '旅行搭子',
    icon: '✈️',
    color: '#4ECDC4',
    subcategories: [
      { id: 'nearby', name: '周边游' },
      { id: 'longtrip', name: '长途旅行' },
      { id: 'selfdrive', name: '自驾' },
      { id: 'camping', name: '露营' }
    ]
  },
  food: {
    id: 'food',
    name: '饭搭子',
    icon: '🍜',
    color: '#FFE66D',
    subcategories: [
      { id: 'explore', name: '探店' },
      { id: 'cooking', name: '做饭' },
      { id: 'afternoon', name: '下午茶' },
      { id: 'latenight', name: '夜宵' }
    ]
  },
  study: {
    id: 'study',
    name: '学习搭子',
    icon: '📚',
    color: '#95E1D3',
    subcategories: [
      { id: 'postgrad', name: '考研' },
      { id: 'civilservice', name: '考公' },
      { id: 'language', name: '语言学习' },
      { id: 'bookclub', name: '读书会' }
    ]
  },
  movie: {
    id: 'movie',
    name: '观影搭子',
    icon: '🎬',
    color: '#A8E6CF',
    subcategories: [
      { id: 'cinema', name: '电影' },
      { id: 'theater', name: '话剧' },
      { id: 'concert', name: '音乐会' },
      { id: 'exhibition', name: '展览' }
    ]
  },
  game: {
    id: 'game',
    name: '游戏搭子',
    icon: '🎮',
    color: '#B4A7D6',
    subcategories: [
      { id: 'boardgame', name: '桌游' },
      { id: 'videogame', name: '电子游戏' },
      { id: 'script', name: '剧本杀' },
      { id: 'escape', name: '密室' }
    ]
  },
  pet: {
    id: 'pet',
    name: '遛宠搭子',
    icon: '🐕',
    color: '#FFB6C1',
    subcategories: [
      { id: 'dogwalk', name: '遛狗' },
      { id: 'catcafe', name: '猫咖' },
      { id: 'petparty', name: '宠物聚会' }
    ]
  },
  hobby: {
    id: 'hobby',
    name: '兴趣搭子',
    icon: '🎨',
    color: '#FFDAB9',
    subcategories: [
      { id: 'painting', name: '画画' },
      { id: 'photography', name: '摄影' },
      { id: 'handcraft', name: '手作' },
      { id: 'music', name: '音乐' }
    ]
  }
};

/**
 * Get flat list of all categories
 * @returns {Array} Array of category objects
 */
function getAllCategories() {
  return Object.values(companionTypes);
}

/**
 * Get flat list of all subcategories across all categories
 * @returns {Array} Array of subcategory objects with parent category info
 */
function getAllSubcategories() {
  const subcategories = [];

  Object.values(companionTypes).forEach(category => {
    category.subcategories.forEach(sub => {
      subcategories.push({
        ...sub,
        categoryId: category.id,
        categoryName: category.name,
        categoryIcon: category.icon,
        categoryColor: category.color
      });
    });
  });

  return subcategories;
}

/**
 * Get category by ID
 * @param {string} categoryId - Category ID
 * @returns {Object|null} Category object or null if not found
 */
function getCategory(categoryId) {
  return companionTypes[categoryId] || null;
}

/**
 * Get subcategory by ID
 * @param {string} categoryId - Category ID
 * @param {string} subcategoryId - Subcategory ID
 * @returns {Object|null} Subcategory object with category info or null if not found
 */
function getSubcategory(categoryId, subcategoryId) {
  const category = getCategory(categoryId);
  if (!category) {
    return null;
  }

  const subcategory = category.subcategories.find(sub => sub.id === subcategoryId);
  if (!subcategory) {
    return null;
  }

  return {
    ...subcategory,
    categoryId: category.id,
    categoryName: category.name,
    categoryIcon: category.icon,
    categoryColor: category.color
  };
}

/**
 * Get category name by ID
 * @param {string} categoryId - Category ID
 * @returns {string} Category name or empty string
 */
function getCategoryName(categoryId) {
  const category = getCategory(categoryId);
  return category ? category.name : '';
}

/**
 * Get subcategory name by ID
 * @param {string} categoryId - Category ID
 * @param {string} subcategoryId - Subcategory ID
 * @returns {string} Subcategory name or empty string
 */
function getSubcategoryName(categoryId, subcategoryId) {
  const subcategory = getSubcategory(categoryId, subcategoryId);
  return subcategory ? subcategory.name : '';
}

/**
 * Search categories and subcategories by keyword
 * @param {string} keyword - Search keyword
 * @returns {Array} Array of matching categories and subcategories
 */
function searchCompanionTypes(keyword) {
  if (!keyword || keyword.trim() === '') {
    return [];
  }

  const results = [];
  const searchTerm = keyword.toLowerCase();

  Object.values(companionTypes).forEach(category => {
    // Match category name
    if (category.name.toLowerCase().includes(searchTerm)) {
      results.push({
        type: 'category',
        ...category
      });
    }

    // Match subcategory names
    category.subcategories.forEach(sub => {
      if (sub.name.toLowerCase().includes(searchTerm)) {
        results.push({
          type: 'subcategory',
          ...sub,
          categoryId: category.id,
          categoryName: category.name,
          categoryIcon: category.icon,
          categoryColor: category.color
        });
      }
    });
  });

  return results;
}

module.exports = {
  companionTypes,
  getAllCategories,
  getAllSubcategories,
  getCategory,
  getSubcategory,
  getCategoryName,
  getSubcategoryName,
  searchCompanionTypes
};
