Component({
  data: {
    selected: 0,
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
