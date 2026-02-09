module.exports = Behavior({
  methods: {
    onSeerAction(targetSeat) {
      wx.showLoading({ title: '查验中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'seerAction', roomId: this.data.roomId, targetSeat } })
        .then(res => {
          if (res.result.success) {
            wx.showToast({
              title: `查验完成`,
              icon: 'success'
            });
          } else {
            wx.showToast({ title: res.result.message || '查验失败', icon: 'none' });
          }
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    },

    onSeerSkip() { this.onNextPhase(); }
  }
});
