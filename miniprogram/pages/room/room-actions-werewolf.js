module.exports = Behavior({
  methods: {
    handleWerewolfAction(targetSeat) {
      wx.showLoading({ title: '刀人...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'werewolfAction', roomId: this.data.roomId, targetSeat } })
        .then(res => {
          if (res.result.success) { 
            wx.showToast({ title: '已锁定目标', icon: 'none' });
            // 乐观更新：如果只有我一个人投票（或为了即时反馈），可以手动设置
            if (this.data.wolfConsensusTarget !== targetSeat) {
              this.setData({ wolfConsensusTarget: targetSeat });
            }
          } 
          else { wx.showToast({ title: res.result.message, icon: 'none' }); }
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    },

    onWolfConfirm() {
      wx.showLoading({ title: '确认中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'confirmWerewolfAction', roomId: this.data.roomId } })
        .then(res => {
          if (res.result && res.result.game_state) {
            this.handleRoomUpdate(res.result);
          } else if (res.result && !res.result.success) {
            wx.showToast({ title: res.result.message, icon: 'none' });
          }
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
              .then(res => {
                if (res.result && res.result.success) {
                  wx.showToast({ title: '已自爆', icon: 'success' });
                } else {
                  wx.showToast({ title: (res.result && res.result.message) || '自爆失败', icon: 'none' });
                }
              })
              .catch(e => { console.error(e); wx.showToast({ title: '调用失败', icon: 'none' }); })
              .finally(() => { wx.hideLoading(); });
          }
        }
      });
    }
  }
});
