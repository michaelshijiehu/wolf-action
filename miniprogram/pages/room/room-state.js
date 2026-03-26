/**
 * 房间状态管理模块
 * 优化版本：减少 setData 调用，提高性能
 */

const { ROLE_NAMES, WOLF_ROLES } = require('../../constants/roles');
const { deepEqual } = require('../../utils/stateManager');

// 需要监听变化的字段
const WATCH_FIELDS = [
  'gameState', 'mySeat', 'isAlive', 'myRole', 'myRoleState', 'isMyTurn',
  'currentCount', 'wolfKillTarget', 'witchKillTarget', 'myVoteTarget',
  'isCreator', 'isJudge', 'markOptions', 'enrichedVotingHistory',
  'wolfConsensusTarget', 'showVoteResultModal', 'currentVoteResult',
  'isSheriffCandidate', 'judgeSummary', 'hasConfirmedRole',
  'confirmedCount', 'tickerLogs'
];

module.exports = Behavior({
  methods: {
    /**
     * 处理房间更新（主入口）
     */
    handleRoomUpdate(gameState) {
      if (this.isUnloaded) return;

      // 设置导航栏标题
      if (this.data.roomId) {
        wx.setNavigationBarTitle({ title: '房间: ' + this.data.roomId });
      }

      // 处理等待状态重置
      if (gameState.game_state.status === 'waiting') {
        this.handleWaitingState(gameState);
      }

      const lastGameState = this.data.gameState;
      const stateChanges = this.detectStateChanges(lastGameState, gameState);

      // 处理阶段变化
      if (stateChanges.isSubPhaseChanged || stateChanges.isStatusChanged) {
        this.stopAudioAndTimer();
      }

      // 处理发牌阶段 (移至 setData 回调中，确保状态已更新)
      // 处理头像缓存
      this.processAvatars(gameState).then(() => {
        this.applyGameStateUpdates(gameState, lastGameState, stateChanges);
      });
    },

    /**
     * 检测状态变化
     */
    detectStateChanges(lastGameState, newGameState) {
      const isStatusChanged = lastGameState &&
        lastGameState.game_state.status === 'waiting' &&
        newGameState.game_state.status === 'playing';

      const isSubPhaseChanged = lastGameState &&
        newGameState.game_state.sub_phase !== lastGameState.game_state.sub_phase;

      const isNewGameStart = !lastGameState && newGameState.game_state.status === 'playing';

      const enteringDealCards = isSubPhaseChanged &&
        newGameState.game_state.sub_phase === 'deal_cards';

      return {
        isStatusChanged,
        isSubPhaseChanged,
        isNewGameStart,
        enteringDealCards
      };
    },

    /**
     * 处理等待状态
     */
    handleWaitingState(gameState) {
      if (this.data.roomId) {
        try {
          wx.removeStorageSync(`player_marks_${this.data.roomId}`);
        } catch (e) { }
      }

      this.setData({
        judgeSummary: null,
        wolfKillTarget: null,
        wolfVoteDetails: [],
        witchPoisonTarget: null,
        cupidTargets: [],
        myVoteTarget: null,
        showVoteResultModal: false,
        currentVoteResult: null,
        hasConfirmedRole: false, // 强制重置确认标志
        confirmedCount: 0,       // 强制重置确认计数
        showRoleCard: false,
        gameDuration: '',
        isJudge: false,
        playerMarks: {}
      });
    },

    /**
     * 处理发牌阶段
     */
    handleDealCards() {
      const { gameState, showRoleCard, isJudge } = this.data;
      if (gameState?.game_state.sub_phase === 'deal_cards' && !showRoleCard && !isJudge) {
        this.toggleRoleCard(8000);
      }
    },

    /**
     * 处理头像缓存
     */
    processAvatars(gameState) {
      if (!this.avatarCache) this.avatarCache = {};

      const fileIDsToConvert = gameState.players
        .map(p => p.avatar_url)
        .filter(url => url && url.startsWith('cloud://') && !this.avatarCache[url]);

      if (fileIDsToConvert.length === 0) {
        return Promise.resolve();
      }

      return wx.cloud.getTempFileURL({ fileList: fileIDsToConvert })
        .then(res => {
          res.fileList.forEach(file => {
            if (file.tempFileURL) {
              this.avatarCache[file.fileID] = file.tempFileURL;
            }
          });
        })
        .catch(e => console.error('获取临时文件URL失败', e));
    },

    /**
     * 应用游戏状态更新
     */
    applyGameStateUpdates(gameState, lastGameState, stateChanges) {
      // 应用头像缓存
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
      const unseatedPlayers = this.getUnseatedPlayers(gameState);
      const isJudge = isCreator && !mySeat;

      const phase = gameState.game_state.phase;
      const subPhase = gameState.game_state.sub_phase;

      // 每次子阶段变更，清空本地临时操作状态 (确保弹出新活动框时是空的)
      if (stateChanges.isSubPhaseChanged) {
        const clearData = {
          myVoteTarget: null,
          wolfKillTarget: null,
          witchPoisonTarget: null,
          cupidTargets: [],
          wolfVoteDetails: [] // 始终清空投票详情
        };
        
        this.setData(clearData);
      }

      // 处理新的一天 (彻底解决跨天数据污染)
      if (this.isNewDay(lastGameState, gameState)) {
        this.setData({
          myVoteTarget: null,
          wolfKillTarget: null,
          witchPoisonTarget: null,
          cupidTargets: [],
          wolfVoteDetails: [],
          showVoteResultModal: false,
          currentVoteResult: null
        });
      }

      // 处理音频和倒计时
      if (isCreator) {
        this.handleCreatorAudio(gameState, lastGameState, stateChanges);
      } else {
        this.handlePlayerCountdown(stateChanges);
      }

      // 计算角色相关信息
      const roleInfo = this.calculateRoleInfo(me, gameState, phase, subPhase);
      const actionInfo = this.calculateActionInfo(gameState, mySeat, phase, subPhase, roleInfo.myRole, isJudge);

      // 处理回合定时器
      this.handleTurnTimer(roleInfo.isMyTurn, lastGameState, gameState);

      // 检测警长变动并提醒
      if (lastGameState && gameState.game_state.sheriff_seat !== lastGameState.game_state.sheriff_seat) {
        if (gameState.game_state.sheriff_seat) {
          this.notifySheriffBadge(gameState.game_state.sheriff_seat);
        }
      }

      // 计算其他UI状态
      const uiState = this.calculateUIState(gameState, lastGameState, me, mySeat, isJudge, subPhase);

      // 构建更新对象
      const updates = {
        gameState,
        loading: false,
        mySeat,
        isAlive: me ? me.is_alive : false,
        unseatedPlayers,
        isCreator,
        isJudge,
        currentCount: gameState.players.filter(p => p.openid).length,
        tickerLogs: this.getTickerLogs(gameState),
        ...roleInfo,
        ...actionInfo,
        ...uiState
      };

      // 检查是否需要更新配置
      if (gameState.game_state.status === 'waiting') {
        const lastTotalSeats = this.data.gameState ? this.data.gameState.players.length : 0;
        const currentTotalSeats = gameState.players.length;
        if (currentTotalSeats !== lastTotalSeats) {
          this.updateRecommendedConfig(currentTotalSeats);
        }

        // 关键：非房主实时同步房主的配置
        if (!isCreator && gameState.config && gameState.config.roles) {
          const roles = gameState.config.roles;
          const config = {
            werewolf: roles.werewolf || 0,
            villager: roles.villager || 0,
            win_mode: gameState.config.win_mode || 'kill_side',
            isManualMode: !!gameState.config.isManualMode
          };
          const godRoles = ['seer', 'witch', 'hunter', 'idiot', 'guard', 'cupid'];
          godRoles.forEach(role => {
            config[role] = !!roles[role];
          });
          
          // 只有当配置发生变化时才更新，避免频繁 setData
          if (!this.data.tempConfig || !deepEqual(this.data.tempConfig, config)) {
            this.setData({ tempConfig: config }, () => {
              this.recalcConfig();
            });
          }
        }
      }

      // 处理游戏时长计时器
      this.handleGameDurationTimer(gameState);

      // 处理天亮安全定时器
      if (isCreator && subPhase === 'day_dawn') {
        this.handleDayDawnSafetyTimer();
      }

      // 只更新变化的字段
      this.setData(updates, () => {
        if (stateChanges.enteringDealCards) {
          this.handleDealCards();
        }
      });
    },

    /**
     * 获取未入座玩家列表
     */
    getUnseatedPlayers(gameState) {
      const seatedOpenids = gameState.players.map(p => p.openid).filter(id => !!id);
      const NOW = Date.now();

      return (gameState.visitors || [])
        .filter(v => !seatedOpenids.includes(v.openid))
        .filter(v => (NOW - (v.last_active || 0)) < 300000)
        .map(v => {
          if (v.avatar_url && v.avatar_url.startsWith('cloud://') && this.avatarCache[v.avatar_url]) {
            return { ...v, avatar_url: this.avatarCache[v.avatar_url] };
          }
          return v;
        });
    },

    /**
     * 判断是否为新的一天
     */
    isNewDay(lastGameState, newGameState) {
      if (!lastGameState) return false;
      if (newGameState.game_state.day_count > lastGameState.game_state.day_count) return true;
      if (newGameState.game_state.sub_phase === 'night_start' &&
        lastGameState.game_state.sub_phase !== 'night_start') return true;
      return false;
    },

    /**
     * 计算角色信息
     */
    calculateRoleInfo(me, gameState, phase, subPhase) {
      if (!me) {
        return { myRole: null, myRoleState: {}, isMyTurn: false, witchKillTarget: null };
      }

      const myRole = subPhase === 'game_welcome' ? 'unknown' : me.role;
      const myRoleState = me.role_state || {};
      const instructions = gameState.game_state.current_instruction || {};

      let witchKillTarget = null;
      if (myRole === 'witch' && instructions.witch_info) {
        witchKillTarget = instructions.witch_info.killTarget;
      }

      let isMyTurn = false;
      if (instructions.allowAction) {
        const allowed = instructions.allowAction;
        if (allowed.includes('all')) {
          isMyTurn = me.is_alive;
        } else if (allowed.includes('werewolf')) {
          isMyTurn = WOLF_ROLES.includes(myRole) && me.is_alive;
        } else if (allowed.includes('sheriff')) {
          // 警长行动逻辑：无论是生是死（移交警徽时已死），只要是警长就是他的回合
          isMyTurn = gameState.game_state.sheriff_seat === me.seat;
        } else if (allowed.includes('hunter')) {
          // 猎人行动逻辑：死后开枪，必须判定为他的回合
          isMyTurn = myRole === 'hunter';
        } else {
          isMyTurn = allowed.includes(myRole) && me.is_alive;
        }
      } else if (instructions.roleRequired) {
        // 兼容旧逻辑：只要子阶段包含角色名（wake/action/sleep），就视为该玩家的回合
        const currentSub = subPhase || '';
        const roleReq = instructions.roleRequired;
        
        if (roleReq === 'werewolf') {
          isMyTurn = WOLF_ROLES.includes(myRole) && me.is_alive && currentSub.includes('werewolf');
        } else {
          isMyTurn = myRole === roleReq && me.is_alive && currentSub.includes(roleReq);
        }
      } else if (me.is_alive || subPhase === 'deal_cards' || subPhase === 'game_welcome' || subPhase === 'sheriff_handover') {
        if (subPhase === 'deal_cards' || subPhase === 'game_welcome') isMyTurn = true;
        else if (subPhase === 'hunter_confirm' && myRole === 'hunter') isMyTurn = true;
        else if (subPhase === 'pk_voting' && me.is_alive) isMyTurn = true;
        else if (subPhase === 'sheriff_voting' && me.is_alive) {
          // 参选人不能投票
          const isCandidate = (gameState.game_state.sheriff_candidate_seats || []).includes(me.seat);
          if (!isCandidate) isMyTurn = true;
        }
        else if (subPhase === 'sheriff_pk_voting' && me.is_alive) {
          // PK玩家不能投票
          const isPK = (gameState.game_state.pk_candidates || []).includes(me.seat);
          if (!isPK) isMyTurn = true;
        }
        else if ((phase === 'day_voting' || phase === 'day_pk') && me.is_alive) isMyTurn = true;
        else if (subPhase === 'hunter_action' && myRole === 'hunter') isMyTurn = true;
        else if (subPhase === 'sheriff_handover' && gameState.game_state.sheriff_seat === me.seat) isMyTurn = true;
      }

      return { myRole, myRoleState, isMyTurn, witchKillTarget };
    },

    /**
     * 计算行动信息
     */
    calculateActionInfo(gameState, mySeat, phase, subPhase, myRole, isJudge) {
      const actions = gameState.current_round_actions || {};
      const players = gameState.players || [];

      // 狼人击杀详情 (实时同步队友目标)
      let wolfVoteDetails = [];
      let wolfKillTarget = null;
      const werewolfVotes = actions.werewolf_votes || {};
      
      const isWolfSide = WOLF_ROLES.includes(myRole);
      const isWitchPhase = (subPhase || '').indexOf('witch') !== -1;
      
      if (isWolfSide || isJudge || isWitchPhase) {
        // 如果是女巫，优先从 witch_info 获取击杀目标
        const inst = gameState.game_state.current_instruction;
        if (isWitchPhase && inst?.witch_info?.killTarget) {
          const targetSeat = inst.witch_info.killTarget;
          wolfKillTarget = players.find(p => p.seat === targetSeat);
        }

        const counts = {};
        Object.entries(werewolfVotes).forEach(([voterKey, targetSeat]) => {
          const voterSeat = Number(voterKey);
          const voter = Number.isNaN(voterSeat)
            ? players.find(p => p.openid === voterKey)
            : players.find(p => p.seat === voterSeat);
          if (voter) {
            wolfVoteDetails.push({
              voterSeat: voter.seat,
              voterName: voter.seat === mySeat ? '你' : `${voter.seat}号`,
              targetSeat
            });
            // 统计票数以确定最高票目标 (用于 🎯 标记)
            counts[targetSeat] = (counts[targetSeat] || 0) + 1;
          }
        });

        // 计算最高票目标
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (!wolfKillTarget && sorted.length > 0) {
          const hasConsensus = sorted.length === 1 || sorted[0][1] > sorted[1][1];
          if (hasConsensus) {
            const topSeat = Number(sorted[0][0]);
            wolfKillTarget = players.find(p => p.seat === topSeat);
          }
        }
      }

      // 我的投票目标
      let myVoteTarget = null;
      if (phase === 'day_voting' || (phase === 'day_pk' && subPhase === 'pk_voting')) {
        myVoteTarget = (actions.day_votes || {})[mySeat] || null;
      } else if (subPhase === 'sheriff_voting' || subPhase === 'sheriff_pk_voting') {
        myVoteTarget = (actions.sheriff_votes || {})[mySeat] || null;
      }

      return { wolfVoteDetails, wolfKillTarget, myVoteTarget };
    },

    /**
     * 计算UI状态
     */
    calculateUIState(gameState, lastGameState, me, mySeat, isJudge, subPhase) {
      const myOpenid = this.data.myOpenid;
      const actions = gameState.current_round_actions || {};
      const rolesInGame = gameState.config?.roles || {};
      const sheriffSeat = gameState.game_state.sheriff_seat;

      // 角色确认状态
      let hasConfirmedRole = false;
      let confirmedCount = 0;
      if (subPhase === 'deal_cards') {
        const confirmations = actions.role_confirmations || {};
        confirmedCount = Object.keys(confirmations).length;
        hasConfirmedRole = !!confirmations[myOpenid];
      }

      // 标记选项
      const markOptions = this.getMarkOptions(gameState);

      // 投票历史
      const enrichedVotingHistory = this.processVotingHistory(gameState, sheriffSeat);

      // 投票结果弹窗
      const { showVoteResultModal, currentVoteResult, voteScrollTop } =
        this.calculateVoteResultModal(gameState, lastGameState, enrichedVotingHistory);

      // 狼人共识目标
      let wolfConsensusTarget = null;
      if (gameState.game_state.phase === 'night' && subPhase === 'werewolf_phase') {
        const votes = actions.werewolf_votes || {};
        const counts = {};
        Object.values(votes).forEach(v => counts[v] = (counts[v] || 0) + 1);
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) wolfConsensusTarget = Number(sorted[0][0]);
      }

      // 警长候选人
      const isSheriffCandidate = (gameState.game_state.sheriff_candidate_seats || []).includes(mySeat);

      // 法官摘要
      const judgeSummary = isJudge ? this.buildJudgeSummary(gameState) : null;

      // 投票阶段标识
      const isVotingPhase = ['voting', 'pk_voting', 'sheriff_voting', 'sheriff_pk_voting'].includes(subPhase);

      return {
        markOptions,
        enrichedVotingHistory,
        showVoteResultModal,
        currentVoteResult,
        voteScrollTop,
        wolfConsensusTarget,
        isSheriffCandidate,
        judgeSummary,
        hasConfirmedRole,
        confirmedCount,
        isVotingPhase
      };
    },

    /**
     * 获取标记选项
     */
    getMarkOptions(gameState) {
      const baseOptions = [
        { label: '好人', value: 'good' },
        { label: '狼人嫌疑', value: 'wolf_suspect' },
        { label: '值得信任', value: 'trusted' },
        { label: '未知', value: 'unknown' }
      ];

      if (gameState.game_state.status === 'playing' && gameState.config?.roles) {
        const rolesInGame = gameState.config.roles;
        const godRoles = ['seer', 'witch', 'hunter', 'idiot', 'guard', 'cupid'];
        const activeGods = godRoles.filter(role => rolesInGame[role] > 0);
        const godOptions = activeGods.map(role => ({
          label: `是${ROLE_NAMES[role]}?`,
          value: `is_${role}_suspect`
        }));
        return baseOptions.concat(godOptions);
      }

      return [
        ...baseOptions,
        { label: '神职嫌疑', value: 'god_suspect' }
      ];
    },

    /**
     * 计算投票结果弹窗状态
     */
    calculateVoteResultModal(gameState, lastGameState, enrichedVotingHistory) {
      const subPhase = gameState.game_state.sub_phase;
      const isAnnouncePhase = ['exile_announce', 'election_announce'].includes(subPhase);
      const wasAnnouncePhase = lastGameState &&
        ['exile_announce', 'election_announce'].includes(lastGameState.game_state.sub_phase);

      let showVoteResultModal = this.data.showVoteResultModal || false;
      let currentVoteResult = this.data.currentVoteResult || null;
      let voteScrollTop = this.data.voteScrollTop;

      if (isAnnouncePhase && (!lastGameState || !wasAnnouncePhase)) {
        const latestRound = enrichedVotingHistory?.[0];
        if (latestRound) {
          showVoteResultModal = true;
          currentVoteResult = latestRound;
          voteScrollTop = Math.random() * 0.1;

          if (this.voteResultTimer) clearTimeout(this.voteResultTimer);
          this.voteResultTimer = setTimeout(() => {
            this.setData({ showVoteResultModal: false });
          }, 8000);
        }
      }

      return { showVoteResultModal, currentVoteResult, voteScrollTop };
    },

    /**
     * 构建法官摘要
     */
    buildJudgeSummary(gameState) {
      const actions = gameState.current_round_actions || {};
      const rolesInGame = gameState.config?.roles || {};
      const players = gameState.players;

      return {
        wolfTarget: this.data.wolfKillTarget?.seat || null,
        lovers: gameState.game_state.lovers || [],
        seer: rolesInGame.seer ? {
          target: actions.seer_check?.target,
          isBad: actions.seer_check?.isBad
        } : null,
        guard: rolesInGame.guard ? { target: actions.guard_protect } : null,
        witch: rolesInGame.witch ? {
          save: actions.witch_action?.save,
          poison: actions.witch_action?.poison_target
        } : null,
        magician: rolesInGame.magician ? { targets: actions.magician_exchange } : null,
        merchant: rolesInGame.merchant ? {
          target: actions.merchant_trade,
          item: actions.merchant_item
        } : null,
        silencer: rolesInGame.silencer ? { target: actions.silencer_silence } : null,
        dream_catcher: rolesInGame.dream_catcher ? { target: actions.dream_catcher_sleep } : null,
        wolf_beauty: rolesInGame.wolf_beauty ? { target: actions.wolf_beauty_charm } : null,
        gargoyle: rolesInGame.gargoyle ? { target: actions.gargoyle_check } : null,
        wild_child: rolesInGame.wild_child ? {
          model: players.find(p => p.role === 'wild_child')?.role_state?.model_seat
        } : null,
        gravekeeper: rolesInGame.gravekeeper ? { result: actions.gravekeeper_result } : null
      };
    },

    /**
     * 处理房主音频
     */
    handleCreatorAudio(gameState, lastGameState, stateChanges) {
      const gs = gameState.game_state;
      const inst = gs.current_instruction;
      if (!inst) return;

      // 生成唯一的指令指纹，防止重复播放
      const instructionFingerprint = `${gs.sub_phase}_${inst.expire_time}`;
      if (this.lastInstructionFingerprint === instructionFingerprint) {
        return;
      }
      this.lastInstructionFingerprint = instructionFingerprint;

      // 处理游戏结束音频
      if (gs.status === 'finished' &&
        (!lastGameState || lastGameState.game_state.status !== 'finished')) {
        const winner = gs.winner;
        const audioKey = winner === 'werewolf' ? 'WOLF_WIN' :
          winner === 'good' ? 'VILLAGER_WIN' : 'THIRD_PARTY_WIN';
        this.playAudioKeys([audioKey]);
      }

      // 处理游戏进行中的音频
      if (gs.status === 'playing') {
        const instructionAudio = inst.audio;
        if (instructionAudio) {
          const keys = Array.isArray(instructionAudio) ? instructionAudio :
            (instructionAudio.keys || []);
          if (keys.length > 0) {
            this.playAudioKeys(keys);
          } else {
            this.triggerCountdown(gameState);
          }
        }
      } else {
        this.stopCountdownTimer();
      }
    },

    /**
     * 处理玩家倒计时
     */
    handlePlayerCountdown(stateChanges) {
      const shouldTrigger = stateChanges.isSubPhaseChanged ||
        stateChanges.isStatusChanged ||
        stateChanges.isNewGameStart;

      if (shouldTrigger) {
        setTimeout(() => {
          if (this.data.gameState?.game_state.status === 'playing') {
            this.triggerCountdown(this.data.gameState);
          }
        }, 2000);
      }
    },

    /**
     * 处理回合定时器
     */
    handleTurnTimer(isMyTurn, lastGameState, newGameState) {
      const prevTurn = this.data.isMyTurn;
      const prevPhase = lastGameState?.game_state.sub_phase || '';
      const currPhase = newGameState.game_state.sub_phase;

      if (isMyTurn && (!prevTurn || prevPhase !== currPhase)) {
        this.startActionTimer();
      } else if (!isMyTurn && prevTurn) {
        this.stopActionTimer();
      }
    },

    /**
     * 处理游戏时长计时器
     */
    handleGameDurationTimer(gameState) {
      if (gameState.game_state.status === 'playing' && gameState.game_state.start_time) {
        if (!this.durationTimer) {
          this.durationTimer = setInterval(() => this.updateGameDuration(), 1000);
          this.updateGameDuration();
        }
      } else if (this.durationTimer) {
        clearInterval(this.durationTimer);
        this.durationTimer = null;
      }
    },

    /**
     * 处理天亮安全定时器
     */
    handleDayDawnSafetyTimer() {
      if (this.dayDawnSafetyTimer) clearTimeout(this.dayDawnSafetyTimer);
      this.dayDawnSafetyTimer = setTimeout(() => {
        if (this.data.gameState?.game_state.sub_phase === 'day_dawn') {
          this.onNextPhase();
        }
      }, 10000);
    },

    /**
     * 获取滚动日志
     */
    getTickerLogs(gameState) {
      const filteredKeywords = ['死亡结算', '天亮了', '天黑了', '黑夜降临', '开始'];
      return [...(gameState.timeline || [])]
        .filter(item => !filteredKeywords.some(kw => item.text.includes(kw)))
        .slice(-3)
        .reverse();
    },

    /**
     * 关闭投票结果弹窗
     */
    closeVoteResultModal() {
      this.setData({ showVoteResultModal: false });
      if (this.voteResultTimer) clearTimeout(this.voteResultTimer);
    },

    /**
     * 处理投票历史
     */
    processVotingHistory(gameState, sheriffSeat) {
      if (!gameState?.game_state?.voting_history) return [];

      const players = gameState.players || [];
      const seatMap = {};
      players.forEach(p => seatMap[p.seat] = p);

      const history = gameState.game_state.voting_history.map(round => {
        const votesByTarget = {};
        const voteKeys = Object.keys(round.votes || {}).sort((a, b) => Number(a) - Number(b));

        voteKeys.forEach(voterSeat => {
          const targetSeat = round.votes[voterSeat];
          const voter = seatMap[voterSeat] || { seat: voterSeat, nickname: `${voterSeat}号` };
          const isSheriff = Number(voterSeat) === sheriffSeat;

          if (!votesByTarget[targetSeat]) {
            const isAbstain = !targetSeat || targetSeat == 0 ||
              String(targetSeat) === 'null' || targetSeat == -1;
            const target = isAbstain ? null : (seatMap[targetSeat] || { seat: targetSeat, nickname: `${targetSeat}号` });

            votesByTarget[targetSeat] = {
              targetSeat,
              targetAvatar: target?.avatar_url || '../../images/icons/avatar.png',
              targetName: isAbstain ? '弃票' : (target?.nickname || '未知'),
              isAbstain,
              voters: []
            };
          }

          votesByTarget[targetSeat].voters.push({
            seat: voterSeat,
            avatar: voter.avatar_url || '../../images/icons/avatar.png',
            name: voter.nickname,
            weight: isSheriff ? 1.5 : 1
          });
        });

        const enrichedVotes = Object.values(votesByTarget).sort((a, b) => {
          if (a.isAbstain) return 1;
          if (b.isAbstain) return -1;
          return b.voters.length - a.voters.length;
        });

        return { ...round, enrichedVotes };
      });

      return [...history].reverse();
    }
  }
});
