const auth = require('../../utils/auth.js');

module.exports = Behavior({
  methods: {
    onSeatTap(e) {
      const { seat, occupied } = e.currentTarget.dataset;
      const { myRole, gameState, myRoleState, isCreator } = this.data;
      const me = gameState.players.find(p => p.openid === this.data.myOpenid);

      if (gameState.game_state.status === 'waiting') {
        const targetSeat = Number(seat);
        const currentMySeat = Number(this.data.mySeat);

        // 如果房主点击已入座的其他玩家，弹出房主转移选项
        if (isCreator && occupied && targetSeat !== currentMySeat) {
          const targetPlayer = gameState.players.find(p => p.seat === targetSeat);
          this.showOwnerOptions(targetPlayer);
          return;
        }

        if (occupied && targetSeat !== currentMySeat) return;
        if (targetSeat === currentMySeat) {
          this.showCustomModal({
            title: '退出座位',
            content: '确定要退出当前座位吗？',
            success: (res) => {
              if (res.confirm) {
                wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'quitGame', roomId: this.data.roomId } });
              }
            }
          });
          return;
        }
        const userInfo = auth.getUserInfo();
        if (!userInfo) { this.setData({ showAuthModal: true }); return; }
        this.joinSeat(seat, userInfo.nickName, userInfo.avatarUrl);
        return;
      }

      if (gameState.game_state.status !== 'playing') return;
      const subPhase = gameState.game_state.sub_phase;
      const phase = gameState.game_state.phase;
      const targetSeat = Number(seat);
      const target = gameState.players.find(p => p.seat === targetSeat);
      const WOLF_ROLES = ['werewolf', 'wolf_king', 'wolf_beauty', 'hidden_wolf', 'gargoyle'];

      // Action Logic -Seated players whose turn it is
      if (me && (me.is_alive || this.data.isMyTurn)) {
        if (phase === 'night' && subPhase === 'werewolf_phase' && WOLF_ROLES.includes(myRole)) {
          if (!target.is_alive) { wx.showToast({ title: '目标已出局', icon: 'none' }); return; }
          this.handleWerewolfAction(targetSeat);
          return;
        }
        if (subPhase === 'cupid_phase' && myRole === 'cupid') {
          if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
          let targets = this.data.cupidTargets || [];
          if (targets.includes(targetSeat)) targets = targets.filter(s => s !== targetSeat);
          else { if (targets.length >= 2) { wx.showToast({ title: '只能选择两人', icon: 'none' }); return; } targets.push(targetSeat); }
          this.setData({ cupidTargets: targets });
          return;
        }
        if (subPhase === 'magician_phase' && myRole === 'magician') {
          if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
          let targets = this.data.cupidTargets || []; // Reusing cupidTargets for 2-target logic
          if (targets.includes(targetSeat)) targets = targets.filter(s => s !== targetSeat);
          else { if (targets.length >= 2) { wx.showToast({ title: '只能选择两人', icon: 'none' }); return; } targets.push(targetSeat); }
          this.setData({ cupidTargets: targets });
          return;
        }
        if (subPhase === 'wild_child_phase' && myRole === 'wild_child') {
          this.showCustomModal({ title: '选择榜样', content: `确定认 ${targetSeat}号 为父吗？`, success: (res) => { if (res.confirm) this.onWildChildAction(targetSeat); } });
          return;
        }
        if (subPhase === 'dream_catcher_phase' && myRole === 'dream_catcher') {
          if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
          this.showCustomModal({ title: '摄梦', content: `确定摄梦 ${targetSeat}号 吗？`, success: (res) => { if (res.confirm) this.onDreamCatcherAction(targetSeat); } });
          return;
        }
        if (subPhase === 'wolf_beauty_phase' && myRole === 'wolf_beauty') {
          if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
          this.showCustomModal({ title: '魅惑', content: `确定魅惑 ${targetSeat}号 吗？`, success: (res) => { if (res.confirm) this.onWolfBeautyAction(targetSeat); } });
          return;
        }
        if (subPhase === 'gargoyle_phase' && myRole === 'gargoyle') {
          if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
          this.showCustomModal({ title: '查验', content: `确定查验 ${targetSeat}号 身份吗？`, success: (res) => { if (res.confirm) this.onGargoyleAction(targetSeat); } });
          return;
        }
        if (subPhase === 'merchant_phase' && myRole === 'merchant') {
          if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
          // For simplicity, default to 'lucky_card' or add UI to select item. Using fixed for now.
          wx.showActionSheet({
            itemList: ['幸运儿 (Lucky Card)', '毒药 (Poison)', '寿衣 (Shroud)'],
            success: (res) => {
              const items = ['lucky_card', 'poison', 'shroud'];
              this.onMerchantAction(targetSeat, items[res.tapIndex]);
            }
          });
          return;
        }
        if (subPhase === 'silencer_phase' && myRole === 'silencer') {
          if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
          this.showCustomModal({ title: '禁言', content: `确定禁言 ${targetSeat}号 吗？`, success: (res) => { if (res.confirm) this.onSilencerAction(targetSeat); } });
          return;
        }
        if (subPhase === 'guard_phase' && myRole === 'guard') {
          if (!target.is_alive) { wx.showToast({ title: '目标已出局', icon: 'none' }); return; }
          this.onGuardAction(targetSeat);
          return;
        }
        if (subPhase === 'seer_phase' && myRole === 'seer') {
          if (!target.is_alive) { wx.showToast({ title: '已死玩家无法查验', icon: 'none' }); return; }
          if (targetSeat === this.data.mySeat) { wx.showToast({ title: '不能查验自己', icon: 'none' }); return; }
          this.showCustomModal({ title: '查验身份', content: `确定要查验 ${target.seat}号 的身份吗？`, success: (res) => { if (res.confirm) this.onSeerAction(targetSeat); } });
          return;
        }
        if (subPhase === 'witch_phase' && myRole === 'witch') {
          if (myRoleState.witch_poison_used) { wx.showToast({ title: '毒药已用过', icon: 'none' }); return; }
          if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
          this.showCustomModal({ title: '使用毒药', content: `确定要毒死 ${target.nickname} 吗？`, confirmColor: '#ff4d4f', success: (res) => { if (res.confirm) this.onWitchPoison(targetSeat); } });
          return;
        }
        if (subPhase === 'sheriff_nomination' || subPhase === 'sheriff_speech') {
          if (this.data.mySeat === targetSeat) {
            this.onSheriffJoin();
            return;
          }
        }
        if (subPhase === 'hunter_action' && myRole === 'hunter') {
          if (!target.is_alive) { wx.showToast({ title: '目标已出局', icon: 'none' }); return; }
          if (targetSeat === this.data.mySeat) { wx.showToast({ title: '不能带走自己', icon: 'none' }); return; }
          this.showCustomModal({ title: '开枪带人', content: `确定要带走 ${targetSeat}号 (${target.nickname}) 吗？`, success: (res) => { if (res.confirm) this.onHunterAction(targetSeat); } });
          return;
        }
        if (subPhase === 'sheriff_voting' || subPhase === 'sheriff_pk_voting') {
          if (gameState.game_state.sheriff_candidate_seats.includes(this.data.mySeat)) {
            wx.showToast({ title: '候选人无权投票', icon: 'none' });
            return;
          }
          if (!target.is_alive) { wx.showToast({ title: '无法投票给已死玩家', icon: 'none' }); return; }
          if (this.data.mySeat === targetSeat) { wx.showToast({ title: '不能投给自己', icon: 'none' }); return; }
          if (!gameState.game_state.sheriff_candidate_seats.includes(targetSeat)) { wx.showToast({ title: '只能投给候选人', icon: 'none' }); return; }
          this.onSheriffVote(targetSeat);
          return;
        }
        if (subPhase === 'sheriff_handover') {
          if (this.data.gameState.game_state.sheriff_seat !== this.data.mySeat) return;
          if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
          this.showCustomModal({ title: '移交警徽', content: `确定将警徽移交给 ${target.seat}号 吗？`, success: (res) => { if (res.confirm) this.onSheriffHandover(targetSeat); } });
          return;
        }
        if (subPhase === 'voting' || subPhase === 'pk_voting') {
          if (!target.is_alive) { wx.showToast({ title: '目标已出局', icon: 'none' }); return; }
          if (this.data.mySeat === targetSeat) { wx.showToast({ title: '不能投给自己', icon: 'none' }); return; }
          if (myRole === 'idiot' && myRoleState.idiot_revealed) { wx.showToast({ title: '白痴翻牌后无投票权', icon: 'none' }); return; }
          this.onDayVote(targetSeat);
          return;
        }
      }

      // Default marking for anyone (Judge or spectator)
      if (gameState.game_state.status === 'playing') {
        if (phase === 'night') return;
        const isVoting = ['voting', 'pk_voting', 'sheriff_voting', 'sheriff_pk_voting'].includes(subPhase);
        const isHandover = subPhase === 'sheriff_handover';
        const isHunterAction = subPhase === 'hunter_action';
        if (isVoting || isHandover || isHunterAction) return;
        this.showMarkPlayerModal(e);
      }
    },

    onVisitorTap(e) {
      const player = e.currentTarget.dataset.player;
      if (this.data.isCreator && this.data.gameState.game_state.status === 'waiting') {
        this.showOwnerOptions(player);
      }
    },

    showOwnerOptions(player) {
      wx.showActionSheet({
        itemList: [`将房主转移给 ${player.nickname}`],
        success: (res) => {
          if (res.tapIndex === 0) {
            wx.showModal({
              title: '确认转移',
              content: `确定要将房主身份转移给 ${player.nickname} 吗？\n转移后您将失去房间控制权限。`,
              success: (sm) => {
                if (sm.confirm) {
                  wx.showLoading({ title: '转移中...' });
                  wx.cloud.callFunction({
                    name: 'quickstartFunctions',
                    data: { type: 'transferOwner', roomId: this.data.roomId, targetOpenid: player.openid }
                  }).then(res => {
                    if (res.result.success) wx.showToast({ title: '已转移房主' });
                    else wx.showToast({ title: res.result.message, icon: 'none' });
                  }).finally(() => wx.hideLoading());
                }
              }
            });
          }
        }
      });
    }
  }
});
