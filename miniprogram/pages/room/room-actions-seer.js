module.exports = Behavior({
  methods: {
    onSeerAction(targetSeat) {
      if (this.data.gameState.current_round_actions?.seer_check?.target) {
        wx.showToast({ title: '今晚已查验', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '查验中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'seerAction', roomId: this.data.roomId, targetSeat } })
        .then(res => {
          if (res.result.success) {
            const isBad = res.result.isBad;
            wx.showModal({
              title: '查验结果',
              content: `${targetSeat}号玩家的身份是：\n${isBad ? '🌑 狼人阵营' : '🌕 好人身份'}`,
              showCancel: false,
              confirmText: '我知道了'
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
