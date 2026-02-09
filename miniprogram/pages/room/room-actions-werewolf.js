module.exports = Behavior({
  methods: {
    handleWerewolfAction(targetSeat) {
      wx.showLoading({ title: '刀人...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'werewolfAction', roomId: this.data.roomId, targetSeat } })
        .then(res => {
          if (res.result.success) { wx.showToast({ title: '已锁定目标', icon: 'none' }); } 
          else { wx.showToast({ title: res.result.message, icon: 'none' }); }
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    },

    onWolfExplode() {
      this.showCustomModal({
        title: '确认自爆',
        content: '自爆将立即结束白天并进入黑夜，您将出局。确定吗？',
        confirmColor: '#ff4d4f',
        success: (res) => {
          if (res.confirm) {
            wx.showLoading({ title: '自爆中...' });
            wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'wolfExplode', roomId: this.data.roomId } })
              .then(() => {
                wx.showToast({ title: '已自爆', icon: 'success' });
              })
              .catch(e => { console.error(e); })
              .finally(() => { wx.hideLoading(); });
          }
        }
      });
    }
  }
});
