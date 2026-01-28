// miniprogram/pages/records/records.js
Page({
  data: {
    records: [],
    page: 0,
    pageSize: 10,
    hasMoreRecords: true,
    loading: false
  },

  onLoad() {
    this.loadRecords();
  },

  async loadRecords() {
    if (!this.data.hasMoreRecords || this.data.loading) return;

    this.setData({ loading: true });
    wx.showLoading({ title: '加载中' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'getGameRecords',
          page: this.data.page,
          pageSize: this.data.pageSize
        }
      });

      console.log('Call Function getGameRecords res:', res);
      if (res.result && res.result.success) {
        console.log('Records received:', res.result.records.length);
        const newRecords = res.result.records.map(record => ({
          ...record,
          record_date: new Date(record.record_date).toLocaleString()
        }));

        this.setData({
          records: this.data.records.concat(newRecords),
          page: this.data.page + 1,
          hasMoreRecords: newRecords.length === this.data.pageSize
        }, () => {
          console.log('setData complete, records count:', this.data.records.length);
        });
      } else {
        wx.showToast({ title: res.result?.msg || '加载失败', icon: 'none' });
        this.setData({ hasMoreRecords: false });
      }
    } catch (e) {
      console.error('获取对局记录失败', e);
      wx.showToast({ title: '加载对局记录失败', icon: 'none' });
      this.setData({ hasMoreRecords: false });
    } finally {
      this.setData({ loading: false });
      wx.hideLoading();
    }
  },

  loadMoreRecords() {
    this.loadRecords();
  },

  goToRecordDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/recordDetail/recordDetail?id=${id}`
    });
  },

  goToHome() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
