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
    isTheaterMode: false // 全屏大圆桌模式
  },

  onLoad: function (options) {
    console.log('[Room] onLoad with options:', options);
    if (options.roomId) {
      this.setData({ roomId: options.roomId });
      this.fetchOpenid();
      this.initRoom(options.roomId);
      this.loadPlayerMarks();
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
    console.log('[Timer] Starting 20s action timer...');
    let countdown = 20;
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
    }, 20000);
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
        // If timeout/force confirm with invalid targets, we might just skip (no couple)
        // or if manual click, we warn.
        // For now, if manual click and invalid, warn.
        // If timeout, maybe generic skip?
        // Let's try generic action for fallback.
        if (this.data.cupidTargets.length !== 2) {
          // For timeout case, we just proceed. For manual, we warn.
          // But here we are in a shared function.
          // Let's assume onGenericAction works as "End Phase"
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
      this.onSeerSkip(); // or Generic
    } else {
      this.onGenericAction();
    }
  },

  onActionTimeout: function () {
    if (this.data.isMyTurn) {
      const gs = this.data.gameState;
      const subPhase = gs ? gs.game_state.sub_phase : '';
      
      // Auto-abstain for voting phases on timeout
      if (['voting', 'pk_voting', 'sheriff_voting'].includes(subPhase)) {
        // Fix: If already voted, do NOT auto-abstain
        if (this.data.myVoteTarget) {
          console.log('[Room] Action timeout, but already voted. Ignoring.');
          return;
        }

        console.log('[Room] Voting timeout. Auto-abstaining.');
        if (subPhase === 'sheriff_voting') {
          this.onSheriffAbstain();
        } else {
          this.onAbstainVote();
        }
      } else {
        wx.showToast({ title: '超时自动执行', icon: 'none' });
        this.onConfirmAction();
      }
    }
  },

  async handleRoomUpdate(gameState) {

    console.log('[DEBUG] handleRoomUpdate, new gameState:', JSON.stringify(gameState, null, 2));



    // Ensure Title is set (in case onLoad missed it or roomID was resolved later)

    if (this.data.roomId) {

      wx.setNavigationBarTitle({ title: '房间: ' + this.data.roomId });

    }



    const lastGameState = this.data.gameState;

    let nextAudioText = '';
    // 关键修复：状态一旦变更，立即停止上一阶段的所有语音和计时器
    if (lastGameState && gameState.game_state.sub_phase !== lastGameState.game_state.sub_phase) {
      console.log(`[DEBUG] Sub-phase changed from ${lastGameState.game_state.sub_phase} to ${gameState.game_state.sub_phase}. Cleaning up...`);
      this.stopAudioAndTimer(); // 停止旧语音和旧倒计时
    }

    // New: Auto-show role card when entering 'deal_cards' phase (Delay until dispatch audio)
    if (lastGameState && lastGameState.game_state.sub_phase !== 'deal_cards' && gameState.game_state.sub_phase === 'deal_cards') {
      console.log('[DEBUG] Deal Cards Phase! Automatically revealing role card.');
      // 延迟 1.5 秒等待发牌背景音开始，然后自动翻牌，保持 10 秒（发牌动画较长）
      setTimeout(() => {
        if (this.data.gameState && this.data.gameState.game_state.sub_phase === 'deal_cards' && !this.data.showRoleCard && !this.data.isJudge) {
          this.toggleRoleCard(10000);
        }
      }, 1500);
    }

    // Avatar URL conversion with Cache to prevent flickering
    if (!this.avatarCache) this.avatarCache = {};
    try {
      const fileIDsToConvert = gameState.players
        .map(p => p.avatar_url)
        .filter(url => url && url.startsWith('cloud://') && !this.avatarCache[url]);

      if (fileIDsToConvert.length > 0) {
        const tempFilesRes = await wx.cloud.getTempFileURL({ fileList: fileIDsToConvert });
        tempFilesRes.fileList.forEach(file => { if (file.tempFileURL) this.avatarCache[file.fileID] = file.tempFileURL; });
      }

      // Apply cached URLs
      gameState.players.forEach(player => {
        if (player.avatar_url && this.avatarCache[player.avatar_url]) {
          player.avatar_url = this.avatarCache[player.avatar_url];
        }
      });
    } catch (e) { console.error("Failed to get temp file URLs for avatars", e); }

    const myOpenid = this.data.myOpenid;
    const isCreator = gameState._openid === myOpenid;
    const me = gameState.players.find(p => p.openid === myOpenid);
    const mySeat = me ? me.seat : null;

    // --- Auto God View logic: Creator NOT in seat = Judge ---
    const isJudge = isCreator && !mySeat;
    this.setData({ isJudge, isCreator });

    const phase = gameState.game_state.phase;
    const subPhase = gameState.game_state.sub_phase;

    // 清空旧数据：如果是新的一天/一夜 (day_count增加)，重置所有本地行动标记
    // Robust Fix: Check day_count increase OR night_start phase (fallback)
    const isNewDay = lastGameState && (gameState.game_state.day_count > lastGameState.game_state.day_count);
    if (isNewDay || subPhase === 'night_start') {
      if (isNewDay || (lastGameState && lastGameState.game_state.sub_phase !== 'night_start')) { // Avoid repeated reset during same night_start
        console.log('[DEBUG] New day/night detected (Count: ' + gameState.game_state.day_count + '). Resetting local action states.');
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

    // --- Role Confirmation Logic (deal_cards) ---
    let hasConfirmedRole = false;
    let confirmedCount = 0;
    if (subPhase === 'deal_cards') {
      const confirmations = gameState.current_round_actions.role_confirmations || {};
      confirmedCount = Object.keys(confirmations).length;
      if (confirmations[myOpenid]) {
        hasConfirmedRole = true;
      }
    } else {
      // Reset local state when not in deal_cards phase
      if (this.data.hasConfirmedRole) hasConfirmedRole = false;
    }

    // --- Audio & Bot Auto Logic (Creator Only) ---
    if (isCreator) {
      // 1. Bot Auto Actions DELEGATED to room-debug.js
      this.handleDebugRoomUpdate(gameState, lastGameState);

      // 2. Audio Logic
      // Special: Game Over Audio
      if (gameState.game_state.status === 'finished' && (!lastGameState || lastGameState.game_state.status !== 'finished')) {
        console.log('[AUDIO] Game Over detected. Playing result audio.');
        const winner = gameState.game_state.winner;
        let audioKey = 'GAME_OVER';
        if (winner === 'werewolf') audioKey = 'WOLF_WIN';
        else if (winner === 'good') audioKey = 'VILLAGER_WIN';
        else if (winner === 'third_party') audioKey = 'THIRD_PARTY_WIN';

        this.playAudioKeys([audioKey]);
      }

      if (gameState.game_state.status === 'playing') {
        // OPTIMIZED: Prefer using instruction audio directly to avoid Cloud Function latency
        const instructionAudio = gameState.game_state.current_instruction ? gameState.game_state.current_instruction.audio : null;
        const isNewSubPhase = !lastGameState || gameState.game_state.sub_phase !== lastGameState.game_state.sub_phase;

        if (instructionAudio && isNewSubPhase) {
           const keys = Array.isArray(instructionAudio) ? instructionAudio : (instructionAudio.keys || []);
           if (keys.length > 0) {
             console.log('[AUDIO] Playing from instruction:', keys);
             this.playAudioKeys(keys);
           } else {
             this.triggerCountdown(gameState);
           }
        } else if (!instructionAudio) {
           // Fallback to legacy getAudioQueue if no instruction audio (should rarely happen now)
           try {
             const res = await wx.cloud.callFunction({
               name: 'quickstartFunctions',
               data: { type: 'getAudioQueue', gameState: gameState, lastGameState: lastGameState }
             });
             if (res.result && res.result.success && res.result.keys && res.result.keys.length > 0) {
               this.playAudioKeys(res.result.keys);
             } else if (isNewSubPhase) {
               this.triggerCountdown(gameState);
             }
           } catch (e) { console.error("Failed to get audio queue", e); if (isNewSubPhase) this.triggerCountdown(gameState); }
        }
      } else {
        this.stopCountdownTimer();
      }
    } else {
      // Non-creator: Trigger countdown on change
      if (!lastGameState || (lastGameState.game_state && gameState.game_state.sub_phase !== lastGameState.game_state.sub_phase)) {
        setTimeout(() => { if (this.data.gameState.game_state.status === 'playing') this.triggerCountdown(gameState); }, 2000);
      }
    }

    let myRole = null, myRoleState = {}, isMyTurn = false, witchKillTarget = null;
    if (me) {
      // Mask role during 'game_welcome' to prevent early peek
      myRole = (subPhase === 'game_welcome') ? 'unknown' : me.role;
      myRoleState = me.role_state || {};
      
      // Extract Witch Info
      if (myRole === 'witch' && instructions.witch_info) {
        witchKillTarget = instructions.witch_info.killTarget;
      }

      if (mySeat && !me.avatar_url && !this.data.isUpdatingSeat) {
        const userInfo = wx.getStorageSync('userInfo');
        if (userInfo) { this.joinSeat(mySeat, userInfo.nickName, userInfo.avatarUrl); }
      }
    }


    // 1. Determine if it is my turn
    if (instructions.roleRequired) {
      if (myRole === instructions.roleRequired && me && me.is_alive) {
        isMyTurn = true;
      } else {
        isMyTurn = false;
      }
    } else {
      if (me && me.is_alive) {
        if (subPhase === 'hunter_confirm' && myRole === 'hunter') isMyTurn = true;
        else if (subPhase === 'pk_voting') isMyTurn = true;
        else if (phase === 'day_voting' || phase === 'day_pk') isMyTurn = true;
        else if (subPhase === 'hunter_action' && myRole === 'hunter') isMyTurn = true;
        else isMyTurn = false;
      } else {
        isMyTurn = false;
      }
    }

    // --- Action Timer Check ---
    const prevTurn = this.data.isMyTurn;
    const prevPhase = lastGameState ? lastGameState.game_state.sub_phase : '';
    const currPhase = gameState.game_state.sub_phase;

    if (isMyTurn) {
      // If I just became active, or the phase changed while I was active
      if (!prevTurn || prevPhase !== currPhase) {
        this.startActionTimer();
      }
    } else {
      // If I am no longer active
      if (prevTurn) {
        this.stopActionTimer();
      }
    }

    // 2. Brightness Control - Disabled

    // 3. Haptics (Vibration) - Disabled

    let wolfKillTarget = null;
    const votes = gameState.current_round_actions.werewolf_votes || {};
    const voteArr = Object.values(votes);
    if (voteArr.length > 0) {
      const targetSeat = voteArr[0]; // Simplified consensus
      wolfKillTarget = gameState.players.find(p => p.seat == targetSeat);
    }

    let myVoteTarget = null;
    if (phase === 'day_voting' || (phase === 'day_pk' && subPhase === 'pk_voting')) {
      const dayVotes = gameState.current_round_actions.day_votes || {};
      if (mySeat) { myVoteTarget = dayVotes[mySeat] || null; }
    }

    const currentCount = gameState.players.filter(p => p.openid).length;
    if (gameState.game_state.status === 'waiting' && currentCount !== this.data.currentCount) {
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

    // Process Voting History & Check for New Results
    // Fix: We already process this once. Let's do it cleanly here.
    const enrichedVotingHistory = this.processVotingHistory(gameState);

    // Check for new voting result (Vote Settlement)
    // Check for new voting result (Vote Settlement)
    const oldHistory = lastGameState && lastGameState.game_state && lastGameState.game_state.voting_history ? lastGameState.game_state.voting_history : [];
    const newHistory = gameState.game_state.voting_history || [];

    let showVoteResultModal = this.data.showVoteResultModal || false;
    let currentVoteResult = this.data.currentVoteResult || null;

    // Logic: Force show modal when entering announce phase (or first load in announce phase)
    const isAnnouncePhase = ['exile_announce', 'election_announce'].includes(subPhase);
    const wasAnnouncePhase = lastGameState && ['exile_announce', 'election_announce'].includes(lastGameState.game_state.sub_phase);

    // Condition: Just entered phase OR page loaded/refreshed in phase
    // Note: If lastGameState is null, wasAnnouncePhase is undefined/false, so !wasAnnouncePhase is true.
    if (isAnnouncePhase && (!lastGameState || !wasAnnouncePhase)) {
      console.log('[DEBUG] Entered Announce Phase. Force showing Vote Result Modal.');

      // Pick the latest history (Note: enrichedVotingHistory is reversed, so latest is at 0)
      const latestRound = enrichedVotingHistory && enrichedVotingHistory.length > 0 ? enrichedVotingHistory[0] : null;
      if (latestRound) {
        showVoteResultModal = true;
        currentVoteResult = latestRound;

        // Auto-close sync with phase duration (8s)
        if (this.voteResultTimer) clearTimeout(this.voteResultTimer);
        this.voteResultTimer = setTimeout(() => {
          this.setData({ showVoteResultModal: false });
        }, 15000); // Extended to 15s to match phase duration
      }
    }

    // Wolf Consensus Logic
    let wolfConsensusTarget = null;
    if (phase === 'night' && subPhase === 'werewolf_action') {
      const votes = gameState.current_round_actions.werewolf_votes || {};
      const counts = {};
      Object.values(votes).forEach(v => counts[v] = (counts[v] || 0) + 1);
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        // If tie, pick first one (or handle tie logic if needed)
        wolfConsensusTarget = Number(sorted[0][0]);
      }
      if (sorted.length > 0) {
        // If tie, pick first one (or handle tie logic if needed)
        wolfConsensusTarget = Number(sorted[0][0]);
      }
    }

    const isSheriffCandidate = (gameState.game_state.sheriff_candidate_seats || []).includes(mySeat);

    // --- Judge Summary Logic ---
    let judgeSummary = null;
    if (this.data.isJudge) {
      const cur = gameState.current_round_actions || {};
      const rolesInGame = gameState.config.roles || {};

      judgeSummary = {
        // --- Core ---
        wolfTarget: wolfKillTarget ? wolfKillTarget.seat : null,
        lovers: gameState.game_state.lovers || [],

        // --- Dynamically show based on roles in game ---
        seer: rolesInGame.seer ? { target: cur.seer_check?.target, isBad: cur.seer_check?.isBad } : null,
        guard: rolesInGame.guard ? { target: cur.guard_protect } : null,
        witch: rolesInGame.witch ? { save: cur.witch_action?.save, poison: cur.witch_action?.poison_target } : null,

        // --- New Roles ---
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

    // Game Duration Timer Logic
    if (gameState.game_state.status === 'playing' && gameState.game_state.start_time) {
      if (!this.durationTimer) {
        this.durationTimer = setInterval(() => {
          this.updateGameDuration();
        }, 1000);
        this.updateGameDuration(); // Initial call
      }
    } else {
      if (this.durationTimer) {
        clearInterval(this.durationTimer);
        this.durationTimer = null;
      }
    }

    // Safety Net for Day Dawn (Auto-Proceed Stuck Fix)
    if (isCreator && subPhase === 'day_dawn') {
      if (this.dayDawnSafetyTimer) clearTimeout(this.dayDawnSafetyTimer);
      this.dayDawnSafetyTimer = setTimeout(() => {
        if (this.data.gameState && this.data.gameState.game_state.sub_phase === 'day_dawn') {
          console.warn('[Safety] Day Dawn stuck, forcing next phase...');
          this.onNextPhase();
        }
      }, 10000);
    }

    // Process filtered timeline for ticker (last 3 player actions)
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
      audioText: nextAudioText
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
    if (hours > 0) {
      durationStr = `${pad(hours)}:${durationStr}`;
    }
    this.setData({ gameDuration: durationStr });
  },

  processVotingHistory(gameState) {
    if (!gameState || !gameState.game_state || !gameState.game_state.voting_history) return [];

    const players = gameState.players || [];
    const seatMap = {};
    players.forEach(p => seatMap[p.seat] = p);

    const history = gameState.game_state.voting_history.map(round => {
      // Group by target
      const votesByTarget = {}; // targetSeat -> { targetInfo, voters: [] }

      const voteKeys = Object.keys(round.votes || {}).sort((a, b) => Number(a) - Number(b));

      voteKeys.forEach(voterSeat => {
        const targetSeat = round.votes[voterSeat];
        const voter = seatMap[voterSeat] || { seat: voterSeat, nickname: `${voterSeat}号` };

        if (!votesByTarget[targetSeat]) {
          let target = null;
          const isAbstain = !targetSeat || targetSeat == 0 || String(targetSeat) === 'null' || targetSeat == -1;

          if (!isAbstain) {
            target = seatMap[targetSeat] || { seat: targetSeat, nickname: `${targetSeat}号` };
          }

          votesByTarget[targetSeat] = {
            targetSeat: targetSeat,
            targetAvatar: target ? (target.avatar_url || '../../images/icons/avatar.png') : '',
            targetName: isAbstain ? '弃票' : (target ? target.nickname : '未知'),
            isAbstain: isAbstain,
            voters: []
          };
        }

        votesByTarget[targetSeat].voters.push({
          seat: voterSeat,
          avatar: voter.avatar_url || '../../images/icons/avatar.png',
          name: voter.nickname
        });
      });

      // Convert to array and sort
      const enrichedVotes = Object.values(votesByTarget).sort((a, b) => {
        if (a.isAbstain) return 1;
        if (b.isAbstain) return -1;
        return b.voters.length - a.voters.length;
      });

      return Object.assign({}, round, {
        enrichedVotes
      });
    });

    // 关键修复：使用副本进行反转，避免就地修改原始数组导致状态丢失
    return [...history].reverse();
  },

  async fetchOpenid() {
    try {
      const res = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'getOpenId' } });
      console.log('[DEBUG] My User OpenID:', res.result.openid); // 打印 OpenID
      this.setData({ myOpenid: res.result.openid });
      if (this.data.gameState) this.handleRoomUpdate(this.data.gameState);
    } catch (e) {
      console.error('[DEBUG] Failed to fetch OpenID:', e);
    }
  },

  onShareAppMessage() {
    wx.showToast({ title: '请点击房间号旁的“复制”按钮，手动分享给好友。', icon: 'none', duration: 3000 });
    return { title: '狼人杀房间', path: '/pages/index/index' };
  },

  onCopyRoomId() {
    wx.setClipboardData({ data: this.data.roomId, success: () => { wx.showToast({ title: '房间号已复制', icon: 'success' }); } });
  },



  async initRoom(roomId) {
    if (this.watcher && this.data.roomId === roomId) {
      console.log('[DEBUG] Watcher already active for this room.');
      return;
    }

    // Close existing watcher if any
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch (e) {
        console.warn('[WATCHER] close error ignored:', e);
      }
      this.watcher = null;
    }

    // Use explicit Env ID to prevent -402002 login fail issues
    const envId = app.globalData.env || 'cloud1-0gam6qm6bbb261bd';
    const db = wx.cloud.database({ env: envId });
    const _this = this;

    try {
      // 1. Snapshot Get
      const res = await db.collection('game_rooms').where({ roomId: roomId }).get();
      if (res.data.length > 0) {
        this.handleRoomUpdate(res.data[0]);
      } else {
        this.setData({ roomNotFound: true, loading: false });
        return;
      }

      // 2. Real-time listener
      this.watcher = db.collection('game_rooms').where({ roomId: roomId }).watch({
        onChange: function (snapshot) {
          if (snapshot.docs && snapshot.docs[0]) {
            _this.handleRoomUpdate(snapshot.docs[0]);
          }
        },
        onError: function (err) {
          console.error('[WATCH_ERROR]', err);
          // Only retry for specific connection/login errors
          if (err.errCode === -402002 || err.errMsg.indexOf('login fail') > -1) {
            console.warn('[WATCHER] Login/Connection issue. Cleaning up for retry...');
            if (_this.watcher) {
              try { _this.watcher.close(); } catch (e) { }
              _this.watcher = null;
            }

            if (!_this.retryCount) _this.retryCount = 0;
            if (_this.retryCount < 3) {
              _this.retryCount++;
              console.log(`[WATCHER] Retrying initRoom... Attempt ${_this.retryCount}/3`);
              setTimeout(() => {
                if (_this.data.roomId === roomId) {
                  _this.initRoom(roomId);
                }
              }, 5000);
            } else {
              wx.showToast({ title: '连接失败，请手动刷新', icon: 'none' });
            }
          }
        }
      });
    } catch (err) {
      console.error('[initRoom] critical error:', err);
      this.setData({ roomNotFound: true, loading: false });
    }
  },

  async onSeatTap(e) {
    const { seat, occupied } = e.currentTarget.dataset;
    const { myRole, gameState, myRoleState } = this.data;
    const me = gameState.players.find(p => p.seat === this.data.mySeat);

    if (gameState.game_state.status === 'waiting') {
      const targetSeat = Number(seat);
      const currentMySeat = Number(this.data.mySeat);

      if (occupied && targetSeat !== currentMySeat) return;

      // If clicking own seat -> Leave seat
      if (targetSeat === currentMySeat) {
        this.showCustomModal({
          title: '担任法官',
          content: '确定要退出座位担任法官吗？',
          success: (res) => {
            if (res.confirm) {
              wx.cloud.callFunction({
                name: 'quickstartFunctions',
                data: { type: 'quitGame', roomId: this.data.roomId }
              });
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
    const target = gameState.players.find(p => p.seat === seat);

    if (phase === 'night' && subPhase === 'werewolf_action' && myRole === 'werewolf') {
      if (!target.is_alive) { wx.showToast({ title: '目标已出局', icon: 'none' }); return; }
      await this.handleWerewolfAction(seat);
      return;
    }
    if (subPhase === 'cupid_action' && myRole === 'cupid') {
      if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
      let targets = this.data.cupidTargets || [];
      if (targets.includes(seat)) { targets = targets.filter(s => s !== seat); }
      else { if (targets.length >= 2) { wx.showToast({ title: '只能选择两人', icon: 'none' }); return; } targets.push(seat); }
      this.setData({ cupidTargets: targets });
      return;
    }
    if (subPhase === 'guard_action' && myRole === 'guard') {
      if (!target.is_alive) { wx.showToast({ title: '不能守护已出局的玩家', icon: 'none' }); return; }
      await this.onGuardAction(seat);
      return;
    }
    if (subPhase === 'seer_action' && myRole === 'seer') {
      if (!target.is_alive) { wx.showToast({ title: '已死玩家无法查验', icon: 'none' }); return; }
      if (seat === this.data.mySeat) { wx.showToast({ title: '不能查验自己', icon: 'none' }); return; }
      this.showCustomModal({ title: '查验身份', content: `确定要查验 ${target.seat}号 (${target.nickname}) 的身份吗？`, success: (res) => { if (res.confirm) this.onSeerAction(seat); } });
      return;
    }
    if (subPhase === 'witch_action' && myRole === 'witch') {
      if (myRoleState.witch_poison_used) { wx.showToast({ title: '毒药已用过', icon: 'none' }); return; }
      if (!target.is_alive) { wx.showToast({ title: '不能对死者使用毒药', icon: 'none' }); return; }
      this.showCustomModal({ title: '使用毒药', content: `确定要毒死 ${target.nickname} 吗？`, confirmColor: '#ff4d4f', success: (res) => { if (res.confirm) this.onWitchPoison(seat); } });
      return;
    }
    if (subPhase === 'hunter_action' && myRole === 'hunter') {
      if (!target.is_alive) { wx.showToast({ title: '不能带走已出局的玩家', icon: 'none' }); return; }
      if (seat === this.data.mySeat) { wx.showToast({ title: '不能带走自己', icon: 'none' }); return; }
      this.showCustomModal({ title: '开枪带人', content: `确定要带走 ${seat}号 玩家 (${target.nickname}) 吗？`, success: (res) => { if (res.confirm) this.onHunterAction(seat); } });
      return;
    }
    if (subPhase === 'sheriff_voting') {
      if (!target.is_alive) { wx.showToast({ title: '无法投票给已死玩家', icon: 'none' }); return; }
      if (this.data.mySeat === seat) { wx.showToast({ title: '不能投给自己', icon: 'none' }); return; }
      if (!gameState.game_state.sheriff_candidate_seats.includes(seat)) { wx.showToast({ title: '只能投给候选人', icon: 'none' }); return; }
      this.onSheriffVote(seat);
      return;
    }
    if (subPhase === 'sheriff_handover') {
      if (this.data.gameState.game_state.sheriff_seat !== this.data.mySeat) return;
      if (!target.is_alive) { wx.showToast({ title: '目标已死亡', icon: 'none' }); return; }
      this.showCustomModal({ title: '移交警徽', content: `确定将警徽移交给 ${target.seat}号 玩家 (${target.nickname}) 吗？`, success: (res) => { if (res.confirm) { this.onSheriffHandover(seat); } } });
      return;
    }
    if (subPhase === 'voting' || subPhase === 'pk_voting' || phase === 'day_voting') {
      if (!me.is_alive) { wx.showToast({ title: '您已出局，无法投票', icon: 'none' }); return; }
      if (!target.is_alive) { wx.showToast({ title: '目标已出局', icon: 'none' }); return; }
      if (myRole === 'idiot' && myRoleState.idiot_revealed) { wx.showToast({ title: '白痴翻牌后失去投票权', icon: 'none' }); return; }
      this.onDayVote(seat);
      return;
    }

    if (gameState.game_state.status === 'playing') {
      if (phase === 'night') return;

      // Fix: Explicitly exclude voting phases to prevent marking during vote
      const isVoting = ['voting', 'pk_voting', 'sheriff_voting', 'sheriff_pk_voting'].includes(subPhase) || phase === 'day_voting';
      if (isVoting) return;

      this.showMarkPlayerModal(e);
    }
  },

  onBackHome() {
    if (this.data.isCreator) { wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'deleteRoom', roomId: this.data.roomId } }).catch(console.error); }
    wx.reLaunch({ url: '/pages/index/index' });
  },

  toggleRoleCard() {
    // Safety: No role card in waiting/setup phase
    if (this.data.gameState && this.data.gameState.game_state.status !== 'playing') return;

    if (!this.data.showRoleCard) {
      // 打开过程
      this.setData({
        showRoleCard: true,
        roleCardFlipped: false
      });
      // 延迟触发翻转，确保 DOM 已渲染且过渡生效
      setTimeout(() => {
        this.setData({
          roleCardFlipped: true
        });

        // 开启自动收起计时器 (如果是非法官)
        if (!this.data.isJudge) {
          if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer);
          this.autoCloseTimer = setTimeout(() => {
            if (this.data.showRoleCard && this.data.roleCardFlipped) {
              this.toggleRoleCard();
            }
          }, 10000); // 10s default
        }
      }, 150);
    } else {
      // 关闭过程
      if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer);

      this.setData({
        roleCardFlipped: false
      });
      // 等待翻转动画结束 (400ms) 后再隐藏弹窗
      setTimeout(() => {
        this.setData({
          showRoleCard: false
        });
      }, 400);
    }
  },



  toggleTheaterMode() {
    this.setData({ isTheaterMode: !this.data.isTheaterMode });
    wx.showToast({ title: this.data.isTheaterMode ? '已进入全屏视野' : '已退出全屏', icon: 'none' });
  },

  toggleLog() { this.setData({ showLog: !this.data.showLog }); },




  onCardTap() {
    if (!this.data.roleCardFlipped) {
      this.setData({ roleCardFlipped: true });
    }
  },

  async onConfirmRole() {
    if (this.data.hasConfirmedRole) return;
    this.setData({ hasConfirmedRole: true }); // Optimistic UI update
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'confirmRole', roomId: this.data.roomId }
      });
      // If triggered=true, phase will change automatically via watcher
    } catch (e) {
      console.error('[ConfirmRole] Error:', e);
      this.setData({ hasConfirmedRole: false }); // Revert on error
      wx.showToast({ title: '确认失败，请重试', icon: 'none' });
    }
  },

  doNothing: function () { },


  onReplayAudio() {
    const gs = this.data.gameState;
    if (gs && gs.game_state.current_instruction && gs.game_state.current_instruction.audio) {
      const keys = gs.game_state.current_instruction.audio; // It might be array or object {keys: []}
      // Check structure from utils.js: it returns { keys: [...] } or just array? 
      // index.js: audio: { keys: audioKeys, duration: ... }
      // So here it depends on how it's stored. 
      // Let's check handleRoomUpdate logic.
      // Actually index.js sends `audio: { keys: ... }`.

      let finalKeys = [];
      if (Array.isArray(keys)) finalKeys = keys;
      else if (keys.keys) finalKeys = keys.keys;

      if (finalKeys.length > 0) {
        wx.showToast({ title: '重播语音...', icon: 'none' });
        this.playAudioKeys(finalKeys);
      } else {
        wx.showToast({ title: '当前无语音', icon: 'none' });
      }
    }
  },

  async onDeleteRoom() {
    wx.showModal({
      title: '解散房间',
      content: '确定要解散房间吗？此操作不可逆。',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '解散中...' });
          try {
            await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'deleteRoom', roomId: this.data.roomId } });
            wx.removeStorageSync(`player_marks_${this.data.roomId}`);
            wx.showToast({ title: '房间已解散', icon: 'none' });
            setTimeout(() => { wx.reLaunch({ url: '/pages/index/index' }); }, 1500);
          } catch (e) {
            console.error(e);
            wx.showToast({ title: '解散失败', icon: 'none' });
          } finally { wx.hideLoading(); }
        }
      }
    });
  },

  onUnload() {
    if (this.watcher) {
      try { this.watcher.close(); } catch (e) { }
    }
    if (this.durationTimer) { clearInterval(this.durationTimer); }
    if (this.dayDawnSafetyTimer) { clearTimeout(this.dayDawnSafetyTimer); }
    if (this.voteResultTimer) { clearTimeout(this.voteResultTimer); }
    if (this.autoCloseTimer) { clearTimeout(this.autoCloseTimer); }

    // Clear Action Timer (20s confirm)
    if (this.stopActionTimer) this.stopActionTimer();

    // Clear Audio/Phase Timer (from Behavior)
    if (this.stopAudioAndTimer) this.stopAudioAndTimer();

    // 销毁 InnerAudioContext 实例
    if (this.audioCtx) {
      try {
        this.audioCtx.stop();
        // 关键修复：增加更严谨的判断，并在某些环境下 catch destroy 的内部错误
        if (typeof this.audioCtx.destroy === 'function') {
          console.log('[Room] Destroying audio context...');
          this.audioCtx.destroy();
        }
      } catch (e) {
        console.warn('Audio cleanup error suppressed:', e);
      } finally {
        this.audioCtx = null;
      }
    }
  }
});
