const ROLE_NAMES = {
  werewolf: '狼人', villager: '村民', seer: '预言家', witch: '女巫', hunter: '猎人', idiot: '白痴', guard: '守卫', cupid: '丘比特',
  knight: '骑士', bear: '熊', merchant: '黑商', silencer: '禁言长老', gravekeeper: '守墓人', magician: '魔术师', dream_catcher: '摄梦人',
  wolf_king: '白狼王', wolf_beauty: '狼美人', hidden_wolf: '隐狼', gargoyle: '石像鬼',
  wild_child: '野孩子', bomberman: '炸弹人',
  unknown: '隐藏'
};

module.exports = Behavior({
  methods: {
    handleRoomUpdate(gameState) {
      if (this.isUnloaded) return;
      console.log('[DEBUG] handleRoomUpdate');

      if (this.data.roomId) {
        wx.setNavigationBarTitle({ title: '房间: ' + this.data.roomId });
      }

      // Force cleanup if transitioning back to waiting (Reset)
      if (gameState.game_state.status === 'waiting') {
        // Clear local storage for marks
        if (this.data.roomId) {
          try { wx.removeStorageSync(`player_marks_${this.data.roomId}`); } catch (e) { }
        }
        
        this.setData({
          judgeSummary: null,
          wolfKillTarget: null,
          witchPoisonTarget: null,
          cupidTargets: [],
          myVoteTarget: null,
          showVoteResultModal: false,
          currentVoteResult: null,
          hasConfirmedRole: false,
          confirmedCount: 0,
          showRoleCard: false,
          gameDuration: '',
          isJudge: false,
          playerMarks: {} // Clear frontend marks
        });
      }

      const lastGameState = this.data.gameState;
      const isStatusChanged = lastGameState && lastGameState.game_state.status === 'waiting' && gameState.game_state.status === 'playing';
      const isSubPhaseChanged = lastGameState && gameState.game_state.sub_phase !== lastGameState.game_state.sub_phase;
      const isNewGameStart = !lastGameState && gameState.game_state.status === 'playing';

      if (isSubPhaseChanged || isStatusChanged) {
        this.stopAudioAndTimer();
      }

      const enteringDealCards = (isSubPhaseChanged && gameState.game_state.sub_phase === 'deal_cards') || (isNewGameStart && gameState.game_state.sub_phase === 'deal_cards');
      if (enteringDealCards) {
        setTimeout(() => {
          if (this.data.gameState && this.data.gameState.game_state.sub_phase === 'deal_cards' && !this.data.showRoleCard && !this.data.isJudge) {
            this.toggleRoleCard(8000);
          }
        }, 500);
      }

      // Avatar Cache logic wrapped in Promise
      if (!this.avatarCache) this.avatarCache = {};
      const fileIDsToConvert = gameState.players
        .map(p => p.avatar_url)
        .filter(url => url && url.startsWith('cloud://') && !this.avatarCache[url]);

      let avatarPromise = Promise.resolve();
      if (fileIDsToConvert.length > 0) {
        avatarPromise = wx.cloud.getTempFileURL({ fileList: fileIDsToConvert }).then(tempFilesRes => {
          tempFilesRes.fileList.forEach(file => { if (file.tempFileURL) this.avatarCache[file.fileID] = file.tempFileURL; });
        }).catch(e => { console.error("Failed to get temp file URLs", e); });
      }

      avatarPromise.then(() => {
        gameState.players.forEach(player => {
          if (player.avatar_url && this.avatarCache[player.avatar_url]) {
            player.avatar_url = this.avatarCache[player.avatar_url];
          }
        });

        const myOpenid = this.data.myOpenid;
        const isCreator = gameState._openid === myOpenid;
        const me = gameState.players.find(p => p.openid === myOpenid);
        const mySeat = me ? me.seat : null;

        // 计算未入座玩家
        const seatedOpenids = gameState.players.map(p => p.openid).filter(id => !!id);
        const NOW = Date.now();
        const unseatedPlayers = (gameState.visitors || [])
          .filter(v => !seatedOpenids.includes(v.openid))
          .filter(v => (NOW - (v.last_active || 0)) < 300000) // 仅显示 5 分钟内活跃的访客
          .map(v => {
            // 对访客头像也进行缓存处理
            if (v.avatar_url && v.avatar_url.startsWith('cloud://') && this.avatarCache[v.avatar_url]) {
              return { ...v, avatar_url: this.avatarCache[v.avatar_url] };
            }
            return v;
          });

        const isJudge = isCreator && !mySeat;
        this.setData({ isJudge, isCreator, unseatedPlayers });

        const phase = gameState.game_state.phase;
        const subPhase = gameState.game_state.sub_phase;

        const isNewDay = lastGameState && (gameState.game_state.day_count > lastGameState.game_state.day_count);
        if (isNewDay || subPhase === 'night_start') {
          if (isNewDay || (lastGameState && lastGameState.game_state.sub_phase !== 'night_start')) {
            this.setData({
              wolfKillTarget: null,
              witchPoisonTarget: null,
              cupidTargets: [],
              myVoteTarget: null
            });
          }
        }

        const instructions = gameState.game_state.current_instruction || {};
        const hasBots = gameState.players.some(p => p.openid.startsWith('bot_'));

        let hasConfirmedRole = false;
        let confirmedCount = 0;
        if (subPhase === 'deal_cards') {
          const confirmations = gameState.current_round_actions.role_confirmations || {};
          confirmedCount = Object.keys(confirmations).length;
          if (confirmations[myOpenid]) {
            hasConfirmedRole = true;
          }
        } else {
          if (this.data.hasConfirmedRole) hasConfirmedRole = false;
        }

        if (isCreator) {
          this.handleDebugRoomUpdate(gameState, lastGameState);

          if (gameState.game_state.status === 'finished' && (!lastGameState || lastGameState.game_state.status !== 'finished')) {
            const winner = gameState.game_state.winner;
            let audioKey = 'GAME_OVER';
            if (winner === 'werewolf') audioKey = 'WOLF_WIN';
            else if (winner === 'good') audioKey = 'VILLAGER_WIN';
            else if (winner === 'third_party') audioKey = 'THIRD_PARTY_WIN';
            this.playAudioKeys([audioKey]);
          }

          if (gameState.game_state.status === 'playing') {
            const instructionAudio = gameState.game_state.current_instruction ? gameState.game_state.current_instruction.audio : null;
            const shouldPlayAudio = isSubPhaseChanged || isStatusChanged || isNewGameStart;

            if (instructionAudio && shouldPlayAudio) {
              const keys = Array.isArray(instructionAudio) ? instructionAudio : (instructionAudio.keys || []);
              if (keys.length > 0) {
                this.playAudioKeys(keys);
              } else {
                this.triggerCountdown(gameState);
              }
            } else if (!instructionAudio && shouldPlayAudio) {
              wx.cloud.callFunction({
                name: 'quickstartFunctions',
                data: { type: 'getAudioQueue', gameState: gameState, lastGameState: lastGameState }
              }).then(res => {
                if (res.result && res.result.success && res.result.keys && res.result.keys.length > 0) {
                  this.playAudioKeys(res.result.keys);
                } else {
                  this.triggerCountdown(gameState);
                }
              }).catch(e => {
                console.error("Failed to get audio queue", e);
                this.triggerCountdown(gameState);
              });
            }
          } else {
            this.stopCountdownTimer();
          }
        } else {
          const shouldTriggerCountdown = isSubPhaseChanged || isStatusChanged || isNewGameStart;
          if (shouldTriggerCountdown) {
            setTimeout(() => { if (this.data.gameState && this.data.gameState.game_state.status === 'playing') this.triggerCountdown(this.data.gameState); }, 2000);
          }
        }

        let myRole = null, myRoleState = {}, isMyTurn = false, witchKillTarget = null;
        if (me) {
          myRole = (subPhase === 'game_welcome') ? 'unknown' : me.role;
          myRoleState = me.role_state || {};
          if (myRole === 'witch' && instructions.witch_info) {
            witchKillTarget = instructions.witch_info.killTarget;
          }
          if (mySeat && !me.avatar_url && !this.data.isUpdatingSeat) {
            const userInfo = wx.getStorageSync('userInfo');
            if (userInfo) { this.joinSeat(mySeat, userInfo.nickName, userInfo.avatarUrl); }
          }
        }

        const WOLF_ROLES = ['werewolf', 'wolf_king', 'wolf_beauty', 'hidden_wolf', 'gargoyle'];

        if (instructions.roleRequired) {
          if (instructions.roleRequired === 'werewolf') {
            isMyTurn = (WOLF_ROLES.includes(myRole) && me && me.is_alive);
          } else {
            isMyTurn = (myRole === instructions.roleRequired && me && me.is_alive);
          }
        } else {
          if (me && me.is_alive) {
            if (subPhase === 'hunter_confirm' && myRole === 'hunter') isMyTurn = true;
            else if (subPhase === 'pk_voting') isMyTurn = true;
            else if (phase === 'day_voting' || phase === 'day_pk' || subPhase === 'sheriff_voting' || subPhase === 'sheriff_pk_voting') isMyTurn = true;
            else if (subPhase === 'hunter_action' && myRole === 'hunter') isMyTurn = true;
            else isMyTurn = false;
          } else {
            isMyTurn = false;
          }
        }

        const prevTurn = this.data.isMyTurn;
        const prevPhase = lastGameState ? lastGameState.game_state.sub_phase : '';
        const currPhase = gameState.game_state.sub_phase;

        if (isMyTurn) {
          if (!prevTurn || prevPhase !== currPhase) {
            this.startActionTimer();
          }
        } else {
          if (prevTurn) {
            this.stopActionTimer();
          }
        }

        let wolfKillTarget = null;
        const werewolfVotes = gameState.current_round_actions.werewolf_votes || {};
        const voteArr = Object.values(werewolfVotes);
        if (voteArr.length > 0) {
          const targetSeat = voteArr[0];
          wolfKillTarget = gameState.players.find(p => p.seat == targetSeat);
        }

        let myVoteTarget = null;
        if (phase === 'day_voting' || (phase === 'day_pk' && subPhase === 'pk_voting')) {
          const dayVotes = gameState.current_round_actions.day_votes || {};
          if (mySeat) { myVoteTarget = dayVotes[mySeat] || null; }
        } else if (subPhase === 'sheriff_voting' || subPhase === 'sheriff_pk_voting') {
          const sheriffVotes = gameState.current_round_actions.sheriff_votes || {};
          if (mySeat) { myVoteTarget = sheriffVotes[mySeat] || null; }
        }

        const currentCount = gameState.players.filter(p => p.openid).length;
        const isStatusChangedToWaiting = lastGameState && lastGameState.game_state.status !== 'waiting' && gameState.game_state.status === 'waiting';
        
        if (gameState.game_state.status === 'waiting' && (currentCount !== this.data.currentCount || isStatusChangedToWaiting)) {
          this.updateRecommendedConfig(currentCount);
        }

        let finalMarkOptions;
        if (gameState.game_state.status === 'playing' && gameState.config && gameState.config.roles) {
          const baseOptions = [{ label: '好人', value: 'good' }, { label: '狼人嫌疑', value: 'wolf_suspect' }, { label: '值得信任', value: 'trusted' }, { label: '未知', value: 'unknown' }];
          const rolesInGame = gameState.config.roles;
          const godRoles = ['seer', 'witch', 'hunter', 'idiot', 'guard', 'cupid'];
          const activeGods = godRoles.filter(role => rolesInGame[role] && rolesInGame[role] > 0);
          const godOptions = activeGods.map(role => ({ label: `是${ROLE_NAMES[role]}?`, value: `is_${role}_suspect` }));
          finalMarkOptions = baseOptions.concat(godOptions);
        } else {
          finalMarkOptions = [{ label: '好人', value: 'good' }, { label: '狼人嫌疑', value: 'wolf_suspect' }, { label: '神职嫌疑', value: 'god_suspect' }, { label: '值得信任', value: 'trusted' }, { label: '未知', value: 'unknown' }];
        }

        const enrichedVotingHistory = this.processVotingHistory(gameState);
        const isAnnouncePhase = ['exile_announce', 'election_announce'].includes(subPhase);
        const wasAnnouncePhase = lastGameState && ['exile_announce', 'election_announce'].includes(lastGameState.game_state.sub_phase);

        let showVoteResultModal = this.data.showVoteResultModal || false;
        let currentVoteResult = this.data.currentVoteResult || null;

        let voteScrollTop = this.data.voteScrollTop;

        if (isAnnouncePhase && (!lastGameState || !wasAnnouncePhase)) {
          const latestRound = enrichedVotingHistory && enrichedVotingHistory.length > 0 ? enrichedVotingHistory[0] : null;
          if (latestRound) {
            showVoteResultModal = true;
            currentVoteResult = latestRound;
            // Force reset scroll top by setting it to a new small random value
            voteScrollTop = Math.random() * 0.1;
            if (this.voteResultTimer) clearTimeout(this.voteResultTimer);
            this.voteResultTimer = setTimeout(() => {
              this.setData({ showVoteResultModal: false });
            }, 8000);
          }
        }

        let wolfConsensusTarget = null;
        if (phase === 'night' && subPhase === 'werewolf_action') {
          const votes = gameState.current_round_actions.werewolf_votes || {};
          const counts = {};
          Object.values(votes).forEach(v => counts[v] = (counts[v] || 0) + 1);
          const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
          if (sorted.length > 0) wolfConsensusTarget = Number(sorted[0][0]);
        }

        const isSheriffCandidate = (gameState.game_state.sheriff_candidate_seats || []).includes(mySeat);

        let judgeSummary = null;
        if (isJudge) {
          const cur = gameState.current_round_actions || {};
          const rolesInGame = gameState.config.roles || {};
          judgeSummary = {
            wolfTarget: wolfKillTarget ? wolfKillTarget.seat : null,
            lovers: gameState.game_state.lovers || [],
            seer: rolesInGame.seer ? { target: cur.seer_check?.target, isBad: cur.seer_check?.isBad } : null,
            guard: rolesInGame.guard ? { target: cur.guard_protect } : null,
            witch: rolesInGame.witch ? { save: cur.witch_action?.save, poison: cur.witch_action?.poison_target } : null,
            magician: rolesInGame.magician ? { targets: cur.magician_exchange } : null,
            merchant: rolesInGame.merchant ? { target: cur.merchant_trade, item: cur.merchant_item } : null,
            silencer: rolesInGame.silencer ? { target: cur.silencer_silence } : null,
            dream_catcher: rolesInGame.dream_catcher ? { target: cur.dream_catcher_sleep } : null,
            wolf_beauty: rolesInGame.wolf_beauty ? { target: cur.wolf_beauty_charm } : null,
            gargoyle: rolesInGame.gargoyle ? { target: cur.gargoyle_check } : null,
            wild_child: rolesInGame.wild_child ? { model: gameState.players.find(p => p.role === 'wild_child')?.role_state?.model_seat } : null,
            knight: rolesInGame.knight ? { target: cur.knight_duel } : null,
            gravekeeper: rolesInGame.gravekeeper ? { result: cur.gravekeeper_result } : null
          };
        }

        if (gameState.game_state.status === 'playing' && gameState.game_state.start_time) {
          if (!this.durationTimer) {
            this.durationTimer = setInterval(() => { this.updateGameDuration(); }, 1000);
            this.updateGameDuration();
          }
        } else {
          if (this.durationTimer) { clearInterval(this.durationTimer); this.durationTimer = null; }
        }

        if (isCreator && subPhase === 'day_dawn') {
          if (this.dayDawnSafetyTimer) clearTimeout(this.dayDawnSafetyTimer);
          this.dayDawnSafetyTimer = setTimeout(() => {
            if (this.data.gameState && this.data.gameState.game_state.sub_phase === 'day_dawn') {
              this.onNextPhase();
            }
          }, 10000);
        }

        const filteredKeywords = ['死亡结算', '天亮了', '天黑了', '黑夜降临', '开始'];
        const tickerLogs = [...(gameState.timeline || [])]
          .filter(item => !filteredKeywords.some(kw => item.text.indexOf(kw) !== -1))
          .slice(-3)
          .reverse();

        this.setData({
          gameState,
          tickerLogs,
          loading: false,
          mySeat,
          isAlive: me ? me.is_alive : false,
          myRole,
          myRoleState,
          isMyTurn,
          currentCount,
          wolfKillTarget,
          witchKillTarget,
          myVoteTarget,
          isCreator,
          isJudge,
          markOptions: finalMarkOptions,
          enrichedVotingHistory,
          wolfConsensusTarget,
          showVoteResultModal,
          currentVoteResult,
          isSheriffCandidate,
          judgeSummary,
          hasBots,
          hasConfirmedRole,
          confirmedCount,
          voteScrollTop
        });
      });
    },

    closeVoteResultModal() {
      this.setData({ showVoteResultModal: false });
      if (this.voteResultTimer) clearTimeout(this.voteResultTimer);
    },

    processVotingHistory(gameState) {
      if (!gameState || !gameState.game_state || !gameState.game_state.voting_history) return [];
      const players = gameState.players || [];
      const seatMap = {};
      players.forEach(p => seatMap[p.seat] = p);
      const history = gameState.game_state.voting_history.map(round => {
        const votesByTarget = {};
        const voteKeys = Object.keys(round.votes || {}).sort((a, b) => Number(a) - Number(b));
        voteKeys.forEach(voterSeat => {
          const targetSeat = round.votes[voterSeat];
          const voter = seatMap[voterSeat] || { seat: voterSeat, nickname: `${voterSeat}号` };
          if (!votesByTarget[targetSeat]) {
            let target = null;
            const isAbstain = !targetSeat || targetSeat == 0 || String(targetSeat) === 'null' || targetSeat == -1;
            if (!isAbstain) target = seatMap[targetSeat] || { seat: targetSeat, nickname: `${targetSeat}号` };
            votesByTarget[targetSeat] = {
              targetSeat: targetSeat,
              targetAvatar: target ? (target.avatar_url || '../../images/icons/avatar.png') : '',
              targetName: isAbstain ? '弃票' : (target ? target.nickname : '未知'),
              isAbstain: isAbstain,
              voters: []
            };
          }
          votesByTarget[targetSeat].voters.push({ seat: voterSeat, avatar: voter.avatar_url || '../../images/icons/avatar.png', name: voter.nickname });
        });
        const enrichedVotes = Object.values(votesByTarget).sort((a, b) => {
          if (a.isAbstain) return 1;
          if (b.isAbstain) return -1;
          return b.voters.length - a.voters.length;
        });
        return Object.assign({}, round, { enrichedVotes });
      });
      return [...history].reverse();
    },

    
  }
});
