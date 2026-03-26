/**
 * 游戏阶段状态机 - 彻底修复版
 * 集成了硬核结算逻辑，并采用对象级更新规避数据库错误
 */

const { flowConfig } = require('../constants');
const { applyUpdates, doSaveRecord, checkWinner } = require('../utils');
const { getInitialActions, WOLF_ROLES } = require('../state');

// 引入模块化工具
const winnerChecker = require('./modules/winnerChecker');
const instructionBuilder = require('./modules/instructionBuilder');

/**
 * 核心状态流转函数
 */
const nextPhase = async (db, roomId, roomDoc, roomDocId) => {
  const gs = roomDoc.game_state;

  // 内存级防御：如果数据库中是 null，确保代码后续处理它为对象
  if (!gs.transition_lock) gs.transition_lock = {};

  // 1. 过渡锁检查 (规避并发/误触)
  if (gs.transition_lock?.at) {
    const lockTime = new Date(gs.transition_lock.at).getTime();
    if (!Number.isNaN(lockTime) && (Date.now() - lockTime) < 2000) return roomDoc;
  }

  let updates = { updated_at: new Date() };
  let newTimelineElements = [];
  let newVotingHistoryElements = [];

  // 辅助：日志记录
  const log = (txt, day, phase) => {
    const filteredKeywords = ['天亮了', '天黑了', '黑夜降临', '进入结算'];
    if (filteredKeywords.some(kw => txt.includes(kw))) return;

    newTimelineElements.push({
      day: day || gs.day_count,
      phase: phase || gs.phase,
      text: txt,
      timestamp: new Date()
    });
  };

  // 辅助：设置阶段指令
  const setInst = (key, forcedDuration) => {
    const instUpdates = instructionBuilder.createInstruction(key, {
      forcedDuration,
      gameState: gs,
      updates,
      currentRoundActions: roomDoc.current_round_actions || {}
    });
    if (instUpdates) Object.assign(updates, instUpdates);
  };

  // 辅助：查找下一状态
  const findNextState = (currentSub) => {
    return instructionBuilder.findNextState(currentSub, roomDoc);
  };

  const aliveCount = roomDoc.players.filter(p => p.is_alive).length;
  const discussionTime = Math.max(60, aliveCount * 60);

  // 辅助：开始夜晚循环
  const startNightCycle = () => {
    updates['game_state.phase'] = 'night';
    updates['game_state.day_count'] = gs.day_count + 1;
    
    // 强制物理重置所有动作，确保新的一晚数据纯净
    // 关键修复：使用 db.command.set 确保物理替换而非逻辑合并
    updates['current_round_actions'] = db.command.set({
      role_confirmations: {},
      werewolf_votes: {},
      day_votes: {},
      seer_check: {}, // 修正：使用空对象而非 null
      witch_action: { save: false, poison_target: null },
      guard_protect: null,
      sheriff_votes: {},
      hunter_shoot: null,
      cupid_targets: [],
      magician_exchange: [],
      dream_catcher_sleep: null,
      wolf_beauty_charm: null,
      gargoyle_check: null,
      merchant_trade: null,
      merchant_item: null,
      silencer_silence: null,
      wild_child_choice: null,
      gravekeeper_result: null
    });
    
    // 物理抹除所有白天的中间状态，防止跨天干扰
    updates['game_state.exile_seat'] = null;
    updates['game_state.exile_result'] = null;
    updates['game_state.election_result'] = null;
    updates['game_state.pk_candidates'] = [];
    updates['game_state.current_vote_id'] = null;
    updates['game_state.last_night_deaths'] = [];
    
    setInst('night_start');
  };

  // ==========================================
  // 核心逻辑处理器 (基于 3c566a 深度还原)
  // ==========================================
  const handlers = {
    game_welcome: () => setInst('deal_cards'),
    deal_cards: () => {
      updates['game_state.phase'] = 'night';
      setInst('night_start');
    },
    night_start: () => {
      const nextSub = findNextState('night_start');
      if (nextSub) setInst(nextSub); else setInst('day_announce');
    },

    day_announce: () => {
      // --- 硬核死亡结算 (3c566a 逻辑回归，原 calculate_death 合并) ---
      const cur = roomDoc.current_round_actions || {};
      let deaths = [];

      // 1. 魔术师交换逻辑映射
      const magExchange = cur.magician_exchange || [];
      const getEffectiveTarget = (seat) => {
        if (magExchange.length === 2) {
          if (seat === magExchange[0]) return magExchange[1];
          if (seat === magExchange[1]) return magExchange[0];
        }
        return seat;
      };

      // 2. 狼人击杀计算
      const wolfVotes = cur.werewolf_votes || {};
      const wolfCounts = {};
      Object.values(wolfVotes).forEach(v => { wolfCounts[v] = (wolfCounts[v] || 0) + 1; });
      const wolfSorted = Object.entries(wolfCounts).sort((a, b) => b[1] - a[1]);
      let wolfKillOriginal = (wolfSorted.length > 0) ? Number(wolfSorted[0][0]) : null;
      const wolfKill = wolfKillOriginal ? getEffectiveTarget(wolfKillOriginal) : null;

      console.log(`[DeathCalc] WolfVotes:`, wolfVotes, `Original: ${wolfKillOriginal}, Effective: ${wolfKill}`);

      // 3. 各类职能目标映射
      const witchSave = cur.witch_action?.save ? wolfKill : null;
      const witchPoison = cur.witch_action?.poison_target ? getEffectiveTarget(Number(cur.witch_action.poison_target)) : null;
      const guardProtect = cur.guard_protect ? getEffectiveTarget(Number(cur.guard_protect)) : null;
      const dreamTarget = cur.dream_catcher_sleep ? Number(cur.dream_catcher_sleep) : null;
      const lastDreamTarget = gs.last_dream_catcher_target ? Number(gs.last_dream_catcher_target) : null;

      const merchantTarget = cur.merchant_trade ? Number(cur.merchant_trade) : null;
      const merchantItem = cur.merchant_item || null;
      const shroudTarget = merchantItem === 'shroud' ? merchantTarget : null;

      console.log(`[DeathCalc] Defenses - Save: ${witchSave}, Guard: ${guardProtect}, Dream: ${dreamTarget}, Shroud: ${shroudTarget}`);

      // 4. 处理核心死亡逻辑
      if (wolfKill && roomDoc.players.find(p => p.seat === wolfKill)?.is_alive) {
        if (!(shroudTarget && wolfKill === shroudTarget)) { // 黑商幕布免疫
          if (wolfKill === witchSave && wolfKill === guardProtect) {
            deaths.push({ seat: wolfKill, reason: 'milk_guard_clash' }); // 同守同救
            console.log(`[DeathCalc] ${wolfKill} died of Clash`);
          } else if (wolfKill !== witchSave && wolfKill !== guardProtect) {
            if (!dreamTarget || wolfKill !== dreamTarget) {
              deaths.push({ seat: wolfKill, reason: 'werewolf_kill' });
              console.log(`[DeathCalc] ${wolfKill} killed by Wolves`);
            } else {
              console.log(`[DeathCalc] ${wolfKill} protected by Dream Catcher`);
            }
          } else {
            console.log(`[DeathCalc] ${wolfKill} was Saved or Protected`);
          }
        } else {
          console.log(`[DeathCalc] ${wolfKill} protected by Merchant Shroud`);
        }
      }

      if (witchPoison && roomDoc.players.find(p => p.seat === witchPoison)?.is_alive) {
        if (!dreamTarget || witchPoison !== dreamTarget) deaths.push({ seat: witchPoison, reason: 'witch_poison' });
      }

      // 黑商毒药
      if (merchantItem === 'poison' && merchantTarget && roomDoc.players.find(p => p.seat === merchantTarget)?.is_alive) {
        if (!deaths.some(d => d.seat === merchantTarget)) {
          if (!dreamTarget || merchantTarget !== dreamTarget) deaths.push({ seat: merchantTarget, reason: 'merchant_poison' });
        }
      }

      // 黑商幸运金币
      if (merchantItem === 'lucky_card' && merchantTarget) {
        const idx = deaths.findIndex(d => d.seat === merchantTarget);
        if (idx > -1) deaths.splice(idx, 1);
      }

      // 摄梦人规则
      if (dreamTarget && lastDreamTarget && dreamTarget === lastDreamTarget) {
        if (roomDoc.players.find(p => p.seat === dreamTarget)?.is_alive && !deaths.some(d => d.seat === dreamTarget)) {
          deaths.push({ seat: dreamTarget, reason: 'dream_catcher_repeat' });
        }
      }
      const dreamCatcher = roomDoc.players.find(p => p.role === 'dream_catcher');
      if (dreamCatcher && deaths.some(d => d.seat === dreamCatcher.seat) && dreamTarget) {
        if (roomDoc.players.find(p => p.seat === dreamTarget)?.is_alive && !deaths.some(d => d.seat === dreamTarget)) {
          deaths.push({ seat: dreamTarget, reason: 'dream_catcher_link' });
        }
      }

      // 狼美人魅惑
      const wolfBeauty = roomDoc.players.find(p => p.role === 'wolf_beauty');
      if (wolfBeauty && deaths.some(d => d.seat === wolfBeauty.seat) && cur.wolf_beauty_charm) {
        const charmTarget = Number(cur.wolf_beauty_charm);
        if (roomDoc.players.find(p => p.seat === charmTarget)?.is_alive && !deaths.some(d => d.seat === charmTarget)) {
          deaths.push({ seat: charmTarget, reason: 'wolf_beauty_charm' });
        }
      }

      // 情侣殉情
      const lovers = gs.lovers || [];
      if (lovers.length === 2) {
        const currentDeadSeats = deaths.map(d => d.seat);
        lovers.forEach(seat => {
          if (currentDeadSeats.includes(seat)) {
            const other = lovers.find(s => s !== seat);
            if (roomDoc.players.find(p => p.seat === other)?.is_alive && !deaths.some(d => d.seat === other)) {
              deaths.push({ seat: other, reason: 'lover' });
            }
          }
        });
      }

      // 野孩子变身判定
      const allDeadSeats = deaths.map(d => d.seat);
      const wildChild = roomDoc.players.find(p => p.role === 'wild_child');
      if (wildChild && wildChild.is_alive && wildChild.role_state.model_seat && allDeadSeats.includes(wildChild.role_state.model_seat)) {
        const wcIdx = roomDoc.players.findIndex(p => p.role === 'wild_child');
        if (wcIdx > -1) {
          updates[`players.${wcIdx}.role_state.is_wolf_side`] = true;
          log(`野孩子榜样死亡，已加入狼人阵营`);
        }
      }

      updates['game_state.last_night_deaths'] = deaths;
      updates['game_state.last_dream_catcher_target'] = dreamTarget || null;

      // 接着执行天明逻辑
      const roles = roomDoc.config?.roles || {};
      // If sheriff config is completely omitted, default to true unless explicitly 0 or false
      if (gs.day_count === 1 && !gs.sheriff_seat && roles.sheriff !== 0 && roles.sheriff !== false) {
        updates['game_state.phase'] = 'sheriff_election';
        setInst('sheriff_nomination');
      } else {
        updates['game_state.phase'] = 'day';
        setInst('day_dawn');
      }
    },

    sheriff_nomination: () => {
      const cands = gs.sheriff_candidate_seats || [];
      if (cands.length === 0) {
        updates['game_state.phase'] = 'day';
        updates['game_state.sheriff_candidate_seats'] = [];
        setInst('day_dawn');
      } else if (cands.length === 1) {
        log(`仅有 ${cands[0]}号 竞选，自动当选警长`);
        updates['game_state.sheriff_seat'] = cands[0];
        updates['game_state.election_result'] = 'elected';
        setInst('election_announce');
      } else {
        updates['game_state.current_vote_id'] = `v_sh_${Date.now()}`;
        updates['current_round_actions.sheriff_votes'] = {};
        setInst('sheriff_speech', cands.length * 20);
      }
    },

    sheriff_speech: () => {
      const cands = gs.sheriff_candidate_seats || [];
      if (cands.length === 1) {
        log(`仅有 ${cands[0]}号 在警上，自动当选`);
        updates['game_state.sheriff_seat'] = cands[0];
        updates['game_state.election_result'] = 'elected';
        setInst('election_announce');
      } else {
        setInst('sheriff_voting');
      }
    },

    sheriff_voting: () => {
      handleSheriffVoteCalculation({ log });
    },

    sheriff_pk_speech: () => {
      updates['game_state.current_vote_id'] = `v_shpk_${Date.now()}`;
      updates['current_round_actions.sheriff_votes'] = {};
      setInst('sheriff_pk_voting', 15);
    },

    sheriff_pk_voting: () => {
      handleSheriffVoteCalculation({ log, isPK: true });
    },

    election_announce: () => {
      updates['game_state.sheriff_candidate_seats'] = [];
      updates['game_state.phase'] = 'day';
      setInst('day_dawn');
    },

    day_dawn: () => {
      updates['game_state.is_day_ending'] = false;
      const deaths = gs.last_night_deaths || [];
      if (deaths.length === 0) log('昨晚是平安夜');
      else log(`昨晚，${deaths.map(d => d.seat + '号').join(', ')} 倒在了血泊中`);

      deaths.forEach(d => {
        const idx = roomDoc.players.findIndex(p => p.seat === d.seat);
        if (idx > -1 && roomDoc.players[idx].is_alive) {
          updates[`players.${idx}.is_alive`] = false;
          updates[`players.${idx}.death_reason`] = d.reason;
        }
      });
      // Removed updates['players'] = players to prevent overlap
      updates['game_state.last_revealed_deaths'] = deaths;

      const deadSheriff = deaths.find(d => d.seat === gs.sheriff_seat);
      const deadHunter = deaths.find(d => {
        const p = roomDoc.players.find(x => x.seat === d.seat);
        return p && p.role === 'hunter' && d.reason !== 'witch_poison';
      });

      if (deadSheriff) setInst('sheriff_handover');
      else if (deadHunter) setInst('hunter_action');
      else {
        updates['game_state.phase'] = 'day';
        setInst('discussion', discussionTime);
      }
    },

    discussion: () => {
      updates['game_state.phase'] = 'day_voting';
      updates['game_state.current_vote_id'] = `v_${Date.now()}`;
      updates['current_round_actions.day_votes'] = {};
      setInst('voting');
    },

    voting: () => {
      handleDayVoteCalculation({ log });
    },

    day_pk: () => {
      updates['game_state.current_vote_id'] = `v_pk_${Date.now()}`;
      updates['current_round_actions.day_votes'] = {};
      setInst('pk_voting');
    },

    pk_voting: () => {
      handleDayVoteCalculation({ log, isPK: true });
    },

    exile_announce: () => {
      updates['current_round_actions.day_votes'] = {}; 
      if (gs.exile_result === 'out') updates['game_state.is_day_ending'] = true;
      if (gs.exile_result === 'idiot_reveal' || gs.exile_result === 'tie') startNightCycle();
      else setInst('leave_speech');
    },

    leave_speech: () => {
      const out = gs.last_exiled_seat;
      const pIdx = roomDoc.players.findIndex(x => x.seat === out);
      if (pIdx > -1 && gs.exile_result === 'out') {
        updates[`players.${pIdx}.is_alive`] = false;
        updates[`players.${pIdx}.death_reason`] = 'vote';

        const lovers = gs.lovers || [];
        if (lovers.includes(out)) {
          const other = lovers.find(s => s !== out);
          const oIdx = roomDoc.players.findIndex(pl => pl.seat === other);
          if (oIdx > -1 && roomDoc.players[oIdx].is_alive) {
            updates[`players.${oIdx}.is_alive`] = false;
            updates[`players.${oIdx}.death_reason`] = 'lover';
            log(`${other}号 殉情而去`);
          }
        }
      }
      const p = roomDoc.players.find(x => x.seat === out);
      if (gs.sheriff_seat === out) {
        updates['game_state.phase'] = 'day';
        setInst('sheriff_handover');
      } else if (p && p.role === 'hunter' && p.role_state?.hunter_status === 'can_shoot') {
        const hIdx = roomDoc.players.findIndex(x => x.seat === out);
        if (hIdx > -1) {
          updates[`players.${hIdx}.role_state.hunter_shoot_used`] = false;
        }
        updates['game_state.phase'] = 'day';
        setInst('hunter_action');
      } else {
        startNightCycle();
      }
    },

    sheriff_handover: () => {
      if (gs.is_day_ending) startNightCycle();
      else setInst('discussion', discussionTime);
    },

    hunter_action: () => {
      const shootTarget = roomDoc.current_round_actions.hunter_shoot;
      if (shootTarget) {
        const idx = roomDoc.players.findIndex(p => p.seat == shootTarget);
        if (idx > -1) {
          updates[`players.${idx}.is_alive`] = false;
          updates[`players.${idx}.death_reason`] = 'hunter_shoot';
          log(`${shootTarget}号 被猎人带走`);
          if (roomDoc.players[idx].role === 'dream_catcher' && gs.last_dream_catcher_target) {
            const dreamIdx = roomDoc.players.findIndex(p => p.seat === gs.last_dream_catcher_target);
            if (dreamIdx > -1 && roomDoc.players[dreamIdx].is_alive) {
              updates[`players.${dreamIdx}.is_alive`] = false;
              updates[`players.${dreamIdx}.death_reason`] = 'dream_catcher_link';
              log(`${gs.last_dream_catcher_target}号 受摄梦牵连出局`);
            }
          }
          if (gs.sheriff_seat == shootTarget) {
            updates['game_state.phase'] = 'day';
            setInst('sheriff_handover');
            return;
          }
        }
      }
      if (gs.is_day_ending) startNightCycle();
      else setInst('discussion', discussionTime);
    }
  };

  // --- 投票计算辅助函数 ---
  function handleSheriffVoteCalculation({ log, isPK = false }) {
    const deadSeats = (gs.last_night_deaths || []).map(d => d.seat);
    const votes = roomDoc.current_round_actions.sheriff_votes || {};
    const counts = {};
    Object.entries(votes).forEach(([v, t]) => {
      const voterSeat = Number(v);
      const voter = roomDoc.players.find(p => p.seat === voterSeat);
      if (!voter || !voter.is_alive || deadSeats.includes(voterSeat)) return;
      if (roomDoc.current_round_actions?.silencer_silence === voterSeat) return;
      if (voter.role === 'idiot' && voter.role_state?.idiot_revealed) return;
      if (t > 0) counts[t] = (counts[t] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const historyPhase = isPK ? 'sheriff_pk_voting' : 'sheriff_election';
    if (sorted.length > 0) {
      const max = sorted[0][1];
      const winners = sorted.filter(x => Math.abs(x[1] - max) < 0.01).map(x => Number(x[0]));
      if (winners.length === 1) {
        log(`${isPK ? 'PK' : ''}警长当选: ${winners[0]}号`);
        updates['game_state.sheriff_seat'] = winners[0];
        updates['game_state.election_result'] = 'elected';
        updates['current_round_actions.sheriff_votes'] = {}; 
        newVotingHistoryElements.push({ day: gs.day_count, phase: historyPhase, votes, result: 'elected', winner: winners[0] });
        setInst('election_announce');
      } else if (!isPK) {
        updates['game_state.pk_candidates'] = winners;
        updates['game_state.sheriff_candidate_seats'] = winners;
        updates['game_state.phase'] = 'sheriff_pk'; 
        updates['current_round_actions.sheriff_votes'] = {}; 
        newVotingHistoryElements.push({ day: gs.day_count, phase: historyPhase, votes, result: 'pk', pk_candidates: winners });
        setInst('sheriff_pk_speech');
      } else {
        log(`警长PK再次平票，警徽流失`);
        updates['game_state.election_result'] = 'tie';
        updates['game_state.sheriff_candidate_seats'] = []; 
        updates['current_round_actions.sheriff_votes'] = {}; 
        newVotingHistoryElements.push({ day: gs.day_count, phase: historyPhase, votes, result: 'tie' });
        setInst('election_announce');
      }
    } else {
      log(`无人投票，警徽流失`);
      updates['game_state.election_result'] = 'failed';
      updates['game_state.sheriff_candidate_seats'] = []; // Clear hand raises on fail
      updates['current_round_actions.sheriff_votes'] = {}; // IMPORTANT: clear votes
      newVotingHistoryElements.push({ day: gs.day_count, phase: historyPhase, votes, result: 'failed' });
      setInst(isPK ? 'election_announce' : 'day_dawn');
    }
  }

  function handleDayVoteCalculation({ log, isPK = false }) {
    const dayVotes = roomDoc.current_round_actions.day_votes || {};
    const counts = {};
    Object.entries(dayVotes).forEach(([v, t]) => {
      const voterSeat = Number(v);
      const voter = roomDoc.players.find(p => p.seat === voterSeat);
      if (!voter || !voter.is_alive) return;
      if (roomDoc.current_round_actions?.silencer_silence === voterSeat) return;
      if (voter.role === 'idiot' && voter.role_state?.idiot_revealed) return;
      const weight = (voterSeat === gs.sheriff_seat) ? 1.5 : 1;
      if (t > 0) counts[t] = (counts[t] || 0) + weight;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const historyPhase = isPK ? 'pk_voting' : 'day_voting';
    if (sorted.length > 0) {
      const max = sorted[0][1];
      const winners = sorted.filter(x => Math.abs(x[1] - max) < 0.01).map(x => Number(x[0]));
      if (winners.length === 1) {
        const out = winners[0];
        const pIdx = roomDoc.players.findIndex(pl => pl.seat === out);
        const target = roomDoc.players[pIdx];
        if (target?.role === 'idiot' && !target.role_state?.idiot_revealed && target.is_alive) {
          updates[`players.${pIdx}.role_state.idiot_revealed`] = true;
          updates['game_state.exile_result'] = 'idiot_reveal';
          updates['game_state.exile_seat'] = out;
          updates['current_round_actions.day_votes'] = {}; 
          log(`${out}号 白痴翻牌，免于放逐`);
          newVotingHistoryElements.push({ day: gs.day_count, phase: historyPhase, votes: dayVotes, result: 'idiot_reveal', target: out });
          setInst('exile_announce');
        } else if (target?.is_alive) {
          updates['game_state.last_exiled_seat'] = out;
          updates['game_state.exile_result'] = 'out';
          updates['game_state.exile_seat'] = out;
          updates['current_round_actions.day_votes'] = {}; 
          log(`${out}号 被投票放逐`);
          newVotingHistoryElements.push({ day: gs.day_count, phase: historyPhase, votes: dayVotes, result: 'out', target: out });
          setInst('exile_announce');
        }
      } else if (!isPK) {
        updates['game_state.pk_candidates'] = winners;
        updates['game_state.phase'] = 'day_pk'; 
        updates['current_round_actions.day_votes'] = {}; 
        log(`平票，进入PK发言`);
        newVotingHistoryElements.push({ day: gs.day_count, phase: historyPhase, votes: dayVotes, result: 'pk', pk_candidates: winners });
        setInst('day_pk');
      } else {
        updates['game_state.exile_result'] = 'tie';
        updates['current_round_actions.day_votes'] = {}; 
        log(`PK再次平票，本轮无人出局`);
        newVotingHistoryElements.push({ day: gs.day_count, phase: historyPhase, votes: dayVotes, result: 'tie' });
        setInst('exile_announce');
      }
    } else {
      updates['game_state.exile_result'] = 'tie';
      updates['current_round_actions.day_votes'] = {}; // IMPORTANT: clear votes
      log(isPK ? `PK轮无人投票，本轮流局` : `无人投票，进入平安日`);
      newVotingHistoryElements.push({ day: gs.day_count, phase: historyPhase, votes: dayVotes, result: 'tie' });
      setInst('exile_announce');
    }
  }

  // 执行处理器
  const handler = handlers[gs.sub_phase];
  if (handler) {
    handler();
  } else {
    const nextSub = findNextState(gs.sub_phase);
    if (nextSub) {
      const nextCfg = flowConfig[nextSub];
      if (nextCfg?.env && nextCfg.env !== gs.phase) {
        updates['game_state.phase'] = nextCfg.env;
        if (nextCfg.env === 'night') {
          updates['game_state.day_count'] = gs.day_count + 1;
          // 关键修复：使用 db.command.set 确保物理替换
          updates['current_round_actions'] = db.command.set(getInitialActions());
          updates['game_state.last_night_deaths'] = [];
        }
      }
      setInst(nextSub);
    } else setInst('discussion', discussionTime);
  }

  // --- 关键修复：采用 3c566a 结算强度 + 稳健覆盖逻辑 ---
  const finalSnapshot = applyUpdates(roomDoc, updates);

  let winResult = null;
  if (finalSnapshot.game_state.status === 'playing') {
    winResult = checkWinner(finalSnapshot.players, finalSnapshot.game_state.lovers, roomDoc.config.win_mode || 'kill_side');
    if (winResult) {
      const reasonText = winnerChecker.getWinReasonText(winResult.reason);
      const instruction = {
        sub_phase: 'game_over',
        duration: 0,
        audio: ['GAME_OVER'],
        title: '🏆 游戏结束',
        tips: (winResult.winner === 'good' ? '好人阵营获胜' : '狼人阵营获胜') + (reasonText ? `\n(${reasonText})` : ''),
        actionPanel: 'none',
        auto_proceed: false
      };
      updates['game_state.status'] = 'finished';
      updates['game_state.sub_phase'] = 'game_over';
      updates['game_state.winner'] = winResult.winner;
      updates['game_state.current_instruction'] = instruction;

      // Also apply to finalSnapshot for saveRecord
      Object.assign(finalSnapshot.game_state, {
        status: 'finished',
        sub_phase: 'game_over',
        winner: winResult.winner,
        current_instruction: instruction
      });
    }
  }

  // 更新版本号和锁 (写入增量 updates)
  updates['game_state.phase_version'] = (gs.phase_version || 0) + 1;
  updates['game_state.last_transition_at'] = new Date();
  updates['game_state.transition_lock'] = { at: new Date() };

  // 转换数组 append 和一些特殊指令为微信云开发 db 指令
  const dbUpdates = { ...updates };

  // 处理 Timeline (Phase 2 优化)
  if (newTimelineElements.length > 0) {
    dbUpdates.timeline = db.command.push(newTimelineElements);

    // Maintain internal state structure compatibility for checkWinner / findNextState just in case
    if (!finalSnapshot.timeline) finalSnapshot.timeline = [];
    finalSnapshot.timeline.push(...newTimelineElements);
  }

  // 处理 voting_history
  if (newVotingHistoryElements.length > 0) {
    dbUpdates['game_state.voting_history'] = db.command.push(newVotingHistoryElements);

    if (!finalSnapshot.game_state.voting_history) finalSnapshot.game_state.voting_history = [];
    finalSnapshot.game_state.voting_history.push(...newVotingHistoryElements);
  }

  // 写入数据库 (采用点号增量更新机制，减少 Payload 体积)
  console.log('[Phase Transition Updates] Size:', Object.keys(dbUpdates).length);
  await db.collection('game_rooms').doc(roomDocId).update({ data: dbUpdates });

  if (winResult) await doSaveRecord(db, roomId, finalSnapshot);
  return finalSnapshot;
};

/**
 * 自动推进检查
 */
const checkAutoProceedInternal = async (db, roomId, roomDoc, roomDocId) => {
  if (!roomDoc || roomDoc.game_state.status !== 'playing') return roomDoc;
  const gs = roomDoc.game_state;
  const inst = gs.current_instruction;
  if (!inst) return roomDoc;

  // --- 优先级最高：逻辑触发流转 (即使是手动模式，为了体验也应自动过流程) ---

  // 1. 发牌阶段：全员确认后自动进入下一阶段
  if (gs.sub_phase === 'deal_cards') {
    const alivePlayers = roomDoc.players.filter(p => p.openid);
    const confirmedCount = Object.keys(roomDoc.current_round_actions?.role_confirmations || {}).length;
    if (confirmedCount >= alivePlayers.length && confirmedCount > 0) {
      console.log('[Phase] All players confirmed identity, auto-proceeding');
      return await nextPhase(db, roomId, roomDoc, roomDocId);
    }
  }

  // 2. 角色行动阶段：如果所有相关存活玩家都已操作，立即流转
  const roleReq = inst.roleRequired;
  const subPhase = gs.sub_phase;
  const actions = roomDoc.current_round_actions || {};

  // --- 新增：投票阶段全员操作校验 ---
  const votingPhases = ['voting', 'pk_voting', 'sheriff_voting', 'sheriff_pk_voting'];
  if (votingPhases.includes(subPhase)) {
    const alivePlayers = roomDoc.players.filter(p => p.is_alive && p.openid);
    const silencedSeat = roomDoc.current_round_actions?.silencer_silence;
    let eligibleCount = 0;
    let currentVotes = {};

    if (subPhase.startsWith('sheriff')) {
      const candidates = gs.sheriff_candidate_seats || [];
      const deadTonight = new Set((gs.last_night_deaths || []).map(d => d.seat));
      eligibleCount = alivePlayers.filter(p => {
        if (candidates.includes(p.seat)) return false;
        if (deadTonight.has(p.seat)) return false;
        if (silencedSeat === p.seat) return false;
        if (p.role === 'idiot' && p.role_state?.idiot_revealed) return false;
        return true;
      }).length;
      currentVotes = actions.sheriff_votes || {};
    } else {
      eligibleCount = alivePlayers.filter(p => {
        if (silencedSeat === p.seat) return false;
        if (p.role === 'idiot' && p.role_state?.idiot_revealed) return false;
        if (subPhase === 'pk_voting' && (gs.pk_candidates || []).includes(p.seat)) return false;
        return true;
      }).length;
      currentVotes = actions.day_votes || {};
    }

    const actedCount = Object.keys(currentVotes).length;
    console.log(`[PhaseCheck] Voting: ${subPhase}, Acted: ${actedCount}, Eligible: ${eligibleCount}`);

    // 核心强制：只有全员已表态且至少有1人操作，才流转
    if (actedCount >= eligibleCount && eligibleCount > 0) {
      console.log(`[Phase] Voting complete (${actedCount}/${eligibleCount}), proceeding.`);
      return await nextPhase(db, roomId, roomDoc, roomDocId);
    }
    // 即使时间到了，因为 auto_proceed 为 false，所以这里如果不 return nextPhase，系统就会一直挂起，符合要求。
  }

  if (roleReq) {
    let isAllActed = false;

    if (roleReq === 'werewolf') {
      // 核心防御：狼人阶段绝对禁止“自动探测流转”，必须等待 confirmWerewolfAction 设置 werewolf_acted
      if (actions.werewolf_acted) isAllActed = true;
      else isAllActed = false;
    } else if (['seer', 'witch', 'guard', 'cupid', 'magician', 'dream_catcher', 'wolf_beauty', 'gargoyle', 'merchant', 'silencer', 'wild_child', 'gravekeeper', 'hunter'].includes(roleReq)) {
      // 其他职能角色如果配置了 auto_proceed，可以检测动作完成即流转
      if (inst.auto_proceed && actions[`${roleReq}_acted`]) isAllActed = true;
    }

    if (isAllActed) {
      console.log(`[Phase] Role ${roleReq} completed, proceeding`);
      return await nextPhase(db, roomId, roomDoc, roomDocId);
    }
  }

  // --- 核心拦截：如果开启了手动模式，禁止【基于时间过期】的自动流转 ---
  if (gs.is_manual_mode) return roomDoc;

  // 3. 原有的倒计时过期逻辑
  if (inst.auto_proceed && gs.stage_deadline) {
    const now = Date.now();
    if (now >= gs.stage_deadline - 500) {
      // 特殊逻辑：投票阶段如果没有全员操作，不推进
      if (['voting', 'pk_voting', 'sheriff_voting', 'sheriff_pk_voting'].includes(gs.sub_phase)) {
        const alivePlayers = roomDoc.players.filter(p => p.is_alive && p.openid);
        let eligibleCount = alivePlayers.length;
        let votes = {};

        if (gs.sub_phase.startsWith('sheriff')) {
          const candidates = gs.sheriff_candidate_seats || [];
          const deadTonight = new Set((gs.last_night_deaths || []).map(d => d.seat));
          const silencedSeat = roomDoc.current_round_actions?.silencer_silence;
          eligibleCount = alivePlayers.filter(p => {
            if (candidates.includes(p.seat)) return false;
            if (deadTonight.has(p.seat)) return false;
            if (silencedSeat === p.seat) return false;
            if (p.role === 'idiot' && p.role_state?.idiot_revealed) return false;
            return true;
          }).length;
          votes = actions.sheriff_votes || {};
        } else {
          const silencedSeat = roomDoc.current_round_actions?.silencer_silence;
          eligibleCount = alivePlayers.filter(p => {
            if (silencedSeat === p.seat) return false;
            if (p.role === 'idiot' && p.role_state?.idiot_revealed) return false;
            if (gs.sub_phase === 'pk_voting' && (gs.pk_candidates || []).includes(p.seat)) return false;
            return true;
          }).length;
          votes = actions.day_votes || {};
        }

        const actedCount = Object.keys(votes).length;
        if (actedCount < eligibleCount) {
          console.log(`[Phase] Waiting for ${eligibleCount - actedCount} more voters, holding phase`);
          return roomDoc;
        }
      }

      // 特殊逻辑：狼人阶段不再支持倒计时结束自动推进，必须手动确认
      if (gs.sub_phase === 'werewolf_phase') {
        console.log('[Phase] Werewolf phase requires manual confirmation, holding phase');
        return roomDoc; 
      }
      return await nextPhase(db, roomId, roomDoc, roomDocId);
    }
  }
  return roomDoc;
};

module.exports = { nextPhase, checkAutoProceedInternal };
