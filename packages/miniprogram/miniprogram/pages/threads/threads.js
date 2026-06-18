const store = require('../../utils/store.js');
const nav = require('../../utils/nav.js');

const TAGS = ['All', 'Work', 'Life', 'Web3', 'Thoughts'];

const MOCK_THREADS = [
  {
    id: '1',
    author: { name: 'Alex Chen', avatar: '', handle: '0x1234...5678' },
    content: '刚刚完成了 vibecard 的 2.0 设计系统重构，采用了更现代的毛玻璃风格和物理弹簧动画。感觉整个应用变得更有呼吸感了。',
    images: [],
    tags: ['Work', 'Web3'],
    likes: 24,
    timestamp: '2小时前',
    isLiked: false,
  },
  {
    id: '2',
    author: { name: 'Sarah Wang', avatar: '', handle: 'sarah.eth' },
    content: '今天在咖啡馆里遇到了两个同样在做独立开发的 Builder。Web3 的圈子真小，但是大家都好有热情！',
    tags: ['Life', 'Thoughts'],
    likes: 12,
    timestamp: '5小时前',
    isLiked: true,
  },
];

Page({
  data: {
    tags: TAGS,
    activeTag: 'All',
    threads: [],
    filteredThreads: [],
    showPublish: false,
    animatingLikeId: null,
    cardAnimated: false,
  },

  onLoad() {
    this.loadThreads();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.loadThreads();
  },

  onReady() {
    // 触发卡片进入动画
    setTimeout(() => {
      this.setData({ cardAnimated: true });
    }, 100);
  },

  loadThreads() {
    let threads = store.getThreads();
    if (threads.length === 0) {
      threads = MOCK_THREADS;
      wx.setStorageSync('vibecard_threads', threads);
    }
    const filteredThreads = this.computeFilteredThreads(threads, this.data.activeTag);
    this.setData({ threads, filteredThreads, cardAnimated: false });
    // 重新触发动画
    setTimeout(() => {
      this.setData({ cardAnimated: true });
    }, 50);
  },

  selectTag(e) {
    const activeTag = e.currentTarget.dataset.tag;
    const filteredThreads = this.computeFilteredThreads(this.data.threads, activeTag);
    this.setData({ activeTag, filteredThreads, cardAnimated: false });
    // 切换标签时重新触发动画
    setTimeout(() => {
      this.setData({ cardAnimated: true });
    }, 50);
  },

  computeFilteredThreads(threads, activeTag) {
    if (activeTag === 'All') return threads;
    return threads.filter(t => t.tags.includes(activeTag));
  },

  handleLike(e) {
    const id = e.currentTarget.dataset.id;
    // 设置点赞动画状态
    this.setData({ animatingLikeId: id });
    const threads = store.toggleLikeThread(id);
    const filteredThreads = this.computeFilteredThreads(threads, this.data.activeTag);
    this.setData({ threads, filteredThreads });
    // 清除动画状态
    setTimeout(() => {
      this.setData({ animatingLikeId: null });
    }, 400);
  },

  openPublish() {
    nav.navigateTo('/pages/thread-publish/thread-publish');
  },

  previewImage(e) {
    const { url, urls } = e.currentTarget.dataset;
    wx.previewImage({ current: url, urls });
  },
});
