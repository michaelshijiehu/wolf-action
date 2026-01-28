Page({
  data: {
    activeTab: 'basic', // 'basic', 'roles', 'strategy'
  },

  onLoad() {},

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  }
});
