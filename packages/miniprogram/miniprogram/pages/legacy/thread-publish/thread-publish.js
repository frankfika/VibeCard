const store = require('../../utils/store.js');
const nav = require('../../utils/nav.js');

const TAGS = ['Work', 'Life', 'Web3', 'Thoughts'];

Page({
  data: {
    content: '',
    selectedTag: 'Work',
    tags: TAGS,
    imagePreviews: [],
    authorAvatar: '',
    isPublishing: false,
    showEmptyTip: false,
  },

  onLoad() {
    const profile = store.getProfile();
    this.setData({
      authorAvatar: profile.avatar || '',
    });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value, showEmptyTip: false });
  },

  selectTag(e) {
    this.setData({ selectedTag: e.currentTarget.dataset.tag });
  },

  chooseImage() {
    if (this.data.imagePreviews.length >= 3) {
      wx.showToast({ title: '最多3张图片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: 3 - this.data.imagePreviews.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = res.tempFiles.map(f => f.tempFilePath);
        this.setData({
          imagePreviews: [...this.data.imagePreviews, ...paths],
        });
      },
      fail: (err) => {
        const msg = String(err && err.errMsg);
        if (msg.includes('cancel') || msg.includes('fail auth')) return;
        console.warn('[chooseMedia] fail:', err);
      },
    });
  },

  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    const previews = this.data.imagePreviews.filter((_, i) => i !== index);
    this.setData({ imagePreviews: previews });
  },

  goBack() {
    nav.navigateBack();
  },

  handlePublish() {
    // 内容验证
    if (!this.data.content.trim() && this.data.imagePreviews.length === 0) {
      this.setData({ showEmptyTip: true });
      wx.showToast({ title: '请输入内容或添加图片', icon: 'none' });
      return;
    }

    // 防止重复提交
    if (this.data.isPublishing) return;

    this.setData({ isPublishing: true });

    const profile = store.getProfile();
    const thread = {
      id: Date.now().toString(),
      author: {
        name: profile.name || 'Anonymous',
        avatar: profile.avatar || '',
        handle: profile.handle || '0x...',
      },
      content: this.data.content.trim(),
      images: this.data.imagePreviews.length > 0 ? this.data.imagePreviews : [],
      tags: [this.data.selectedTag],
      likes: 0,
      timestamp: '刚刚',
      isLiked: false,
    };

    // 模拟发布延迟，增强反馈感
    setTimeout(() => {
      store.addThread(thread);
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => {
        this.setData({ isPublishing: false });
        nav.navigateBack();
      }, 600);
    }, 400);
  },
});
