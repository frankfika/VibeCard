Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/card/card', text: '名片', icon: '🪪' },
      { pagePath: '/pages/threads/threads', text: '动态', icon: '✨' },
      { pagePath: '/pages/more/more', text: '更多', icon: '⚙️' },
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
