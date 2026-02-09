module.exports = Behavior({
  methods: {
    onDreamCatcherAction(targetSeat) {
      wx.showLoading({ title: '摄梦中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'dreamCatcherAction', roomId: this.data.roomId, targetSeat } })
        .then(res => { if (res.result.success) wx.showToast({ title: '已选择', icon: 'success' }); })
        .finally(() => wx.hideLoading());
    },

    onWolfBeautyAction(targetSeat) {
      wx.showLoading({ title: '魅惑中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'wolfBeautyAction', roomId: this.data.roomId, targetSeat } })
        .then(res => { if (res.result.success) wx.showToast({ title: '已魅惑', icon: 'success' }); })
        .finally(() => wx.hideLoading());
    },

    onGargoyleAction(targetSeat) {
      wx.showLoading({ title: '查验中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'gargoyleAction', roomId: this.data.roomId, targetSeat } })
        .then(res => { 
          if (res.result.success) {
             const roleMap = { werewolf: '狼人', villager: '村民', seer: '预言家', witch: '女巫', hunter: '猎人', guard: '守卫' }; // Simplified map
             const roleName = roleMap[res.result.role] || '未知';
             wx.showModal({ title: '查验结果', content: `${targetSeat}号是 ${roleName}`, showCancel: false });
          }
        })
        .finally(() => wx.hideLoading());
    },

    onMerchantAction(targetSeat, item) {
      wx.showLoading({ title: '交易中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'merchantAction', roomId: this.data.roomId, targetSeat, item } })
        .then(res => { if (res.result.success) wx.showToast({ title: '已交易', icon: 'success' }); })
        .finally(() => wx.hideLoading());
    },

    onSilencerAction(targetSeat) {
      wx.showLoading({ title: '禁言中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'silencerAction', roomId: this.data.roomId, targetSeat } })
        .then(res => { if (res.result.success) wx.showToast({ title: '已禁言', icon: 'success' }); })
        .finally(() => wx.hideLoading());
    },

    onWildChildAction(targetSeat) {
      wx.showLoading({ title: '认父中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'wildChildAction', roomId: this.data.roomId, targetSeat } })
        .then(res => { if (res.result.success) wx.showToast({ title: '已选择榜样', icon: 'success' }); })
        .finally(() => wx.hideLoading());
    },

    onGravekeeperAction() {
      wx.showLoading({ title: '查看中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'gravekeeperAction', roomId: this.data.roomId } })
        .then(res => {
          if (res.result && res.result.success) {
            const list = res.result.result || [];
            const text = list.length > 0
              ? list.map(x => `${x.seat}号 ${x.camp === 'wolf' ? '狼人阵营' : '好人阵营'}`).join('\n')
              : '昨日未放逐';
            wx.showModal({ title: '守墓结果', content: text, showCancel: false });
          } else {
            wx.showToast({ title: res.result?.message || '查看失败', icon: 'none' });
          }
        })
        .catch(e => { console.error(e); wx.showToast({ title: '调用失败', icon: 'none' }); })
        .finally(() => { wx.hideLoading(); });
    },

    onHunterAction(targetSeat) {
      wx.showLoading({ title: '开枪中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'hunterAction', roomId: this.data.roomId, targetSeat } })
        .then(res => {
          if (res.result && res.result.success) { wx.showToast({ title: '已开枪', icon: 'success' }); } 
          else { wx.showToast({ title: res.result?.msg || '开枪失败', icon: 'none' }); }
        })
        .catch(e => { console.error(e); wx.showToast({ title: '调用失败', icon: 'none' }); })
        .finally(() => { wx.hideLoading(); });
    },

    onHunterSkip() { this.onNextPhase(); }
  }
});
