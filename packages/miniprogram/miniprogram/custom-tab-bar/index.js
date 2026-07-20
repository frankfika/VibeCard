Component({
  data: {
    selected: 0,
    hidden: false, // 访客分享视图下由页面置为 true，隐藏整个 tabBar
    list: [
      { pagePath: '/pages/card/card', text: '名片', icon: '/images/tab_card.png', iconActive: '/images/tab_card_active.png' },
      { pagePath: '/pages/requests/requests', text: '请求', icon: '/images/tab_requests.png', iconActive: '/images/tab_requests_active.png' },
      { pagePath: '/pages/vibe/vibe', text: 'Vibe', icon: '/images/tab_vibe.png', iconActive: '/images/tab_vibe_active.png' },
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
