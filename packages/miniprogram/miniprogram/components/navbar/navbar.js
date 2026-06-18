Component({
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: false },
    backDelta: { type: Number, value: 1 },
    background: { type: String, value: 'rgba(255,255,255,0.85)' },
    blur: { type: String, value: '40rpx' }
  },
  data: {
    statusBarHeight: 0,
    navBarHeight: 44
  },
  lifetimes: {
    attached() {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
      const deviceInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : {};
      this.setData({
        statusBarHeight: windowInfo.statusBarHeight || 20,
        navBarHeight: deviceInfo.platform === 'ios' ? 44 : 48
      });
    }
  },
  methods: {
    onBack() {
      wx.navigateBack({ delta: this.data.backDelta });
    }
  }
});
