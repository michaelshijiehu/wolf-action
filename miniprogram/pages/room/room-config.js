module.exports = Behavior({
  methods: {
    updateRecommendedConfig(count) {
      if (count < 1) return;

      // Fix: If current config total already matches new count, do not overwrite user's manual settings
      if (this.data.configTotal === count) {
        console.log('[DEBUG] Config total matches room count, skipping auto-update.');
        return;
      }

      // 默认基础配置
      let config = { 
        werewolf: 1, villager: 1, 
        seer: false, witch: true, hunter: false, idiot: false, guard: false, cupid: false,
        knight: false, bear: false, merchant: false, silencer: false, gravekeeper: false, magician: false, dream_catcher: false,
        wolf_king: false, wolf_beauty: false, hidden_wolf: false, gargoyle: false, wild_child: false, bomberman: false
      };

      if (count >= 12) { 
        config.werewolf = 4; config.villager = 4; config.seer = true; config.witch = true; config.hunter = true; config.idiot = true; 
      }
      else if (count >= 9) { 
        config.werewolf = 3; config.villager = 3; config.seer = true; config.witch = true; config.hunter = true; 
      }
      else if (count >= 6) { 
        config.werewolf = 2; config.villager = 2; config.seer = true; config.witch = true; 
      }

      // 计算当前总数并补齐差额
      let currentTotal = 0;
      Object.keys(config).forEach(k => {
        if (typeof config[k] === 'number') currentTotal += config[k];
        else if (config[k] === true) currentTotal += 1;
      });

      let diff = count - currentTotal;
      if (diff > 0) { config.villager += diff; }
      else if (diff < 0) { config.villager = Math.max(1, config.villager + diff); }

      this.setData({ tempConfig: config });
      this.recalcConfig();
    },

    updateGameConfig(totalSeats, config) {
      console.log('[DEBUG] updateGameConfig received:', totalSeats, config);
      if (totalSeats !== this.data.gameState.players.length) { 
        this.onRoomSizeChange({ detail: { value: totalSeats } }); 
      }
      this.setData({ tempConfig: config });
      this.recalcConfig();
    },

    goToSetup() {
      if (this.data.gameState.game_state.status !== 'waiting') { wx.showToast({ title: '游戏已开始，无法修改', icon: 'none' }); return; }
      const configStr = encodeURIComponent(JSON.stringify(this.data.tempConfig));
      const totalSeats = this.data.gameState.players.length;
      wx.navigateTo({ url: `/pages/setup/setup?config=${configStr}&totalSeats=${totalSeats}` });
    },

    recalcConfig() {
      const c = this.data.tempConfig;
      const godRoles = {
        seer: '预', witch: '女', hunter: '猎', idiot: '白', guard: '守', cupid: '丘',
        knight: '骑', bear: '熊', merchant: '商', silencer: '禁', gravekeeper: '墓', magician: '魔', dream_catcher: '摄',
        wolf_king: '王', wolf_beauty: '美', hidden_wolf: '隐', gargoyle: '石', wild_child: '野', bomberman: '弹'
      };
      
      let total = c.werewolf + c.villager;
      let activeGods = [];
      
      Object.keys(godRoles).forEach(key => {
        if (c[key]) {
          total++;
          activeGods.push(godRoles[key]);
        }
      });

      this.setData({ 
        configTotal: total, 
        configValid: total === this.data.currentCount && total > 0,
        activeGodsText: activeGods.join('') || '无'
      });
    },

    updateRoleCount(e) {
      const { role, op } = e.currentTarget.dataset;
      const newConfig = Object.assign({}, this.data.tempConfig);
      newConfig[role] = Math.max(0, newConfig[role] + Number(op));
      this.setData({ tempConfig: newConfig }); this.recalcConfig();
    },

    onGodChange(e) {
      const values = e.detail.value;
      const newConfig = Object.assign({}, this.data.tempConfig);
      ['seer', 'witch', 'hunter', 'idiot', 'guard', 'cupid'].forEach(k => newConfig[k] = false);
      values.forEach(v => newConfig[v] = true);
      this.setData({ tempConfig: newConfig }); this.recalcConfig();
    },

    async onRoomSizeChange(e) {
      const targetCount = e.detail.value;
      if (targetCount === this.data.gameState.players.length) return;
      wx.showLoading({ title: '调整中...' });
      try {
        const res = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'updateRoomSize', roomId: this.data.roomId, targetCount: targetCount } });
        if (!res.result.success) { wx.showToast({ title: res.result.message, icon: 'none' }); }
      } catch (err) { console.error(err); } finally { wx.hideLoading(); }
    },
    
    async onStartGame() {
        const temp = this.data.tempConfig;
        const currentCount = this.data.currentCount;
        const roomSize = this.data.gameState.players.length;

        if (currentCount < 6) { wx.showToast({ title: '最少需要6人才能开始', icon: 'none' }); return; }
        
        // 关键修复：不再重新计算推荐配置，强制检查当前配置是否与入座人数匹配
        if (!this.data.configValid) {
          this.recalcConfig();
          if (this.data.configTotal !== currentCount) { 
            wx.showToast({ title: `配置人数(${this.data.configTotal})与实际(${currentCount})不符`, icon: 'none' }); 
            return; 
          }
        }

        wx.showLoading({ title: '准备中...' });
        try {
          // 同步房间人数
          if (currentCount !== roomSize) {
            const resizeRes = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'updateRoomSize', roomId: this.data.roomId, targetCount: currentCount } });
            if (!resizeRes.result.success) { throw new Error(resizeRes.result.message || '调整座位失败'); }
          }

          // 构建包含所有职业的完整角色字典
          const roles = { werewolf: temp.werewolf, villager: temp.villager };
          const allSpecialRoles = ['seer', 'witch', 'hunter', 'idiot', 'guard', 'cupid', 'knight', 'bear', 'merchant', 'silencer', 'gravekeeper', 'magician', 'dream_catcher', 'wolf_king', 'wolf_beauty', 'hidden_wolf', 'gargoyle', 'wild_child', 'bomberman'];
          
          allSpecialRoles.forEach(role => {
            roles[role] = temp[role] ? 1 : 0;
          });

          const res = await wx.cloud.callFunction({ 
            name: 'quickstartFunctions', 
            data: { type: 'startGame', roomId: this.data.roomId, config: { roles } } 
          });

          if (!res.result || !res.result.success) { throw new Error(res.result?.msg || '游戏初始化失败'); }
          wx.showToast({ title: '游戏开始', icon: 'success' });
        } catch (err) { 
          console.error('onStartGame Error:', err); 
          wx.showModal({ title: '开始失败', content: err.message || '未知错误', showCancel: false }); 
        } finally { wx.hideLoading(); }
      },
  }
});