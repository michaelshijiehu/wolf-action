module.exports = Behavior({
  methods: {
    updateRecommendedConfig(count) {
      if (count < 1) return;
      if (count < 6) count = 6; // 强行拉底线防止因为异常调用产生 3 人房

      let config = {
        werewolf: 1, villager: 1,
        seer: false, witch: true, hunter: false, idiot: false, guard: false, cupid: false,
        win_mode: 'kill_side',
        isManualMode: false
      };

      if (count >= 12) { config.werewolf = 4; config.villager = 4; config.seer = true; config.witch = true; config.hunter = true; config.idiot = true; }
      else if (count >= 9) { config.werewolf = 3; config.villager = 3; config.seer = true; config.witch = true; config.hunter = true; }
      else { config.werewolf = 2; config.villager = 2; config.seer = true; config.witch = true; }

      let currentTotal = 0;
      Object.keys(config).forEach(k => {
        if (typeof config[k] === 'number') currentTotal += config[k];
        else if (config[k] === true) currentTotal += 1;
      });

      let diff = count - currentTotal;
      if (diff > 0) config.villager += diff;
      else if (diff < 0) config.villager = Math.max(1, config.villager + diff);

      this.setData({ tempConfig: config });
      this.recalcConfig();
      if (this.data.isCreator) this.syncConfigToServer();
    },

    syncConfigToServer() {
      const temp = this.data.tempConfig;
      if (!temp) return;
      const roles = { werewolf: temp.werewolf, villager: temp.villager };
      const allSpecialRoles = ['seer', 'witch', 'hunter', 'idiot', 'guard', 'cupid'];
      allSpecialRoles.forEach(role => { roles[role] = temp[role] ? 1 : 0; });

      const config = {
        player_count: this.data.gameState.players.length,
        roles,
        win_mode: temp.win_mode || 'kill_side',
        isManualMode: !!temp.isManualMode
      };

      wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'updateRoomConfig', roomId: this.data.roomId, config }
      }).catch(console.error);
    },

    updateGameConfig(totalSeats, config) {
      if (totalSeats !== this.data.gameState.players.length) {
        this.onRoomSizeChange({ detail: { value: totalSeats } });
      }
      this.setData({ tempConfig: config });
      this.recalcConfig();
      if (this.data.isCreator) this.syncConfigToServer();
    },

    goToSetup() {
      if (this.data.gameState.game_state.status !== 'waiting') { wx.showToast({ title: '游戏已开始', icon: 'none' }); return; }
      const configStr = encodeURIComponent(JSON.stringify(this.data.tempConfig));
      const totalSeats = this.data.gameState.players.length;
      wx.navigateTo({ url: `/pages/setup/setup?config=${configStr}&totalSeats=${totalSeats}` });
    },

    recalcConfig() {
      const c = this.data.tempConfig || {};
      const godRoles = {
        seer: '预', witch: '女', hunter: '猎', idiot: '白', guard: '守', cupid: '丘'
      };

      let total = (Number(c.werewolf) || 0) + (Number(c.villager) || 0);
      let activeGods = [];
      let godCount = 0;

      Object.keys(godRoles).forEach(key => {
        if (c[key]) {
          total++;
          godCount++;
          activeGods.push(godRoles[key]);
        }
      });

      const currentCount = this.data.gameState ? this.data.gameState.players.filter(p => p.openid).length : this.data.currentCount;

      this.setData({
        configTotal: total,
        configValid: total === currentCount && total >= 6,
        activeGodsText: activeGods.join('') || '无'
      });
    },

    updateRoleCount(e) {
      const { role, op } = e.currentTarget.dataset;
      const newConfig = Object.assign({}, this.data.tempConfig);
      newConfig[role] = Math.max(0, newConfig[role] + Number(op));
      this.setData({ tempConfig: newConfig }); this.recalcConfig();
      if (this.data.isCreator) this.syncConfigToServer();
    },

    onManualModeChange(e) {
      const isManualMode = e.detail.value;
      const tempConfig = this.data.tempConfig;
      tempConfig.isManualMode = isManualMode;
      this.setData({ tempConfig });
      if (this.data.isCreator) this.syncConfigToServer();
    },

    onGodChange(e) {
      const values = e.detail.value;
      const newConfig = Object.assign({}, this.data.tempConfig);
      ['seer', 'witch', 'hunter', 'idiot', 'guard', 'cupid'].forEach(k => newConfig[k] = false);
      values.forEach(v => newConfig[v] = true);
      this.setData({ tempConfig: newConfig }); this.recalcConfig();
      if (this.data.isCreator) this.syncConfigToServer();
    },

    onRoomSizeChange(e) {
      const targetCount = e.detail.value;
      if (targetCount === this.data.gameState.players.length) return;
      wx.showLoading({ title: '调整中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'updateRoomSize', roomId: this.data.roomId, targetCount: targetCount } })
        .then(res => { if (!res.result.success) wx.showToast({ title: res.result.message, icon: 'none' }); })
        .catch(console.error)
        .finally(() => { wx.hideLoading(); });
    },

    onStartGame() {
      const temp = this.data.tempConfig;
      const currentCount = this.data.currentCount;
      const roomSize = this.data.gameState.players.length;

      if (currentCount < 6) { wx.showToast({ title: '最少6人', icon: 'none' }); return; }
      if (!this.data.configValid) {
        this.recalcConfig();
        if (this.data.configTotal !== currentCount) {
          wx.showToast({ title: `配置人数(${this.data.configTotal})与实际(${currentCount})不符`, icon: 'none' });
          return;
        }
      }

      wx.showLoading({ title: '准备中...' });

      let chain = Promise.resolve();
      if (currentCount !== roomSize) {
        chain = wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'updateRoomSize', roomId: this.data.roomId, targetCount: currentCount } })
          .then(resizeRes => { if (!resizeRes.result.success) throw new Error(resizeRes.result.message || '调整座位失败'); });
      }

      chain.then(() => {
        const roles = { werewolf: temp.werewolf, villager: temp.villager };
        const allSpecialRoles = ['seer', 'witch', 'hunter', 'idiot', 'guard', 'cupid'];
        allSpecialRoles.forEach(role => { roles[role] = temp[role] ? 1 : 0; });

        return wx.cloud.callFunction({ 
          name: 'quickstartFunctions', 
          data: { 
            type: 'startGame', 
            roomId: this.data.roomId, 
            config: { 
              roles, 
              win_mode: temp.win_mode || 'kill_side',
              isManualMode: !!temp.isManualMode 
            } 
          } 
        });
      }).then(res => {
        if (!res.result || !res.result.success) throw new Error(res.result?.msg || '游戏初始化失败');
        wx.showToast({ title: '游戏开始', icon: 'success' });
      }).catch(err => {
        console.error('onStartGame Error:', err);
        wx.showModal({ title: '开始失败', content: err.message || '未知错误', showCancel: false });
      }).finally(() => { wx.hideLoading(); });
    }
  }
});
