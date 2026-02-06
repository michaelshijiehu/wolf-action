const app = getApp();

const AUDIO_MANIFEST = require('../../audioManifest.js');

const ROLE_NAMES = {
  werewolf: '狼人', villager: '村民', seer: '预言家', witch: '女巫', hunter: '猎人', idiot: '白痴', guard: '守卫', cupid: '丘比特',
  knight: '骑士', bear: '熊', merchant: '黑商', silencer: '禁言长老', gravekeeper: '守墓人', magician: '魔术师', dream_catcher: '摄梦人',
  wolf_king: '白狼王', wolf_beauty: '狼美人', hidden_wolf: '隐狼', gargoyle: '石像鬼',
  wild_child: '野孩子', bomberman: '炸弹人',
  unknown: '隐藏'
};



Page({
  behaviors: [require('./room-audio'), require('./room-actions'), require('./room-config'), require('./room-marking'), require('./room-debug')],

  data: {
    roomId: '',
    gameState: null,
    loading: true,
    mySeat: null,
    myRole: null,
    myRoleState: {},
    isMyTurn: false,
    myOpenid: '',
    isCreator: false,
    wolfKillTarget: null,
    witchPoisonTarget: null,
    cupidTargets: [],
    isJudge: false,
    currentCount: 0,
    tempConfig: { werewolf: 0, villager: 0, seer: true, witch: true, hunter: true, idiot: false },
    configTotal: 0,
    configValid: false,

    // --- Role Confirmation ---
    hasConfirmedRole: false,
    confirmedCount: 0,

    // --- Player Marking ---
    showMarkModal: false,
    currentMarkPlayerSeat: null,
    currentMark: null,
    playerMarks: {},
    markOptions: [],
    showRoleCard: false,
    roleCardFlipped: false,
    showLog: false,
    gameDuration: '',
    roomNotFound: false,
    showAuthModal: false,
    actionCountdown: 0,
    logTab: 'vote',
    modalConfig: {
      show: false,
      title: '',
      content: '',
      showCancel: true,
      confirmText: '确定',
      cancelText: '取消',
      confirmColor: ''
    },
    _modalCallbacks: null,
    showGodViewList: false,
    isTheaterMode: false, // 全屏大圆桌模式
    watchRetryCount: 0,
    voteScrollTop: 0
  },

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

  // --- Custom Modal Logic ---
  showCustomModal({ title, content, showCancel = true, confirmText = '确定', cancelText = '取消', confirmColor = '', success }) {
    this.setData({
      modalConfig: { show: true, title, content, showCancel, confirmText, cancelText, confirmColor }
    });
    this._modalCallbacks = success;
  },

  onModalConfirm() {
    if (this._modalCallbacks) this._modalCallbacks({ confirm: true, cancel: false });
    this.setData({ 'modalConfig.show': false });
  },

  onModalCancel() {
    if (this._modalCallbacks) this._modalCallbacks({ confirm: false, cancel: true });
    this.setData({ 'modalConfig.show': false });
  },

  switchLogTab: function (e) {
    this.setData({ logTab: e.currentTarget.dataset.tab });
  },

  // --- Action Timer Logic ---
  startActionTimer: function () {
    this.stopActionTimer(); // Clear existing
    
    const duration = this.data.gameState?.game_state?.current_instruction?.duration || 20;
    console.log(`[Timer] Starting ${duration}s action timer...`);
    let countdown = duration;
    this.setData({ actionCountdown: countdown });

    // UI Updater
    this.actionInterval = setInterval(() => {
      countdown--;
      this.setData({ actionCountdown: countdown });
      if (countdown <= 0) {
        clearInterval(this.actionInterval);
      }
    }, 1000);

    // Logic Timeout
    this.actionTimeout = setTimeout(() => {
      console.log('[Room] Action timeout triggered. Auto-confirming.');
      this.onActionTimeout();
    }, duration * 1000);
  },

  stopActionTimer: function () {
    if (this.actionInterval) clearInterval(this.actionInterval);
    if (this.actionTimeout) clearTimeout(this.actionTimeout);
    this.actionInterval = null;
    this.actionTimeout = null;
    this.setData({ actionCountdown: 0 });
  },

  onConfirmAction: function () {
    console.log('[Room] User manually confirmed action.');
    this.stopActionTimer();

    const gs = this.data.gameState;
    if (!gs) return;
    const subPhase = gs.game_state.sub_phase;
    const myRole = this.data.myRole;

    // Trigger actions based on phase
    if (subPhase === 'cupid_action' && myRole === 'cupid') {
      if (this.data.cupidTargets && this.data.cupidTargets.length === 2) {
        this.onCupidConfirm();
      } else {
        if (this.data.cupidTargets.length !== 2) {
          this.onGenericAction();
        } else {
          this.onCupidConfirm();
        }
      }
    } else if (subPhase === 'witch_action') {
      this.onWitchSkip();
    } else if (subPhase === 'guard_action') {
      this.onGuardSkip();
    } else if (subPhase === 'seer_action') {
      this.onSeerSkip(); 
    } else {
      this.onGenericAction();
    }
  },

  onActionTimeout: function () {
    if (this.data.isMyTurn) {
      const gs = this.data.gameState;
      const subPhase = gs ? gs.game_state.sub_phase : '';

      // Verify if still in a voting phase before auto-abstaining
      const VOTING_PHASES = ['voting', 'pk_voting', 'sheriff_voting', 'sheriff_pk_voting'];
      if (VOTING_PHASES.includes(subPhase)) {
        if (this.data.myVoteTarget) {
          console.log('[Room] Action timeout, but already voted. Ignoring.');
          return;
        }

        console.log('[Room] Voting timeout. Auto-abstaining.');
        if (subPhase === 'sheriff_voting' || subPhase === 'sheriff_pk_voting') {
          this.onSheriffAbstain();
        } else {
          this.onAbstainVote();
        }
      } else {
        // Only trigger generic confirm if the subPhase hasn't changed to a non-action phase
        if (gs && gs.game_state.current_instruction && gs.game_state.current_instruction.actionPanel !== 'none') {
          wx.showToast({ title: '超时自动执行', icon: 'none' });
          this.onConfirmAction();
        }
      }
    }
  },

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

  updateGameDuration() {
    if (!this.data.gameState || !this.data.gameState.game_state.start_time) return;
    const startTime = this.data.gameState.game_state.start_time;
    const now = Date.now();
    const diff = Math.max(0, now - startTime);
    const pad = n => n.toString().padStart(2, '0');
    const seconds = Math.floor((diff / 1000) % 60);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const hours = Math.floor((diff / (1000 * 60 * 60)));
    let durationStr = `${pad(minutes)}:${pad(seconds)}`;
    if (hours > 0) durationStr = `${pad(hours)}:${durationStr}`;
    this.setData({ gameDuration: durationStr });
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

  fetchOpenid() {
    return wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'getOpenId' } })
      .then(res => {
        console.log('[DEBUG] My User OpenID:', res.result.openid);
        this.setData({ myOpenid: res.result.openid });
        
        // 自动上报入场 (游客模式)
        const userInfo = wx.getStorageSync('userInfo');
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

  onShareAppMessage() {
    wx.showToast({ title: '请点击复制按钮手动分享', icon: 'none' });
    return { title: '狼人杀房间', path: '/pages/index/index' };
  },

  onCopyRoomId() {
    wx.setClipboardData({ data: this.data.roomId, success: () => { wx.showToast({ title: '房间号已复制', icon: 'success' }); } });
  },

  initRoom(roomId) {
    if (this.isUnloaded) return;
    // Don't re-init if we already have a watcher for the same room (unless retrying)
    if (this.watcher && this.data.roomId === roomId && this.data.watchRetryCount === 0) return;
    
    // Force close existing watcher
    if (this.watcher) { 
      try { this.watcher.close(); } catch (e) { console.warn('Close watcher failed', e); } 
      this.watcher = null; 
    }

    const envId = app.globalData.env || 'cloud1-0gam6qm6bbb261bd';
    const db = wx.cloud.database({ env: envId });
    const _this = this;

    // Initial fetch to show data immediately
    db.collection('game_rooms').where({ roomId: roomId }).get().then(res => {
      if (_this.isUnloaded) return;
      if (res.data.length > 0) {
        _this.handleRoomUpdate(res.data[0]);
      } else {
        _this.setData({ roomNotFound: true, loading: false });
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

          if (_this.data.watchRetryCount < 3) {
            const nextRetry = _this.data.watchRetryCount + 1;
            const delay = nextRetry * 2000; // Exponential-ish: 2s, 4s, 6s
            console.log(`[WATCH] Retrying connection (${nextRetry}/3) in ${delay}ms...`);
            _this.setData({ watchRetryCount: nextRetry });
            
            if (_this.reconnectTimer) clearTimeout(_this.reconnectTimer);
            _this.reconnectTimer = setTimeout(() => {
              _this.initRoom(roomId);
            }, delay);
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
      });
    }).catch(err => {
      console.error('[initRoom] critical error:', err);
      if (!_this.isUnloaded) _this.setData({ roomNotFound: true, loading: false });
    });
  },

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
      const userInfo = wx.getStorageSync('userInfo');
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

    // Action Logic - Only for alive seated players
    if (me && me.is_alive) {
      if (phase === 'night' && subPhase === 'werewolf_action' && WOLF_ROLES.includes(myRole)) {
        if (!target.is_alive) { wx.showToast({ title: '目标已出局', icon: 'none' }); return; }
        this.handleWerewolfAction(targetSeat);
        return;
      }
      if (subPhase === 'cupid_action' && myRole === 'cupid') {
        if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
        let targets = this.data.cupidTargets || [];
        if (targets.includes(targetSeat)) targets = targets.filter(s => s !== targetSeat);
        else { if (targets.length >= 2) { wx.showToast({ title: '只能选择两人', icon: 'none' }); return; } targets.push(targetSeat); }
        this.setData({ cupidTargets: targets });
        return;
      }
      if (subPhase === 'magician_action' && myRole === 'magician') {
        if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
        let targets = this.data.cupidTargets || []; // Reusing cupidTargets for 2-target logic
        if (targets.includes(targetSeat)) targets = targets.filter(s => s !== targetSeat);
        else { if (targets.length >= 2) { wx.showToast({ title: '只能选择两人', icon: 'none' }); return; } targets.push(targetSeat); }
        this.setData({ cupidTargets: targets });
        return;
      }
      if (subPhase === 'wild_child_action' && myRole === 'wild_child') {
        this.showCustomModal({ title: '选择榜样', content: `确定认 ${targetSeat}号 为父吗？`, success: (res) => { if (res.confirm) this.onWildChildAction(targetSeat); } });
        return;
      }
      if (subPhase === 'dream_catcher_action' && myRole === 'dream_catcher') {
        if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
        this.showCustomModal({ title: '摄梦', content: `确定摄梦 ${targetSeat}号 吗？`, success: (res) => { if (res.confirm) this.onDreamCatcherAction(targetSeat); } });
        return;
      }
      if (subPhase === 'wolf_beauty_action' && myRole === 'wolf_beauty') {
        if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
        this.showCustomModal({ title: '魅惑', content: `确定魅惑 ${targetSeat}号 吗？`, success: (res) => { if (res.confirm) this.onWolfBeautyAction(targetSeat); } });
        return;
      }
      if (subPhase === 'gargoyle_action' && myRole === 'gargoyle') {
        if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
        this.showCustomModal({ title: '查验', content: `确定查验 ${targetSeat}号 身份吗？`, success: (res) => { if (res.confirm) this.onGargoyleAction(targetSeat); } });
        return;
      }
      if (subPhase === 'merchant_action' && myRole === 'merchant') {
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
      if (subPhase === 'silencer_action' && myRole === 'silencer') {
        if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
        this.showCustomModal({ title: '禁言', content: `确定禁言 ${targetSeat}号 吗？`, success: (res) => { if (res.confirm) this.onSilencerAction(targetSeat); } });
        return;
      }
      if (subPhase === 'guard_action' && myRole === 'guard') {
        if (!target.is_alive) { wx.showToast({ title: '目标已出局', icon: 'none' }); return; }
        this.onGuardAction(targetSeat);
        return;
      }
      if (subPhase === 'seer_action' && myRole === 'seer') {
        if (!target.is_alive) { wx.showToast({ title: '已死玩家无法查验', icon: 'none' }); return; }
        if (targetSeat === this.data.mySeat) { wx.showToast({ title: '不能查验自己', icon: 'none' }); return; }
        this.showCustomModal({ title: '查验身份', content: `确定要查验 ${target.seat}号 的身份吗？`, success: (res) => { if (res.confirm) this.onSeerAction(targetSeat); } });
        return;
      }
      if (subPhase === 'witch_action' && myRole === 'witch') {
        if (myRoleState.witch_poison_used) { wx.showToast({ title: '毒药已用过', icon: 'none' }); return; }
        if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
        this.showCustomModal({ title: '使用毒药', content: `确定要毒死 ${target.nickname} 吗？`, confirmColor: '#ff4d4f', success: (res) => { if (res.confirm) this.onWitchPoison(targetSeat); } });
        return;
      }
      if (subPhase === 'hunter_action' && myRole === 'hunter') {
        if (!target.is_alive) { wx.showToast({ title: '目标已出局', icon: 'none' }); return; }
        if (targetSeat === this.data.mySeat) { wx.showToast({ title: '不能带走自己', icon: 'none' }); return; }
        this.showCustomModal({ title: '开枪带人', content: `确定要带走 ${targetSeat}号 (${target.nickname}) 吗？`, success: (res) => { if (res.confirm) this.onHunterAction(targetSeat); } });
        return;
      }
      if (subPhase === 'sheriff_voting' || subPhase === 'sheriff_pk_voting') {
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
        if (myRole === 'idiot' && myRoleState.idiot_revealed) { wx.showToast({ title: '白痴翻牌后无投票权', icon: 'none' }); return; }
        this.onDayVote(targetSeat);
        return;
      }
    }

    // Default marking for anyone (Judge or spectator)
    if (gameState.game_state.status === 'playing') {
      if (phase === 'night') return;
      const isVoting = ['voting', 'pk_voting', 'sheriff_voting', 'sheriff_pk_voting'].includes(subPhase);
      if (isVoting) return;
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
  },

  onUnload() {
    if (this.watcher) { try { this.watcher.close(); } catch (e) { } }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
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
});