const app = getApp();
const auth = require('../../utils/auth.js');

module.exports = Behavior({
  methods: {
    fetchOpenid() {
      return wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'getOpenId' } })
        .then(res => {
          console.log('[DEBUG] My User OpenID:', res.result.openid);
          this.setData({ myOpenid: res.result.openid });

          // 自动上报入场 (游客模式)
          const userInfo = auth.getUserInfo();
          if (userInfo && this.data.roomId) {
            wx.cloud.callFunction({
              name: 'quickstartFunctions',
              data: { type: 'enterRoom', roomId: this.data.roomId, userInfo }
            });
          }

          if (this.data.gameState) this.handleRoomUpdate(this.data.gameState);
        })
        .catch(e => { console.error('[DEBUG] Failed to fetch OpenID:', e); });
    },

    initRoom(roomId) {
      if (this.isUnloaded) return;
      if (this.isInitRoomRunning) return;
      this.isInitRoomRunning = true;

      // Don't re-init if we already have a watcher for the same room (unless retrying)
      if (this.watcher && this.data.roomId === roomId && this.data.watchRetryCount === 0) {
        this.isInitRoomRunning = false;
        return;
      }

      // Force close existing watcher
      if (this.watcher) {
        try { this.watcher.close(); } catch (e) { console.warn('Close watcher failed', e); }
        this.watcher = null;
      }

      const envId = app.globalData.env || 'cloud1-0gam6qm6bbb261bd';
      const db = wx.cloud.database({ env: envId });
      const _this = this;
      const finishInit = () => { _this.isInitRoomRunning = false; };

      // Initial fetch to show data immediately
      db.collection('game_rooms').where({ roomId: roomId }).get().then(res => {
        if (_this.isUnloaded) return;
        if (res.data.length > 0) {
          _this.handleRoomUpdate(res.data[0]);
        } else {
          _this.setData({ roomNotFound: true, loading: false });
          finishInit();
          return;
        }

        // Start Realtime Listener
        _this.watcher = db.collection('game_rooms').where({ roomId: roomId }).watch({
          onChange: function (snapshot) {
            if (_this.isUnloaded) return;
            if (snapshot.docs && snapshot.docs[0]) {
              _this.setData({ watchRetryCount: 0 }); // Reset retry count on success
              _this.handleRoomUpdate(snapshot.docs[0]);
            }
          },
          onError: function (err) {
            console.error('[WATCH_ERROR]', err);
            if (_this.isUnloaded) return;

            const errMsg = err && (err.errMsg || err.message || '');
            const isLoginFail = err && (err.errCode === -402002 || errMsg.includes('login fail') || errMsg.includes('ws connection'));

            // 减少重试次数到 1 次，快速降级为长轮询，避免在开发者工具中长时间卡顿
            if (_this.data.watchRetryCount < 1) {
              const nextRetry = _this.data.watchRetryCount + 1;
              const delay = nextRetry * 1000 + Math.floor(Math.random() * 500);
              console.log(`[WATCH] Retrying connection (${nextRetry}/1) in ${delay}ms...`);
              _this.setData({ watchRetryCount: nextRetry });

              if (_this.reconnectTimer) clearTimeout(_this.reconnectTimer);
              _this.reconnectTimer = setTimeout(() => {
                _this.initRoom(roomId);
              }, delay);
            } else {
              if (isLoginFail) {
                _this.startPolling(roomId, envId);
                wx.showToast({ title: '实时监听失败，已切换为轮询', icon: 'none' });
              } else {
                wx.showModal({
                  title: '连接断开',
                  content: '实时监听失败 (' + err.errCode + ')，请检查网络或手动刷新',
                  showCancel: false,
                  confirmText: '刷新',
                  success: (res) => { if (res.confirm) { _this.setData({ watchRetryCount: 0 }); _this.initRoom(roomId); } }
                });
              }
            }
          }
        });
        finishInit();
      }).catch(err => {
        console.error('[initRoom] critical error:', err);
        if (!_this.isUnloaded) _this.setData({ roomNotFound: true, loading: false });
        finishInit();
      });
    },

    startPolling(roomId, envId) {
      if (this.isPolling) return;
      this.isPolling = true;
      const db = wx.cloud.database({ env: envId || (app.globalData.env || 'cloud1-0gam6qm6bbb261bd') });
      const _this = this;
      const poll = () => {
        if (_this.isUnloaded) return;
        db.collection('game_rooms').where({ roomId: roomId }).get().then(res => {
          if (_this.isUnloaded) return;
          if (res.data && res.data[0]) {
            _this.handleRoomUpdate(res.data[0]);
          }
        }).catch(err => {
          console.error('[POLL_ERROR]', err);
        });
      };
      poll();
      this.pollTimer = setInterval(poll, 4000);
    },

    stopPolling() {
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.isPolling = false;
    }
  }
});
