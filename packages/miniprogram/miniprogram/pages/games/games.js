const { allCards, getCardsByTags, shuffleArray, presets, tags, tagCategories } = require('../../utils/cards-data.js');
const store = require('../../utils/store.js');

Page({
  data: {
    currentCard: null,
    selectedPreset: null,
    selectedTags: [],
    showFilters: false,
    showHistory: false,
    tags: tags,
    tagCategories: tagCategories,
    presets: presets,
    history: [],
    historyCards: [],
    favorites: [],
    totalPlayed: 0,
    filteredCount: 0,
    isCurrentFav: false,
    isDrawing: false,
    cardAnimClass: '',
  },

  onLoad() {
    this.loadSession();
  },

  onShow() {
    this.loadSession();
  },

  loadSession() {
    const session = store.getGameSession();
    const history = session.history || [];
    this.setData({
      history,
      historyCards: allCards.filter(c => history.includes(c.id)),
      favorites: session.favorites || [],
      selectedPreset: session.presetId,
      selectedTags: session.selectedTags || [],
      totalPlayed: history.length,
    }, () => this.updateComputed());
  },

  getFilteredCards() {
    let cards;
    if (this.data.selectedPreset) {
      const preset = presets.find(p => p.id === this.data.selectedPreset);
      cards = preset ? getCardsByTags(preset.tags) : allCards;
    } else if (this.data.selectedTags.length > 0) {
      cards = getCardsByTags(this.data.selectedTags);
    } else {
      cards = allCards;
    }
    return cards.filter(c => !this.data.history.includes(c.id));
  },

  drawCard() {
    if (this.data.isDrawing) return;

    const cards = this.getFilteredCards();
    if (cards.length === 0) {
      wx.showToast({ title: '所有卡片已抽完', icon: 'none' });
      return;
    }

    // 开始洗牌动画
    this.setData({
      isDrawing: true,
      cardAnimClass: 'card-shuffling',
    });

    // 模拟洗牌后抽卡
    setTimeout(() => {
      const shuffled = shuffleArray(cards);
      const card = shuffled[0];
      store.addToHistory(card.id);
      const nextHistory = [...this.data.history, card.id];

      this.setData({
        isDrawing: false,
        cardAnimClass: 'card-enter',
        currentCard: card,
        history: nextHistory,
        historyCards: allCards.filter(c => nextHistory.includes(c.id)),
        totalPlayed: this.data.totalPlayed + 1,
      }, () => this.updateComputed());

      // 清除进入动画类
      setTimeout(() => {
        this.setData({ cardAnimClass: '' });
      }, 700);
    }, 600);
  },

  toggleFavorite() {
    if (!this.data.currentCard || this.data.isDrawing) return;
    const session = store.toggleFavorite(this.data.currentCard.id);
    this.setData({ favorites: session.favorites }, () => this.updateComputed());
  },

  toggleTag(e) {
    const tag = e.currentTarget.dataset.tag;
    const selected = this.data.selectedTags;
    if (selected.includes(tag)) {
      this.setData({ selectedTags: selected.filter(t => t !== tag), selectedPreset: null });
    } else {
      this.setData({ selectedTags: [...selected, tag], selectedPreset: null });
    }
    this.saveSession();
  },

  selectPreset(e) {
    const presetId = e.currentTarget.dataset.preset;
    this.setData({
      selectedPreset: this.data.selectedPreset === presetId ? null : presetId,
      selectedTags: [],
    });
    this.saveSession();
  },

  toggleFilters() {
    this.setData({ showFilters: !this.data.showFilters });
  },

  toggleHistory() {
    this.setData({ showHistory: !this.data.showHistory });
  },

  resetAll() {
    store.resetHistory();
    this.setData({
      history: [],
      historyCards: [],
      totalPlayed: 0,
      currentCard: null,
      isDrawing: false,
      cardAnimClass: '',
    }, () => this.updateComputed());
    wx.showToast({ title: '已重置', icon: 'success' });
  },

  updateComputed() {
    const filteredCount = this.getFilteredCards().length;
    const isCurrentFav = !!(this.data.currentCard && this.data.favorites.includes(this.data.currentCard.id));
    this.setData({ filteredCount, isCurrentFav });
  },

  saveSession() {
    store.setGameSession({
      presetId: this.data.selectedPreset,
      selectedTags: this.data.selectedTags,
    });
    this.updateComputed();
  },
});
