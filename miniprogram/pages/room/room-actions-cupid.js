module.exports = Behavior({
  methods: {
    onCupidConfirm() {
      if (this.data.cupidTargets.length !== 2) { wx.showToast({ title: '请选择两名玩家', icon: 'none' }); return; }
      wx.showLoading({ title: '连接中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'cupidAction', roomId: this.data.roomId, targetSeats: this.data.cupidTargets } })
        .then(res => {
          if (res.result.success) { wx.showToast({ title: '连接成功', icon: 'success' }); } 
          else { wx.showToast({ title: res.result.message, icon: 'none' }); }
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    },

    onMagicianAction() {
      if (this.data.cupidTargets.length !== 2) { wx.showToast({ title: '请选择两名玩家', icon: 'none' }); return; }
      wx.showLoading({ title: '交换中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'magicianAction', roomId: this.data.roomId, targetSeats: this.data.cupidTargets } })
        .then(res => {
          if (res.result.success) { wx.showToast({ title: '交换成功', icon: 'success' }); }
          else { wx.showToast({ title: res.result.message, icon: 'none' }); }
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    }
  }
});
