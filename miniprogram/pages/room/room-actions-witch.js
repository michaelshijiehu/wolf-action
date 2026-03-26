module.exports = Behavior({
  methods: {
    onWitchSave() {
      if (this.data.wolfKillTarget && this.data.wolfKillTarget.seat === this.data.mySeat) {
        wx.showToast({ title: '女巫不可自救', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '操作中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'witchAction', roomId: this.data.roomId, actionType: 'save' } })
        .then(res => {
          if (res.result.success) { wx.showToast({ title: '已使用解药', icon: 'success' }); }
          else { wx.showToast({ title: res.result.message, icon: 'none' }); }
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    },

    onWitchPoison(targetSeat) {
      wx.showLoading({ title: '操作中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'witchAction', roomId: this.data.roomId, actionType: 'poison', targetSeat } })
        .then(res => {
          if (res.result.success) {
            this.setData({ witchPoisonTarget: targetSeat });
            wx.showToast({ title: '已使用毒药', icon: 'success' });
          } else {
            wx.showToast({ title: res.result.message || '操作失败', icon: 'none' });
          }
        })
        .catch(e => { console.error(e); wx.showToast({ title: '调用失败', icon: 'none' }); })
        .finally(() => { wx.hideLoading(); });
    }
  }
});
