// miniprogram/pages/room/room-actions.js

module.exports = Behavior({
  data: {
    isNextPhasing: false,
    isUpdatingSeat: false,
    tempAvatarUrl: '',
    tempNickname: '',
    showAuthModal: false
  },

  methods: {
    async onNextPhase() {
      console.log('[DEBUG] onNextPhase called');
      if (this.data.isNextPhasing) return;
      this.setData({ isNextPhasing: true });
      try {
        await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'nextPhase', roomId: this.data.roomId } });
      }
      catch (err) { console.error(err); }
      finally {
        this.setData({ isNextPhasing: false });
      }
    },

    async handleWerewolfAction(targetSeat) {
      wx.showLoading({ title: '刀人...' });
      try {
        const res = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'werewolfAction', roomId: this.data.roomId, targetSeat } });
        if (res.result.success) { wx.showToast({ title: '已锁定目标', icon: 'none' }); } else { wx.showToast({ title: res.result.message, icon: 'none' }); }
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onWitchSave() {
      if (this.data.wolfKillTarget && this.data.wolfKillTarget.seat === this.data.mySeat) {
        wx.showToast({ title: '女巫不可自救', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '操作中...' });
      try {
        const res = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'witchAction', roomId: this.data.roomId, actionType: 'save' } });
        if (res.result.success) { wx.showToast({ title: '已使用解药', icon: 'success' }); }
        else { wx.showToast({ title: res.result.message, icon: 'none' }); }
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onWitchPoison(targetSeat) {
      wx.showLoading({ title: '操作中...' });
      try {
        const res = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'witchAction', roomId: this.data.roomId, actionType: 'poison', targetSeat } });
        if (res.result.success) { this.setData({ witchPoisonTarget: targetSeat }); wx.showToast({ title: '已使用毒药', icon: 'success' }); }
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onWitchSkip() {
      wx.showLoading({ title: '跳过...' });
      try {
        await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'witchAction', roomId: this.data.roomId, actionType: 'skip' } });
        this.onNextPhase();
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onSeerAction(targetSeat) {
      wx.showLoading({ title: '查验中...' });
      try {
        const res = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'seerAction', roomId: this.data.roomId, targetSeat } });
        if (res.result.success) {
          wx.showToast({
            title: `查验完成`,
            icon: 'success'
          });
        } else {
          wx.showToast({ title: res.result.message || '查验失败', icon: 'none' });
        }
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onSeerSkip() { await this.onNextPhase(); },

    async onGuardAction(targetSeat) {
      if (this.data.myRoleState.guard_last_protected_seat === targetSeat) {
        wx.showToast({ title: '不能连续守护同一人', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '守护中...' });
      try {
        const res = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'guardAction', roomId: this.data.roomId, targetSeat } });
        if (res.result.success) { wx.showToast({ title: '已守护', icon: 'success' }); }
        else { wx.showToast({ title: res.result.message, icon: 'none' }); }
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onGuardSkip() { await this.onNextPhase(); },

    async onCupidConfirm() {
      if (this.data.cupidTargets.length !== 2) { wx.showToast({ title: '请选择两名玩家', icon: 'none' }); return; }
      wx.showLoading({ title: '连接中...' });
      try {
        const res = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'cupidAction', roomId: this.data.roomId, targetSeats: this.data.cupidTargets } });
        if (res.result.success) { wx.showToast({ title: '连接成功', icon: 'success' }); } else { wx.showToast({ title: res.result.message, icon: 'none' }); }
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onHunterAction(targetSeat) {
      wx.showLoading({ title: '开枪中...' });
      try {
        const res = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'hunterAction', roomId: this.data.roomId, targetSeat } });
        if (res.result && res.result.success) { wx.showToast({ title: '已开枪', icon: 'success' }); } else { wx.showToast({ title: res.result?.msg || '开枪失败', icon: 'none' }); }
      } catch (e) { console.error(e); wx.showToast({ title: '调用失败', icon: 'none' }); } finally { wx.hideLoading(); }
    },

    async onHunterSkip() { await this.onNextPhase(); },

    async onJoinSheriff() {
      wx.showLoading({ title: '上警中...' });
      try {
        await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'sheriffAction', roomId: this.data.roomId, action: 'join', isJoining: true } });
        wx.showToast({ title: '已上警', icon: 'success' });
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onQuitSheriff() {
      wx.showLoading({ title: '退水中...' });
      try {
        await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'sheriffAction', roomId: this.data.roomId, action: 'join', isJoining: false } });
        wx.showToast({ title: '已退水', icon: 'success' });
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onSheriffVote(targetSeat) {
      wx.showLoading({ title: '投票中...' });
      try {
        await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'sheriffAction', roomId: this.data.roomId, action: 'vote', targetSeat } });
        wx.showToast({ title: '已投票', icon: 'success' });
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onSheriffAbstain() {
      wx.showLoading({ title: '弃票中...' });
      try {
        await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'sheriffAction', roomId: this.data.roomId, action: 'vote', targetSeat: 0 } });
        wx.showToast({ title: '已弃票', icon: 'success' });
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onSheriffHandover(targetSeat) {
      wx.showLoading({ title: '移交中...' });
      try {
        const res = await wx.cloud.callFunction({
          name: 'quickstartFunctions',
          data: { type: 'sheriffAction', roomId: this.data.roomId, action: 'handover', targetSeat: targetSeat }
        });
        if (res.result.success) { wx.showToast({ title: '已移交', icon: 'success' }); } else { wx.showToast({ title: res.result.message, icon: 'none' }); }
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onSheriffDestroy() {
      wx.showLoading({ title: '操作中...' });
      try {
        await wx.cloud.callFunction({
          name: 'quickstartFunctions',
          data: { type: 'sheriffAction', roomId: this.data.roomId, action: 'handover', targetSeat: 0 }
        });
        wx.showToast({ title: '警徽已撕毁', icon: 'success' });
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onDayVote(targetSeat) {
      wx.showLoading({ title: '投票中...' });
      try {
        const res = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'voteAction', roomId: this.data.roomId, targetSeat } });
        if (res.result.success) { wx.showToast({ title: '已投票', icon: 'success' }); } else { wx.showToast({ title: res.result.message, icon: 'none' }); }
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onAbstainVote() {
      wx.showLoading({ title: '弃票中...' });
      try {
        await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'voteAction', roomId: this.data.roomId, targetSeat: 0 } });
        wx.showToast({ title: '已弃票', icon: 'success' });
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onGenericAction() {
      const subPhase = this.data.gameState.game_state.sub_phase;
      const phase = this.data.gameState.game_state.phase;

      console.log(`[DEBUG] onGenericAction triggered for subPhase: ${subPhase}, phase: ${phase}`);

      switch (subPhase) {
        case 'cupid_action':
          return this.onCupidConfirm();
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

      // Handle phases
      if (subPhase === 'voting' || subPhase === 'pk_voting' || phase === 'day_voting') {
        return this.onAbstainVote();
      }
    },

    async onRestartGame() {
      wx.showLoading({ title: '重置房间中...', mask: true });
      try {
        const res = await wx.cloud.callFunction({
          name: 'quickstartFunctions',
          data: { type: 'resetRoom', roomId: this.data.roomId }
        });
        if (res.result && res.result.success) {
          wx.showToast({ title: '游戏已重置', icon: 'success' });
        } else {
          wx.showToast({ title: res.result?.message || '重置失败', icon: 'none' });
        }
      } catch (err) {
        console.error('Restart game error:', err);
        wx.showToast({ title: '重置失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },

    async onWolfExplode() {
      this.showCustomModal({
        title: '确认自爆',
        content: '自爆将立即结束白天并进入黑夜，您将出局。确定吗？',
        confirmColor: '#ff4d4f',
        success: async (res) => {
          if (res.confirm) {
            wx.showLoading({ title: '自爆中...' });
            try {
              await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'wolfExplode', roomId: this.data.roomId } });
              wx.showToast({ title: '已自爆', icon: 'success' });
            } catch (e) { console.error(e); } finally { wx.hideLoading(); }
          }
        }
      });
    },

    onChooseAvatar(e) { this.setData({ tempAvatarUrl: e.detail.avatarUrl }); },
    onNicknameChange(e) { this.setData({ tempNickname: e.detail.value }); },
    async confirmAuth() {
      if (!this.data.tempAvatarUrl || !this.data.tempNickname) { wx.showToast({ title: '请完善信息', icon: 'none' }); return; }
      wx.showLoading({ title: '安全审核中...' });
      try {
        // 0. 安全审核
        const secRes = await wx.cloud.callFunction({
          name: 'quickstartFunctions',
          data: { type: 'securityCheck', content: this.data.tempNickname }
        });
        if (secRes.result && !secRes.result.isSafe) {
          wx.hideLoading();
          wx.showModal({ title: '审核不通过', content: '昵称包含敏感词，请修改', showCancel: false });
          return;
        }

        const cloudPath = 'avatars/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.png';
        const res = await wx.cloud.uploadFile({ cloudPath: cloudPath, filePath: this.data.tempAvatarUrl });
        const userInfo = { nickName: this.data.tempNickname, avatarUrl: res.fileID };
        wx.setStorageSync('userInfo', userInfo);
        this.setData({ showAuthModal: false });
        wx.showToast({ title: '设置成功', icon: 'success' });
      } catch (e) { console.error(e); wx.showToast({ title: '上传失败', icon: 'none' }); } finally { wx.hideLoading(); }
    },

    async joinSeat(seat, nickName, avatarUrl) {
      if (this.data.isUpdatingSeat) return;
      this.setData({ isUpdatingSeat: true });
      wx.showLoading({ title: '入座中...' });
      try {
        await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'joinGame', roomId: this.data.roomId, seat, userInfo: { nickName, avatarUrl } } });
      } catch (err) { console.error(err); } finally { wx.hideLoading(); this.setData({ isUpdatingSeat: false }); }
    },

    async onDevSimulate() {
      wx.showLoading({ title: '模拟行动...' });
      try {
        const res = await wx.cloud.callFunction({
          name: 'quickstartFunctions',
          data: { type: 'simulateBotActions', roomId: this.data.roomId }
        });
        if (res.result && res.result.success) { wx.showToast({ title: '模拟成功', icon: 'success' }); this.onNextPhase(); }
        else { wx.showToast({ title: res.result.message || '模拟失败', icon: 'none' }); }
      } catch (e) { console.error(e); wx.showToast({ title: '调用失败', icon: 'none' }); } finally { wx.hideLoading(); }
    },

    async onAutoTest() {
      wx.showLoading({ title: '同步配置中...', mask: true });
      try {
        // 1. 获取当前 tempConfig 中的角色总数
        const targetCount = this.data.configTotal || 0;
        if (targetCount < 6) {
          wx.showToast({ title: '配置人数不足(最少6人)', icon: 'none' });
          return;
        }

        // 2. 自动调整房间大小以匹配配置
        if (targetCount !== this.data.gameState.players.length) {
          const resizeRes = await wx.cloud.callFunction({
            name: 'quickstartFunctions',
            data: { type: 'updateRoomSize', roomId: this.data.roomId, targetCount: targetCount }
          });
          if (!resizeRes.result.success) throw new Error(resizeRes.result.message);
        }

        wx.showLoading({ title: '填充机器人...', mask: true });

        // 3. 自动填充机器人到新的人数
        const res = await wx.cloud.callFunction({
          name: 'quickstartFunctions',
          data: { type: 'fillRoom', roomId: this.data.roomId, targetCount: targetCount }
        });

        if (res.result.success) {
          // 4. 刷新房间数据
          const db = wx.cloud.database();
          const roomRes = await db.collection('game_rooms').where({ roomId: this.data.roomId }).get();
          if (roomRes.data && roomRes.data[0] && this.handleRoomUpdate) {
            this.handleRoomUpdate(roomRes.data[0]);
          }

          // 5. 自动开启上帝视角 (因为房主现在腾出位置给机器人了)
          this.setData({ isJudge: true });

          wx.showToast({ title: `配置同步完成 (${targetCount}人局)`, icon: 'success' });
        } else {
          wx.showToast({ title: '填充失败: ' + res.result.message, icon: 'none' });
        }
      } catch (e) {
        console.error(e);
        wx.showModal({ title: '测试初始化失败', content: e.message || '网络错误', showCancel: false });
      } finally {
        wx.hideLoading();
      }
    },

    async onDevFillBots() {
      wx.showLoading({ title: '填充中...' });
      try {
        const res = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'fillRoom', roomId: this.data.roomId, targetCount: 9 } });
        if (!res.result.success) {
          wx.hideLoading();
          wx.showToast({ title: '失败: ' + res.result.message, icon: 'none', duration: 3000 });
          return;
        }
        wx.showToast({ title: '成功: ' + res.result.message, icon: 'none' });
        const db = wx.cloud.database();
        const roomRes = await db.collection('game_rooms').where({ roomId: this.data.roomId }).get();
        if (roomRes.data && roomRes.data[0] && this.handleRoomUpdate) {
          this.handleRoomUpdate(roomRes.data[0]);
        }
      } catch (e) { console.error(e); } finally { wx.hideLoading(); }
    },

    async onSheriffJoin() {
      if (!this.data.mySeat) return;
      const isJoining = !this.data.isSheriffCandidate;
      wx.showLoading({ title: isJoining ? '上警中...' : '退水中...' });
      try {
        await wx.cloud.callFunction({
          name: 'quickstartFunctions',
          data: {
            type: 'sheriffAction',
            roomId: this.data.roomId,
            action: 'join',
            seat: this.data.mySeat,
            isJoining: isJoining
          }
        });
        wx.showToast({ title: isJoining ? '已上警' : '已退水', icon: 'success' });
      } catch (e) {
        console.error(e);
        wx.showToast({ title: '操作失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },

  }
});
