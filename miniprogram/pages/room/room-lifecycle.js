module.exports = Behavior({
  methods: {
    onLoad: function (options) {
      console.log('[Room] onLoad with options:', options);
      if (options.roomId) {
        this.setData({ roomId: options.roomId });
        // Chain: Fetch OpenID first, THEN Init Room
        this.fetchOpenid().then(() => {
          this.initRoom(options.roomId);
          this.loadPlayerMarks();
        });
      } else {
        wx.showToast({ title: '房间号丢失', icon: 'none' });
        setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 1500);
      }
    },

    onReady: function () {
      this.initAudioContext();
    },

    onShareAppMessage() {
      wx.showToast({ title: '请点击复制按钮手动分享', icon: 'none' });
      return { title: '狼人杀房间', path: '/pages/index/index' };
    },

    onUnload() {
      if (this.watcher) { try { this.watcher.close(); } catch (e) { } }
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      if (this.stopPolling) this.stopPolling();
      if (this.durationTimer) clearInterval(this.durationTimer);
      if (this.dayDawnSafetyTimer) clearTimeout(this.dayDawnSafetyTimer);
      if (this.voteResultTimer) clearTimeout(this.voteResultTimer);
      if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer);
      if (this.stopActionTimer) this.stopActionTimer();
      if (this.stopAudioAndTimer) this.stopAudioAndTimer();
      if (this.audioCtx) {
        try {
          this.audioCtx.stop();
          if (typeof this.audioCtx.destroy === 'function') this.audioCtx.destroy();
        } catch (e) { console.warn('Audio cleanup error:', e); }
        finally { this.audioCtx = null; }
      }

      // 上报离开房间
      if (this.data.roomId) {
        wx.cloud.callFunction({
          name: 'quickstartFunctions',
          data: { type: 'leaveRoom', roomId: this.data.roomId }
        });
      }
    }
  }
});
