module.exports = Behavior({
  data: {
    isNextPhasing: false,
    isUpdatingSeat: false,
    tempAvatarUrl: '',
    tempNickname: ''
  },

  methods: {
    onNextPhase() {
      console.log('[DEBUG] onNextPhase called');
      if (this.data.isNextPhasing) return;
      this.setData({ isNextPhasing: true });
      // wx.showLoading({ title: '流转中...' }); // Visual feedback
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'nextPhase', roomId: this.data.roomId } })
        .then(res => {
          if (res.result && res.result.game_state) {
            console.log('[DEBUG] nextPhase success, updating local state directly');
            // Directly update local state as a fallback in case watcher is slow or broken
            this.handleRoomUpdate(res.result);
          }
        })
        .catch(err => { 
          console.error('[ERROR] nextPhase failed:', err); 
          wx.showToast({ title: '流转失败，请重试', icon: 'none' });
        })
        .finally(() => {
          // wx.hideLoading();
          this.setData({ isNextPhasing: false });
        });
    },

    onGenericAction() {
      const subPhase = this.data.gameState.game_state.sub_phase;
      const phase = this.data.gameState.game_state.phase;

      console.log(`[DEBUG] onGenericAction triggered for subPhase: ${subPhase}, phase: ${phase}`);

      switch (subPhase) {
        case 'cupid_action':
          return this.onCupidConfirm();
        case 'magician_action':
          return this.onMagicianAction();
        case 'wild_child_action':
          // Handled via seat tap usually, but can be here if confirmed via button
          // Assuming selection logic exists, for now just skip if no target
          if (this.data.wolfKillTarget) return this.onWildChildAction(this.data.wolfKillTarget.seat); 
          break; 
        case 'dream_catcher_action':
        case 'wolf_beauty_action':
        case 'gargoyle_action':
        case 'merchant_action':
        case 'silencer_action':
          return this.onNextPhase();
        case 'gravekeeper_action':
          return this.onGravekeeperAction();
        case 'lover_confirm':
        case 'hunter_confirm':
          return this.onNextPhase();
        case 'guard_action':
          return this.onGuardSkip();
        case 'hunter_action':
          return this.onHunterSkip();
        case 'sheriff_handover':
          return this.onSheriffDestroy();
        case 'sheriff_nomination':
          if (!this.data.gameState.game_state.sheriff_candidate_seats.includes(this.data.mySeat)) {
            return this.onJoinSheriff();
          } else {
            return this.onQuitSheriff();
          }
        case 'sheriff_voting':
          return this.onSheriffAbstain();
        case 'discussion':
          return this.onNextPhase();
      }

      if (subPhase === 'voting' || subPhase === 'pk_voting' || phase === 'day_voting') {
        return this.onAbstainVote();
      }
    },

    onRestartGame() {
      wx.showModal({
        title: '重置游戏',
        content: '确定要重置当前对局吗？',
        success: (res) => {
          if (res.confirm) {
            wx.showLoading({ title: '重置中...', mask: true });
            wx.cloud.callFunction({
              name: 'quickstartFunctions',
              data: { type: 'resetRoom', roomId: this.data.roomId }
            }).then(res => {
              if (res.result && res.result.success) {
                wx.showToast({ title: '游戏已重置', icon: 'success' });
              } else {
                wx.showToast({ title: res.result?.message || '重置失败', icon: 'none' });
              }
            }).catch(err => {
              console.error('Restart game error:', err);
              wx.showToast({ title: '重置失败', icon: 'none' });
            }).finally(() => {
              wx.hideLoading();
            });
          }
        }
      });
    },

    onJoinSheriff() {
      wx.showLoading({ title: '上警中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'sheriffAction', roomId: this.data.roomId, action: 'join', isJoining: true } })
        .then(() => {
          wx.showToast({ title: '已上警', icon: 'success' });
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    },

    onQuitSheriff() {
      wx.showLoading({ title: '退水中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'sheriffAction', roomId: this.data.roomId, action: 'join', isJoining: false } })
        .then(() => {
          wx.showToast({ title: '已退水', icon: 'success' });
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    },

    onSheriffVote(targetSeat) {
      wx.showLoading({ title: '投票中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'sheriffAction', roomId: this.data.roomId, action: 'vote', targetSeat } })
        .then(() => {
          wx.showToast({ title: '已投票', icon: 'success' });
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    },

    onSheriffAbstain() {
      wx.showLoading({ title: '弃票中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'sheriffAction', roomId: this.data.roomId, action: 'vote', targetSeat: 0 } })
        .then(() => {
          wx.showToast({ title: '已弃票', icon: 'success' });
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    },

    onSheriffHandover(targetSeat) {
      wx.showLoading({ title: '移交中...' });
      wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'sheriffAction', roomId: this.data.roomId, action: 'handover', targetSeat: targetSeat }
      }).then(res => {
        if (res.result.success) { wx.showToast({ title: '已移交', icon: 'success' }); } 
        else { wx.showToast({ title: res.result.message, icon: 'none' }); }
      })
      .catch(e => { console.error(e); })
      .finally(() => { wx.hideLoading(); });
    },

    onSheriffDestroy() {
      wx.showLoading({ title: '操作中...' });
      wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'sheriffAction', roomId: this.data.roomId, action: 'handover', targetSeat: 0 }
      }).then(() => {
        wx.showToast({ title: '警徽已撕毁', icon: 'success' });
      })
      .catch(e => { console.error(e); })
      .finally(() => { wx.hideLoading(); });
    },

    onSheriffJoin() {
      if (!this.data.mySeat) return;
      const isJoining = !this.data.isSheriffCandidate;
      wx.showLoading({ title: isJoining ? '上警中...' : '退水中...' });
      wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'sheriffAction',
          roomId: this.data.roomId,
          action: 'join',
          seat: this.data.mySeat,
          isJoining: isJoining
        }
      }).then(() => {
        wx.showToast({ title: isJoining ? '已上警' : '已退水', icon: 'success' });
      }).catch(e => {
        console.error(e);
        wx.showToast({ title: '操作失败', icon: 'none' });
      }).finally(() => {
        wx.hideLoading();
      });
    },

    onDayVote(targetSeat) {
      wx.showLoading({ title: '投票中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'voteAction', roomId: this.data.roomId, targetSeat } })
        .then(res => {
          if (res.result.success) { wx.showToast({ title: '已投票', icon: 'success' }); } 
          else { wx.showToast({ title: res.result.message, icon: 'none' }); }
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    },

    onAbstainVote() {
      wx.showLoading({ title: '弃票中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'voteAction', roomId: this.data.roomId, targetSeat: 0 } })
        .then(() => {
          wx.showToast({ title: '已弃票', icon: 'success' });
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    },

    onChooseAvatar(e) { this.setData({ tempAvatarUrl: e.detail.avatarUrl }); },
    onNicknameChange(e) { this.setData({ tempNickname: e.detail.value }); },
    confirmAuth() {
      if (!this.data.tempAvatarUrl || !this.data.tempNickname) { wx.showToast({ title: '请完善信息', icon: 'none' }); return; }
      wx.showLoading({ title: '安全审核中...' });
      
      wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'securityCheck', content: this.data.tempNickname }
      }).then(secRes => {
        if (secRes.result && !secRes.result.isSafe) {
          wx.hideLoading();
          wx.showModal({ title: '审核不通过', content: '昵称包含敏感词，请修改', showCancel: false });
          throw new Error('SEC_CHECK_FAILED');
        }

        const cloudPath = 'avatars/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.png';
        return wx.cloud.uploadFile({ cloudPath: cloudPath, filePath: this.data.tempAvatarUrl });
      }).then(res => {
        const userInfo = { nickName: this.data.tempNickname, avatarUrl: res.fileID };
        wx.setStorageSync('userInfo', userInfo);
        this.setData({ showAuthModal: false });
        wx.showToast({ title: '设置成功', icon: 'success' });
      }).catch(e => {
        if (e.message !== 'SEC_CHECK_FAILED') {
          console.error(e);
          wx.showToast({ title: '上传失败', icon: 'none' });
        }
      }).finally(() => { wx.hideLoading(); });
    },

    joinSeat(seat, nickName, avatarUrl) {
      if (this.data.isUpdatingSeat) return;
      this.setData({ isUpdatingSeat: true });
      wx.showLoading({ title: '入座中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'joinGame', roomId: this.data.roomId, seat, userInfo: { nickName, avatarUrl } } })
        .catch(err => { console.error(err); })
        .finally(() => { wx.hideLoading(); this.setData({ isUpdatingSeat: false }); });
    },

    onDevSimulate() {
      wx.showLoading({ title: '模拟行动...' });
      wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'simulateBotActions', roomId: this.data.roomId }
      }).then(res => {
        if (res.result && res.result.success) { 
          wx.showToast({ title: '模拟成功', icon: 'success' }); 
          this.onNextPhase(); 
        } else { 
          wx.showToast({ title: res.result.message || '模拟失败', icon: 'none' }); 
        }
      }).catch(e => { console.error(e); wx.showToast({ title: '调用失败', icon: 'none' }); })
      .finally(() => { wx.hideLoading(); });
    },

    onAutoTest() {
      wx.showLoading({ title: '同步配置中...', mask: true });
      const targetCount = this.data.configTotal || 0;
      if (targetCount < 6) {
        wx.showToast({ title: '配置人数不足(最少6人)', icon: 'none' });
        return;
      }

      let chain = Promise.resolve();
      if (targetCount !== this.data.gameState.players.length) {
        chain = wx.cloud.callFunction({
          name: 'quickstartFunctions',
          data: { type: 'updateRoomSize', roomId: this.data.roomId, targetCount: targetCount }
        }).then(resizeRes => { if (!resizeRes.result.success) throw new Error(resizeRes.result.message); });
      }

      chain.then(() => {
        wx.showLoading({ title: '填充机器人...', mask: true });
        return wx.cloud.callFunction({
          name: 'quickstartFunctions',
          data: { type: 'fillRoom', roomId: this.data.roomId, targetCount: targetCount }
        });
      }).then(res => {
        if (res.result.success) {
          const db = wx.cloud.database();
          return db.collection('game_rooms').where({ roomId: this.data.roomId }).get();
        } else {
          throw new Error(res.result.message);
        }
      }).then(roomRes => {
        if (roomRes.data && roomRes.data[0]) {
          this.handleRoomUpdate(roomRes.data[0]);
        }
        this.setData({ isJudge: true });
        wx.showToast({ title: `配置同步完成 (${targetCount}人局)`, icon: 'success' });
      }).catch(e => {
        console.error(e);
        wx.showModal({ title: '测试初始化失败', content: e.message || '网络错误', showCancel: false });
      }).finally(() => {
        wx.hideLoading();
      });
    },

    onDevFillBots() {
      wx.showLoading({ title: '填充中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'fillRoom', roomId: this.data.roomId, targetCount: 9 } })
        .then(res => {
          if (!res.result.success) {
            wx.showToast({ title: '失败: ' + res.result.message, icon: 'none', duration: 3000 });
            return;
          }
          wx.showToast({ title: '成功: ' + res.result.message, icon: 'none' });
          const db = wx.cloud.database();
          return db.collection('game_rooms').where({ roomId: this.data.roomId }).get();
        }).then(roomRes => {
          if (roomRes && roomRes.data && roomRes.data[0]) {
            this.handleRoomUpdate(roomRes.data[0]);
          }
        }).catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    }
  }
});
