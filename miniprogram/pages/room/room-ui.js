module.exports = Behavior({
  methods: {
    switchLogTab: function (e) {
      this.setData({ logTab: e.currentTarget.dataset.tab });
    },

    onCopyRoomId() {
      wx.setClipboardData({ data: this.data.roomId, success: () => { wx.showToast({ title: '房间号已复制', icon: 'success' }); } });
    },

    onBackHome() {
      if (this.data.isCreator) wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'deleteRoom', roomId: this.data.roomId } }).catch(console.error);
      wx.reLaunch({ url: '/pages/index/index' });
    },

    toggleRoleCard(autoCloseDuration) {
      if (this.data.gameState && this.data.gameState.game_state.status !== 'playing') return;
      if (!this.data.showRoleCard) {
        this.setData({ showRoleCard: true, roleCardFlipped: false });
        setTimeout(() => {
          this.setData({ roleCardFlipped: true });
          if (!this.data.isJudge) {
            if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer);
            const duration = typeof autoCloseDuration === 'number' ? autoCloseDuration : 10000;
            this.autoCloseTimer = setTimeout(() => { if (this.data.showRoleCard && this.data.roleCardFlipped) this.toggleRoleCard(); }, duration);
          }
        }, 150);
      } else {
        if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer);
        this.setData({ roleCardFlipped: false });
        setTimeout(() => { this.setData({ showRoleCard: false }); }, 400);
      }
    },

    toggleTheaterMode() {
      this.setData({ isTheaterMode: !this.data.isTheaterMode });
      wx.showToast({ title: this.data.isTheaterMode ? '已进入全屏' : '已退出全屏', icon: 'none' });
    },

    toggleLog() { this.setData({ showLog: !this.data.showLog }); },

    onCardTap() { if (!this.data.roleCardFlipped) this.setData({ roleCardFlipped: true }); },

    onConfirmRole() {
      if (this.data.hasConfirmedRole) return;
      wx.showLoading({ title: '确认中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'roleConfirm', roomId: this.data.roomId } })
        .then(() => { 
          this.setData({ hasConfirmedRole: true }); 
          // Close the card immediately after confirming with animation logic
          if (this.data.showRoleCard) {
            if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer);
            this.setData({ roleCardFlipped: false });
            setTimeout(() => { this.setData({ showRoleCard: false }); }, 400);
          }
        })
        .catch(e => { console.error('Role confirm failed', e); wx.showToast({ title: '确认失败', icon: 'none' }); })
        .finally(() => { wx.hideLoading(); });
    },

    onReplayAudio() {
      const gs = this.data.gameState;
      if (gs && gs.game_state.current_instruction && gs.game_state.current_instruction.audio) {
        const keys = gs.game_state.current_instruction.audio;
        let finalKeys = Array.isArray(keys) ? keys : (keys.keys || []);
        if (finalKeys.length > 0) {
          wx.showToast({ title: '重播语音...', icon: 'none' });
          this.playAudioKeys(finalKeys);
        } else {
          wx.showToast({ title: '无语音', icon: 'none' });
        }
      }
    },

    onDeleteRoom() {
      wx.showModal({
        title: '解散房间',
        content: '确定要解散房间吗？',
        confirmColor: '#ff4d4f',
        success: (res) => {
          if (res.confirm) {
            wx.showLoading({ title: '解散中...' });
            wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'deleteRoom', roomId: this.data.roomId } })
              .then(() => {
                wx.removeStorageSync(`player_marks_${this.data.roomId}`);
                wx.showToast({ title: '房间已解散', icon: 'none' });
                setTimeout(() => { wx.reLaunch({ url: '/pages/index/index' }); }, 1500);
              })
              .catch(e => { console.error(e); wx.showToast({ title: '解散失败', icon: 'none' }); })
              .finally(() => { wx.hideLoading(); });
          }
        }
      });
    }
  }
});
