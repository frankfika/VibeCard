Component({
  data: {
    selected: 0,
    hidden: false, // 访客分享视图下由页面置为 true，隐藏整个 tabBar
    list: [
      { pagePath: '/pages/card/card', text: '名片', icon: '🪪' },
      { pagePath: '/pages/requests/requests', text: '请求', icon: '📥' },
      { pagePath: '/pages/vibe/vibe', text: 'Vibe', icon: '✨' },
    ]
  },
  methods: {
    switchTab(e) {
      const { index, path } = e.currentTarget.dataset;
      wx.switchTab({ url: path });
      this.setData({ selected: index });
    }
  }
});
