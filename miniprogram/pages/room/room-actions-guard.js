module.exports = Behavior({
  methods: {
    onGuardAction(targetSeat) {
      if (this.data.myRoleState.guard_last_protected_seat === targetSeat) {
        wx.showToast({ title: '不能连续守护同一人', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '守护中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'guardAction', roomId: this.data.roomId, targetSeat } })
        .then(res => {
          if (res.result.success) { wx.showToast({ title: '已守护', icon: 'success' }); }
          else { wx.showToast({ title: res.result.message, icon: 'none' }); }
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    }
  }
});
