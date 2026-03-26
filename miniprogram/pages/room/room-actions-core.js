const auth = require('../../utils/auth.js');

module.exports = Behavior({
  data: {
    isNextPhasing: false,
    isUpdatingSeat: false,
    tempAvatarUrl: '',
    tempNickname: ''
  },

  methods: {
    applyLocalVoteEcho(voteType, targetSeat) {
      const gameState = this.data.gameState;
      const mySeat = this.data.mySeat;
      if (!gameState || !mySeat) return;

      const actions = gameState.current_round_actions || {};
      const nextVoteMap = {
        ...(actions[voteType] || {}),
        [mySeat]: Number(targetSeat)
      };
      const nextGameState = {
        ...gameState,
        current_round_actions: {
          ...actions,
          [voteType]: nextVoteMap
        }
      };
      const nextVotedSeatMap = {
        ...(this.data.votedSeatMap || {}),
        [mySeat]: true
      };

      this.setData({
        gameState: nextGameState,
        votedSeatMap: nextVotedSeatMap
      });
    },

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
          } else {
            console.error('[ERROR] nextPhase returned invalid result:', res.result);
            const msg = (res.result && res.result.message) || '流转失败，请重试';
            wx.showToast({ title: msg, icon: 'none' });
          }
        })
        .catch(err => {
          console.error('[ERROR] nextPhase failed:', err);
          wx.showToast({ title: '网络异常，请重试', icon: 'none' });
        })
        .finally(() => {
          // wx.hideLoading();
          this.setData({ isNextPhasing: false });
        });
    },

    onNextPhaseWithConfirm() {
      if (this.data.isNextPhasing) return;
      if (this.data.gameState && this.data.gameState.game_state && this.data.gameState.game_state.is_manual_mode) {
        this.onNextPhase();
        return;
      }
      this.showCustomModal({
        title: '推进阶段',
        content: '确定立即进入下一阶段吗？该操作不可撤销。',
        confirmColor: '#ff4d4f',
        success: (res) => {
          if (res.confirm) this.onNextPhase();
        }
      });
    },

    onGenericAction() {
      const subPhase = this.data.gameState.game_state.sub_phase;
      const phase = this.data.gameState.game_state.phase;

      console.log(`[DEBUG] onGenericAction triggered for subPhase: ${subPhase}, phase: ${phase}`);

      switch (subPhase) {
        case 'guard_phase':
        case 'magician_phase':
        case 'dream_catcher_phase':
        case 'wolf_beauty_phase':
        case 'gargoyle_phase':
        case 'merchant_phase':
        case 'silencer_phase':
        case 'wild_child_phase':
        case 'gravekeeper_phase':
        case 'cupid_phase':
          return this.onConfirmRoleAction();
        case 'werewolf_phase':
          wx.showToast({ title: '等待倒计时结束...', icon: 'none' });
          return;
        case 'hunter_phase':
        case 'lover_phase':
        case 'witch_phase':
        case 'seer_phase':
          return this.onConfirmRoleAction();
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
        case 'sheriff_pk_voting':
          return this.onSheriffAbstain();
        case 'voting':
        case 'pk_voting':
          return this.onAbstainVote();
        case 'leave_speech':
        case 'sheriff_speech':
        case 'sheriff_pk_speech':
        case 'day_pk':
        case 'discussion':
          return this.onNextPhase();
      }

      if (subPhase === 'voting' || subPhase === 'pk_voting' || phase === 'day_voting' || phase === 'pk_voting') {
        return this.onAbstainVote();
      }
    },

    onConfirmRoleAction() {
      wx.showLoading({ title: '确认中...' });
      wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'confirmRoleAction', roomId: this.data.roomId }
      }).then(res => {
        if (!res.result.success) wx.showToast({ title: res.result.message, icon: 'none' });
      }).catch(err => {
        console.error(err);
        wx.showToast({ title: '操作失败', icon: 'none' });
      }).finally(() => {
        wx.hideLoading();
      });
    },

    onToggleManualMode() {
      if (!this.data.isCreator) return;
      wx.showLoading({ title: '切换中...' });
      wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'toggleManualMode', roomId: this.data.roomId }
      }).then(res => {
        if (res.result && res.result.success) {
          wx.showToast({ 
            title: res.result.isManualMode ? '开启手动流转' : '开启自动流转', 
            icon: 'none' 
          });
        }
      }).catch(err => {
        console.error(err);
        wx.showToast({ title: '操作失败', icon: 'none' });
      }).finally(() => {
        wx.hideLoading();
      });
    },

    onResetRoom() {
      if (!this.data.isCreator) return;
      wx.showModal({
        title: '重置对局',
        content: '确定要强制重置当前对局回到大厅吗？(数据将清空)',
        confirmColor: '#faad14',
        success: (res) => {
          if (res.confirm) {
            wx.showLoading({ title: '重置中...' });
            wx.cloud.callFunction({
              name: 'quickstartFunctions',
              data: { type: 'resetRoom', roomId: this.data.roomId }
            }).then(res => {
              if (res.result && res.result.success) {
                wx.showToast({ title: '重置成功', icon: 'success' });
              }
            }).catch(err => {
              console.error(err);
              wx.showToast({ title: '操作失败', icon: 'none' });
            }).finally(() => {
              wx.hideLoading();
            });
          }
        }
      });
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
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'sheriffAction', roomId: this.data.roomId, action: 'join', isJoining: true, seat: this.data.mySeat } })
        .then(res => {
          if (res.result && res.result.success) wx.showToast({ title: '已上警', icon: 'success' });
          else wx.showToast({ title: (res.result && res.result.message) || '上警失败', icon: 'none' });
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    },

    onQuitSheriff() {
      wx.showLoading({ title: '退水中...' });
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'sheriffAction', roomId: this.data.roomId, action: 'join', isJoining: false, seat: this.data.mySeat } })
        .then(res => {
          if (res.result && res.result.success) wx.showToast({ title: '已退水', icon: 'success' });
          else wx.showToast({ title: (res.result && res.result.message) || '退水失败', icon: 'none' });
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    },

    onSheriffVote(targetSeat) {
      wx.showLoading({ title: '投票中...' });
      wx.cloud.callFunction({ 
        name: 'quickstartFunctions', 
        data: { 
          type: 'sheriffAction', 
          roomId: this.data.roomId, 
          action: 'vote', 
          targetSeat,
          voteId: this.data.gameState.game_state.current_vote_id
        } 
      })
        .then(res => {
          if (res.result && res.result.success) {
            this.applyLocalVoteEcho('sheriff_votes', targetSeat);
            wx.showToast({ title: '已投票', icon: 'success' });
          } else {
            wx.showToast({ title: (res.result && res.result.message) || '投票失败', icon: 'none' });
          }
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    },

    onSheriffAbstain() {
      wx.showLoading({ title: '弃票中...' });
      wx.cloud.callFunction({ 
        name: 'quickstartFunctions', 
        data: { 
          type: 'sheriffAction', 
          roomId: this.data.roomId, 
          action: 'vote', 
          targetSeat: 0,
          voteId: this.data.gameState.game_state.current_vote_id
        } 
      })
        .then(res => {
          if (res.result && res.result.success) {
            this.applyLocalVoteEcho('sheriff_votes', 0);
            wx.showToast({ title: '已弃票', icon: 'success' });
          } else {
            wx.showToast({ title: (res.result && res.result.message) || '弃票失败', icon: 'none' });
          }
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
      this.showCustomModal({
        title: '撕毁警徽',
        content: '确定要撕毁警徽吗？撕毁后本局将不再有警长。',
        confirmColor: '#ff4d4f',
        success: (res) => {
          if (res.confirm) {
            wx.showLoading({ title: '操作中...' });
            wx.cloud.callFunction({
              name: 'quickstartFunctions',
              data: { type: 'sheriffAction', roomId: this.data.roomId, action: 'handover', targetSeat: 0 }
            }).then(res => {
              if (res.result && res.result.success) wx.showToast({ title: '警徽已撕毁', icon: 'success' });
              else wx.showToast({ title: (res.result && res.result.message) || '操作失败', icon: 'none' });
            })
              .catch(e => { console.error(e); })
              .finally(() => { wx.hideLoading(); });
          }
        }
      });
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
      }).then(res => {
        if (res.result && res.result.success) {
          wx.showToast({ title: isJoining ? '已上警' : '已退水', icon: 'success' });
        } else {
          wx.showToast({ title: (res.result && res.result.message) || '操作失败', icon: 'none' });
        }
      }).catch(e => {
        console.error(e);
        wx.showToast({ title: '操作失败', icon: 'none' });
      }).finally(() => {
        wx.hideLoading();
      });
    },

    onDayVote(targetSeat) {
      wx.showLoading({ title: '投票中...' });
      wx.cloud.callFunction({ 
        name: 'quickstartFunctions', 
        data: { 
          type: 'voteAction', 
          roomId: this.data.roomId, 
          targetSeat,
          voteId: this.data.gameState.game_state.current_vote_id
        } 
      })
        .then(res => {
          if (res.result.success) {
            this.applyLocalVoteEcho('day_votes', targetSeat);
            wx.showToast({ title: '已投票', icon: 'success' });
          }
          else { wx.showToast({ title: res.result.message, icon: 'none' }); }
        })
        .catch(e => { console.error(e); })
        .finally(() => { wx.hideLoading(); });
    },

    onAbstainVote() {
      wx.showLoading({ title: '弃票中...' });
      wx.cloud.callFunction({ 
        name: 'quickstartFunctions', 
        data: { 
          type: 'voteAction', 
          roomId: this.data.roomId, 
          targetSeat: 0,
          voteId: this.data.gameState.game_state.current_vote_id
        } 
      })
        .then(res => {
          if (res.result && res.result.success) {
            this.applyLocalVoteEcho('day_votes', 0);
            wx.showToast({ title: '已弃票', icon: 'success' });
          } else {
            wx.showToast({ title: (res.result && res.result.message) || '弃票失败', icon: 'none' });
          }
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
        auth.setUserInfo(userInfo);
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
    }
  }
});
