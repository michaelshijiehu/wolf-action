const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { flowConfig } = require('./constants');
const { applyUpdates, doSaveRecord, checkWinner, getAudioQueue, checkContentSecurity } = require('./utils');
const { simulateBotActions, fillBots } = require('./botLogic');

const getInitialActions = () => ({
  werewolf_votes: {},
  day_votes: {},
  seer_check: {},
  witch_action: { save: false, poison_target: null },
  guard_protect: null,
  sheriff_votes: {},
  hunter_shoot: null
});

const checkActionPermission = (roomDoc, openid) => {
  const p = roomDoc.players.find(x => x.openid === openid);
  if (!p) return { res: false, msg: '找不到玩家' };
  const sub = roomDoc.game_state.sub_phase;
  if (sub === 'sheriff_handover') {
    if (roomDoc.game_state.sheriff_seat === p.seat) return { res: true };
    return { res: false, msg: '无权操作' };
  }
  if (!p.is_alive) return { res: false, msg: '您已离场' };
  if (sub === 'hunter_action') {
    if (p.role === 'hunter') {
      if (p.role_state.hunter_shoot_used) return { res: false, msg: '无法发动技能' };
      return { res: true };
    }
    return { res: false, msg: '非猎人身份' };
  }
  if (sub === 'sheriff_voting') {
    const cands = roomDoc.game_state.sheriff_candidate_seats || [];
    if (cands.includes(p.seat)) return { res: false, msg: '候选人不能投票' };
  }
  if (sub === 'sheriff_pk_voting') {
    const pkCands = roomDoc.game_state.pk_candidates || [];
    if (pkCands.includes(p.seat)) return { res: false, msg: 'PK候选人不能投票' };
  }
  if (['voting', 'pk_voting', 'sheriff_voting', 'day_pk', 'sheriff_pk_voting'].includes(sub)) {
    if (p.role === 'idiot' && p.role_state.idiot_revealed) return { res: false, msg: '白痴翻牌后失去投票权' };
  }
  const cfg = flowConfig[sub];
  if (cfg && cfg.allowAction) {
    if (cfg.allowAction === 'all') return { res: true };
    if (Array.isArray(cfg.allowAction)) {
      if (!cfg.allowAction.includes(p.role)) return { res: false, msg: `本阶段禁止行动` };
    }
  }
  return { res: true };
};

const checkAndProceed = async (roomId, roomDocId, db) => {
  // Always wait for the timer to respect user's "Natural Pace" requirement
  return;
};

const startGame = async (ev, roomId, wxCtx) => {
  const res = await db.collection('game_rooms').where({ roomId }).get();
  const room = res.data[0];
  const players = room.players; const real = players.filter(p => p.openid); const roles = ev.config.roles;
  let pool = []; for (const [role, count] of Object.entries(roles)) for (let i = 0; i < count; i++) pool.push(role);
  pool = pool.slice(0, real.length).sort(() => Math.random() - 0.5); let pi = 0;

  players.forEach(p => {
    if (p.openid) {
      const role = pool[pi++];
      p.role = role;
      p.is_alive = true;
      p.death_reason = null;
      p.role_state = {
        witch_poison_used: false, witch_save_used: false, hunter_shoot_used: false,
        hunter_status: 'can_shoot', guard_last_protected_seat: null, idiot_revealed: false,
        model_seat: null, knight_ability_used: false, merchant_item: null,
        silencer_last_silenced: null, magician_exchanged: [], dream_catcher_target: null,
        wolf_beauty_target: null, gargoyle_check_history: []
      };
    }
  });

  const inst = flowConfig['game_welcome'];
  const dur = inst.duration || 10;
  const initialGameState = {
    status: 'playing',
    start_time: new Date(),
    day_count: 1,
    phase: 'day',
    sub_phase: 'game_welcome',
    sheriff_seat: null,
    lovers: [],
    deaths_announced: true,
    current_instruction: {
      sub_phase: 'game_welcome',
      expire_time: Date.now() + dur * 1000,
      duration: dur,
      audio: inst.getAudio ? inst.getAudio() : ['WELCOME'],
      title: inst.ui.title,
      tips: inst.ui.tips,
      color: inst.ui.color,
      actionPanel: inst.ui.actionPanel || 'none',
      brightness: inst.ui.brightness || 1.0,
      auto_proceed: true
    },
    stage_deadline: Date.now() + (dur * 1000),
    voting_history: [],
    last_night_deaths: []
  };

  await db.collection('game_rooms').doc(room._id).update({ data: { players, config: { player_count: players.length, roles }, 'game_state': initialGameState, current_round_actions: getInitialActions(), timeline: [{ day: 1, phase: 'day', text: '游戏开始', timestamp: new Date() }], updated_at: new Date() } });
  return { success: true };
};

const nextPhase = async (roomId, roomDoc, roomDocId) => {
  const gs = roomDoc.game_state;
  let updates = { updated_at: new Date() };

  const log = (txt, day, phase) => {
    const filteredKeywords = ['天亮了', '天黑了', '黑夜降临', '进入死亡结算'];
    if (filteredKeywords.some(kw => txt.includes(kw))) return;
    if (!updates.timeline) updates.timeline = [...(roomDoc.timeline || [])];
    updates.timeline.push({ day: day || gs.day_count, phase: phase || gs.phase, text: txt, timestamp: new Date() });
  };

  // Improved setInst that ALSO updates the core sub_phase field
  const setInst = (key, forcedDuration) => {
    let cfg = flowConfig[key]; if (!cfg) return;
    let dur = forcedDuration !== undefined ? forcedDuration : (Array.isArray(cfg.duration) ? Math.floor(Math.random() * (cfg.duration[1] - cfg.duration[0] + 1)) + cfg.duration[0] : (cfg.duration !== undefined ? cfg.duration : 15));
    
    console.log(`[FLOW_TRACE] Transitioning to: ${key}, Duration: ${dur}s`);

    // Core State Update
    updates['game_state.sub_phase'] = key;
    
    // Create a temporary snapshot for getAudio to see latest changes in this call
    const audioGS = Object.assign({}, gs, {
      sheriff_seat: updates['game_state.sheriff_seat'] || gs.sheriff_seat,
      election_result: updates['game_state.election_result'] || gs.election_result,
      last_night_deaths: updates['game_state.last_night_deaths'] || gs.last_night_deaths,
      exile_result: updates['game_state.exile_result'] || gs.exile_result,
      exile_seat: updates['game_state.exile_seat'] || gs.exile_seat
    });

    // UI Instruction Update
    const currentInst = { 
      sub_phase: key, 
      expire_time: Date.now() + dur * 1000, 
      duration: dur, 
      audio: cfg.getAudio ? cfg.getAudio(audioGS) : [], 
      roleRequired: cfg.roleRequired || null, 
      title: cfg.ui ? cfg.ui.title : '', 
      tips: cfg.ui ? cfg.ui.tips : '', 
      actionBtn: cfg.ui && cfg.ui.actionBtn ? cfg.ui.actionBtn : '', 
      color: cfg.ui && cfg.ui.color ? cfg.ui.color : '#ffffff', 
      actionPanel: cfg.ui && cfg.ui.actionPanel ? cfg.ui.actionPanel : 'none', 
      brightness: cfg.ui && cfg.ui.brightness !== undefined ? cfg.ui.brightness : 1.0, 
      auto_proceed: !!cfg.auto_proceed 
    };

    // Special: Add kill target for Witch
    if (key === 'witch_action') {
      const cur = roomDoc.current_round_actions || {};
      const wolfKill = Object.values(cur.werewolf_votes || {})[0];
      const witchP = roomDoc.players.find(p => p.role === 'witch');
      
      if (witchP) {
        currentInst.witch_info = {
          killTarget: witchP.role_state.witch_save_used ? null : wolfKill,
          saveUsed: !!witchP.role_state.witch_save_used,
          poisonUsed: !!witchP.role_state.witch_poison_used
        };
      }
    }

    updates['game_state.current_instruction'] = currentInst;
    updates['game_state.stage_deadline'] = Date.now() + (dur * 1000);
  };

  const applyDeaths = () => {
    const deaths = gs.last_night_deaths || [];
    const players = updates['players'] || [...roomDoc.players]; // Use existing updates if any
    let playersUpdated = false;
    
    deaths.forEach(d => {
      const idx = players.findIndex(p => p.seat === d.seat);
      if (idx > -1 && players[idx].is_alive) {
        players[idx].is_alive = false;
        players[idx].death_reason = d.reason;
        playersUpdated = true;
      }
    });
    
    if (playersUpdated) updates['players'] = players;

    if (deaths.length === 0) log('昨晚是平安夜');
    else log(`昨晚，${deaths.map(d => d.seat + '号').join(', ')} 倒在了血泊中`);
  };

  const findNextState = (currentSub) => {
    // ... (keep existing findNextState code) ...
    let nextSub = flowConfig[currentSub] ? flowConfig[currentSub].next : null;
    let safeguard = 0;
    while (nextSub && safeguard < 50) {
      const cfg = flowConfig[nextSub]; 
      if (!cfg) {
        console.log(`[FLOW_TRACE] Config missing for: ${nextSub}`);
        return null;
      }
      let shouldSkip = false;
      let skipReason = '';

      const isWakeSleepPhase = nextSub.endsWith('_wake') || nextSub.endsWith('_sleep') || nextSub.endsWith('_confirm');
      
      if (cfg.roleRequired) {
        const roleCount = roomDoc.config.roles[cfg.roleRequired] || 0;
        if (roleCount === 0) {
          shouldSkip = true;
          skipReason = `Role ${cfg.roleRequired} not in game`;
        } 
        else if (cfg.checkAlive && !isWakeSleepPhase) {
          const aliveRole = roomDoc.players.find(p => p.role === cfg.roleRequired && p.is_alive && !p.death_reason); 
          if (!aliveRole) {
            shouldSkip = true;
            skipReason = `Role ${cfg.roleRequired} is dead`;
          }
        }
      }
      
      if (cfg.firstNightOnly && gs.day_count > 1) {
        shouldSkip = true;
        skipReason = 'First night only';
      }
      if (!shouldSkip && cfg.shouldSkip) {
        shouldSkip = cfg.shouldSkip(gs, roomDoc.players);
        if (shouldSkip) skipReason = 'Custom condition met';
      }
      
      if (!shouldSkip) {
        console.log(`[FLOW_TRACE] Found valid next phase: ${nextSub}`);
        return nextSub;
      }

      console.log(`[FLOW_TRACE] Skipping ${nextSub}. Reason: ${skipReason}`);
      nextSub = cfg.next; safeguard++;
    }
    console.log('[FLOW_TRACE] Safeguard limit reached or no next phase.');
    return null;
  };

  const aliveCount = roomDoc.players.filter(p => p.is_alive).length;
  const discussionTime = Math.max(60, aliveCount * 20);

  // --- FLOW SWITCH ---
  if (gs.sub_phase === 'game_welcome') {
    setInst('deal_cards');
  }
  else if (gs.sub_phase === 'deal_cards') {
    updates['game_state.phase'] = 'night';
    setInst('night_start');
  }
  else if (gs.sub_phase === 'night_start') {
    const nextSub = findNextState('night_start');
    if (nextSub) setInst(nextSub);
    else setInst('calculate_death');
  }
  else if (gs.sub_phase === 'calculate_death') {
    const cur = roomDoc.current_round_actions || {};
    const players = [...roomDoc.players]; 
    let deaths = [];
    
    const wolfKill = Object.values(cur.werewolf_votes || {})[0];
    const witchSave = cur.witch_action?.save ? wolfKill : null;
    const witchPoison = cur.witch_action?.poison_target;
    const guardProtect = cur.guard_protect;

    // Only process kills for players who WERE alive at start of night
    if (wolfKill) {
      const targetP = players.find(p => p.seat === wolfKill);
      if (targetP && targetP.is_alive) {
        if (wolfKill === witchSave && wolfKill === guardProtect) {
          deaths.push({ seat: wolfKill, reason: 'milk_guard_clash' });
        } else if (wolfKill !== witchSave && wolfKill !== guardProtect) {
          deaths.push({ seat: wolfKill, reason: 'werewolf_kill' });
        }
      }
    }
    
    if (witchPoison) {
      const targetP = players.find(p => p.seat === witchPoison);
      if (targetP && targetP.is_alive) {
        deaths.push({ seat: witchPoison, reason: 'witch_poison' });
      }
    }

    // Lover Chain Death Logic
    const lovers = gs.lovers || [];
    if (lovers.length === 2) {
      const initialDeathSeats = deaths.map(d => d.seat);
      lovers.forEach(seat => {
        if (initialDeathSeats.includes(seat)) {
          const otherLoverSeat = lovers.find(s => s !== seat);
          const otherP = players.find(p => p.seat === otherLoverSeat);
          if (otherP && otherP.is_alive && !deaths.some(d => d.seat === otherLoverSeat)) {
            deaths.push({ seat: otherLoverSeat, reason: 'lover' });
          }
        }
      });
    }

    // DEFER: Do not update players.is_alive yet! 
    // Deaths are applied in 'day_dawn' after Sheriff Election.
    
    // We only log locally for debugging, the real announce is in day_dawn
    if (deaths.length === 0) console.log('[LOG] Night result: Peace');
    else console.log(`[LOG] Night result: Deaths ${deaths.map(d => d.seat).join(',')}`);

    updates['game_state.last_night_deaths'] = deaths;
    setInst('day_announce');
  }
  else if (gs.sub_phase === 'day_announce') {
    if (gs.day_count === 1 && !gs.sheriff_seat && (roomDoc.config.roles.sheriff !== 0)) {
      updates['game_state.phase'] = 'sheriff_election';
      setInst('sheriff_nomination');
    } else {
      updates['game_state.phase'] = 'day_process';
      applyDeaths(); // Apply deaths before dawn
      setInst('day_dawn');
    }
  }
  else if (gs.sub_phase === 'sheriff_nomination') {
    const cands = gs.sheriff_candidate_seats || [];
    if (cands.length === 0) {
      updates['game_state.sheriff_candidate_seats'] = [];
      updates['game_state.phase'] = 'day_process';
      applyDeaths(); // Apply deaths before dawn
      setInst('day_dawn');
    } else if (cands.length === 1) {
      updates['game_state.sheriff_seat'] = cands[0];
      updates['game_state.election_result'] = 'elected';
      setInst('election_announce');
    } else {
      setInst('sheriff_speech', cands.length * 20);
    }
  }
  else if (gs.sub_phase === 'sheriff_speech') {
    setInst('sheriff_voting');
  }
  else if (gs.sub_phase === 'sheriff_voting') {
    const votes = roomDoc.current_round_actions.sheriff_votes || {};
    const counts = {};
    Object.entries(votes).forEach(([v, t]) => { if(t > 0) counts[t] = (counts[t] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    // RECORD HISTORY
    const history = [...(gs.voting_history || [])];
    const record = {
      day: gs.day_count,
      phase: gs.sub_phase,
      votes: votes,
      timestamp: new Date()
    };

    if (sorted.length > 0) {
      const max = sorted[0][1];
      const winners = sorted.filter(x => x[1] === max);
      if (winners.length === 1) {
        const elected = Number(winners[0][0]);
        record.result = 'elected'; record.resultSeat = elected;
        
        log(`警长当选: ${elected}号`);
        updates['game_state.sheriff_seat'] = elected;
        updates['game_state.election_result'] = 'elected';
        setInst('election_announce');
      } else {
        record.result = 'tie_pk';
        updates['game_state.pk_candidates'] = winners.map(x => Number(x[0]));
        updates['current_round_actions.sheriff_votes'] = {}; // Clear votes for PK
        setInst('sheriff_pk_speech');
      }
    } else {
      log('无人投票，警长竞选流失');
      updates['game_state.sheriff_candidate_seats'] = [];
      updates['game_state.phase'] = 'day_process';
      applyDeaths(); // Apply deaths before dawn
      setInst('day_dawn');
    }
    history.push(record);
    updates['game_state.voting_history'] = history;
  }
  else if (gs.sub_phase === 'sheriff_pk_voting') {
    const votes = roomDoc.current_round_actions.sheriff_votes || {};
    const counts = {};
    Object.entries(votes).forEach(([v, t]) => { if(t > 0) counts[t] = (counts[t] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    // RECORD HISTORY
    const history = [...(updates['game_state.voting_history'] || gs.voting_history || [])]; // Use updated history if exists
    const record = {
      day: gs.day_count,
      phase: gs.sub_phase,
      votes: votes,
      timestamp: new Date()
    };

    if (sorted.length > 0) {
      const max = sorted[0][1];
      const winners = sorted.filter(x => x[1] === max);
      if (winners.length === 1) {
        const elected = Number(winners[0][0]);
        record.result = 'elected'; record.resultSeat = elected;
        
        log(`警长当选(PK): ${elected}号`);
        updates['game_state.sheriff_seat'] = elected;
        updates['game_state.election_result'] = 'elected';
        setInst('election_announce');
      } else {
        record.result = 'tie';
        log('PK再次平票，警徽流失');
        updates['game_state.election_result'] = 'tie'; // Lost badge
        setInst('election_announce');
      }
    } else {
      record.result = 'tie';
      log('PK无人投票，警徽流失');
      updates['game_state.election_result'] = 'tie';
      setInst('election_announce');
    }
    history.push(record);
    updates['game_state.voting_history'] = history;
  }
  else if (gs.sub_phase === 'election_announce') {
    // Election finished, clear candidates (put hands down)
    updates['game_state.sheriff_candidate_seats'] = [];
    updates['game_state.pk_candidates'] = [];
    
    updates['game_state.phase'] = 'day_process';
    applyDeaths(); // Apply deaths before dawn
    setInst('day_dawn');
  }
  else if (gs.sub_phase === 'day_dawn') {
    // Logic moved to applyDeaths(), now only handle routing
    const deaths = gs.last_night_deaths || [];
    const deadSheriff = deaths.find(d => d.seat === gs.sheriff_seat);
    const deadHunter = deaths.find(d => {
      const p = roomDoc.players.find(x => x.seat === d.seat);
      return p && p.role === 'hunter' && d.reason !== 'witch_poison';
    });

    if (deadSheriff) setInst('sheriff_handover');
    else if (deadHunter) setInst('hunter_action');
    else {
      updates['game_state.phase'] = 'day_discussion';
      setInst('discussion', discussionTime);
    }
  }
  else if (gs.sub_phase === 'discussion') {
    updates['game_state.phase'] = 'day_voting';
    updates['current_round_actions.day_votes'] = {};
    setInst('voting');
  }
  else if (gs.sub_phase === 'voting' || gs.sub_phase === 'pk_voting') {
    const votes = roomDoc.current_round_actions.day_votes || {};
    const counts = {};
    Object.entries(votes).forEach(([v, t]) => {
      if (t === 0) return;
      const weight = (Number(v) === gs.sheriff_seat) ? 1.5 : 1;
      counts[t] = (counts[t] || 0) + weight;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    // RECORD HISTORY
    const history = [...(updates['game_state.voting_history'] || gs.voting_history || [])];
    const record = {
      day: gs.day_count,
      phase: gs.sub_phase,
      votes: votes,
      timestamp: new Date()
    };

    if (sorted.length > 0) {
      const max = sorted[0][1];
      const winners = sorted.filter(x => x[1] === max);
      if (winners.length === 1) {
        const out = Number(winners[0][0]);
        record.result = 'out'; record.resultSeat = out;

        const pIdx = roomDoc.players.findIndex(p => p.seat === out);
        const p = roomDoc.players[pIdx];

        if (p && p.role === 'idiot' && !p.role_state.idiot_revealed) {
          record.result = 'idiot_reveal';
          updates[`players.${pIdx}.role_state.idiot_revealed`] = true;
          updates['game_state.exile_result'] = 'idiot_reveal';
          updates['game_state.exile_seat'] = out;
          setInst('exile_announce');
        } else {
          const players = [...roomDoc.players];
          players[pIdx].is_alive = false;
          players[pIdx].death_reason = 'vote';
          
          const lovers = gs.lovers || [];
          if (lovers.includes(out)) {
            const otherLoverSeat = lovers.find(s => s !== out);
            const oIdx = players.findIndex(pl => pl.seat === otherLoverSeat);
            if (oIdx > -1 && players[oIdx].is_alive) {
              players[oIdx].is_alive = false;
              players[oIdx].death_reason = 'lover';
            }
          }
          updates['players'] = players;
          updates['game_state.last_exiled_seat'] = out;
          updates['game_state.exile_result'] = 'out';
          updates['game_state.exile_seat'] = out;
          setInst('exile_announce');
        }
      } else {
        if (gs.sub_phase === 'pk_voting') {
          record.result = 'tie';
          updates['game_state.exile_result'] = 'tie';
          setInst('exile_announce');
        } else {
          record.result = 'tie_pk';
          updates['game_state.pk_candidates'] = winners.map(x => Number(x[0]));
          setInst('day_pk');
        }
      }
    } else {
      record.result = 'tie';
      updates['game_state.exile_result'] = 'tie';
      setInst('exile_announce');
    }
    history.push(record);
    updates['game_state.voting_history'] = history;
  }
  else if (gs.sub_phase === 'exile_announce') {
    if (gs.exile_result === 'idiot_reveal' || gs.exile_result === 'tie') {
      updates['game_state.phase'] = 'night';
      updates['game_state.day_count'] = gs.day_count + 1;
      updates['current_round_actions'] = getInitialActions();
      updates['game_state.last_night_deaths'] = []; // Clear for new night
      setInst('night_start');
    } else {
      setInst('leave_speech');
    }
  }
  else if (gs.sub_phase === 'leave_speech') {
    const out = gs.last_exiled_seat;
    const p = roomDoc.players.find(x => x.seat === out);
    if (gs.sheriff_seat === out) {
      updates['game_state.phase'] = 'day_process';
      setInst('sheriff_handover');
    } else if (p && p.role === 'hunter' && p.role_state.hunter_status === 'can_shoot') {
      updates['game_state.phase'] = 'day_process';
      setInst('hunter_action');
    } else {
      updates['game_state.phase'] = 'night';
      updates['game_state.day_count'] = gs.day_count + 1;
      updates['current_round_actions'] = getInitialActions();
      updates['game_state.last_night_deaths'] = []; // Clear for new night
      setInst('night_start');
    }
  }
  else {
    const nextSub = findNextState(gs.sub_phase);
    if (nextSub) {
      const nextCfg = flowConfig[nextSub];
      if (nextCfg.env && nextCfg.env !== gs.phase) {
        updates['game_state.phase'] = nextCfg.env;
        if (nextCfg.env === 'night') {
          updates['game_state.day_count'] = gs.day_count + 1;
          updates['current_round_actions'] = getInitialActions();
          updates['game_state.last_night_deaths'] = []; // Clear for new night
        }
      }
      setInst(nextSub);
    } else {
      setInst('discussion', discussionTime);
    }
  }

  const finalSnapshot = applyUpdates(roomDoc, updates);
  let winResult = null;
  if (finalSnapshot.game_state.status === 'playing') winResult = checkWinner(finalSnapshot.players, finalSnapshot.game_state.lovers);

  if (winResult) {
    updates['game_state.status'] = 'finished'; updates['game_state.winner'] = winResult.winner;
    
    // Log Victory
    let reasonText = '';
    if (winResult.reason === 'villager_win') reasonText = '狼人全灭';
    else if (winResult.reason === 'wolf_kill_god') reasonText = '屠神';
    else if (winResult.reason === 'wolf_kill_villager') reasonText = '屠民';
    else if (winResult.reason === 'third_party_win') reasonText = '情侣存活';
    
    const winSide = winResult.winner === 'good' ? '好人阵营' : (winResult.winner === 'werewolf' ? '狼人阵营' : '第三方阵营');
    log(`🏆 游戏结束，${winSide}胜利 (${reasonText})`);

    updates['game_state.current_instruction'] = { sub_phase: 'game_over', duration: 0, audio: ['GAME_OVER'], title: '🏆 游戏结束', tips: `${winSide}胜利 (${reasonText})`, actionPanel: 'none', auto_proceed: false };
  }

  await db.collection('game_rooms').doc(roomDocId).update({ data: updates });
  if (winResult) await doSaveRecord(db, roomId, applyUpdates(roomDoc, updates));
  return { success: true };
};

const checkAutoProceedInternal = async (roomId, roomDoc, roomDocId) => {
  if (!roomDoc || roomDoc.game_state.status !== 'playing') return roomDoc;
  const gs = roomDoc.game_state;
  const inst = gs.current_instruction;
  if (inst && inst.auto_proceed && gs.stage_deadline) {
    const now = Date.now();
    if (now >= (gs.stage_deadline - 500)) {
      await nextPhase(roomId, roomDoc, roomDocId);
      const updatedRes = await db.collection('game_rooms').doc(roomDocId).get();
      return updatedRes.data;
    }
  }
  return roomDoc;
};

exports.main = async (event) => {
  const { type, roomId: eventRoomId } = event;
  const wxCtx = cloud.getWXContext();
  const noRoomNeeded = ['getOpenId', 'getGameRecords', 'createRoom', 'securityCheck', 'checkRunningGame'];
  let roomDoc = null; let roomDocId = null;

  if (eventRoomId && !noRoomNeeded.includes(type)) {
    const res = await db.collection('game_rooms').where({ roomId: eventRoomId }).get();
    if (res.data.length > 0) { 
      roomDoc = res.data[0]; 
      roomDocId = roomDoc._id; 
      // Fix: Skip auto-proceed check if the current request is explicitly to trigger nextPhase
      if (type !== 'nextPhase') {
        roomDoc = await checkAutoProceedInternal(eventRoomId, roomDoc, roomDocId);
      }
    } else return { success: false, message: "房间已解散或不存在" };
  }

  const acts = {
    getOpenId: async () => ({ openid: wxCtx.OPENID }),
    createRoom: async () => {
      let rid; let attempts = 0;
      while (attempts < 10) {
        rid = Math.floor(1000 + Math.random() * 9000).toString();
        const existing = await db.collection('game_rooms').where({ roomId: rid }).count();
        if (existing.total === 0) {
          const init = { roomId: rid, _openid: wxCtx.OPENID, created_at: new Date(), updated_at: new Date(), expireAt: new Date(Date.now() + 7200000), config: { player_count: 6, roles: { werewolf: 2, villager: 2, seer: 1, witch: 1 } }, game_state: { status: "waiting", day_count: 0, phase: "setup", sub_phase: "ready", sheriff_seat: null, sheriff_candidate_seats: [], lovers: [], last_night_deaths: [], deaths_announced: true, voting_history: [] }, players: Array.from({ length: 6 }, (_, i) => ({ seat: i + 1, openid: "", nickname: `玩家${i + 1}`, avatar_url: "", is_alive: true, role: "unknown", role_state: {}, action_status: {} })), current_round_actions: getInitialActions(), timeline: [], hidden_timeline: [] };
          await db.collection("game_rooms").add({ data: init });
          return { success: true, roomId: rid };
        }
        attempts++;
      }
      return { success: false, message: "无法创建房间" };
    },
    joinGame: async (ev) => {
      let p = roomDoc.players; p.forEach(player => { if (player.openid === wxCtx.OPENID) { player.openid = ""; player.nickname = `玩家${player.seat}`; player.avatar_url = ""; } });
      const idx = p.findIndex(x => x.seat === ev.seat); if (idx === -1) return { success: false, message: "该座位不存在" };
      p[idx].openid = wxCtx.OPENID; p[idx].nickname = ev.userInfo.nickName; p[idx].avatar_url = ev.userInfo.avatarUrl;
      await db.collection('game_rooms').doc(roomDocId).update({ data: { players: p } }); return { success: true };
    },
    startGame: (ev) => startGame(ev, eventRoomId, wxCtx),
    nextPhase: () => nextPhase(eventRoomId, roomDoc, roomDocId),
    updateRoomSize: async (ev) => {
      let p = roomDoc.players; if (ev.targetCount > p.length) for (let i = p.length; i < ev.targetCount; i++) p.push({ seat: i + 1, openid: "", nickname: `玩家${i + 1}`, avatar_url: "", is_alive: true, role: "unknown", role_state: {}, action_status: {} });
      else if (ev.targetCount < p.length) p = p.slice(0, ev.targetCount);
      await db.collection('game_rooms').doc(roomDocId).update({ data: { players: p, 'config.player_count': ev.targetCount } }); return { success: true };
    },
    debugFillBots: async (ev) => {
      return await fillBots(db, roomDoc, roomDocId, ev.targetCount);
    },
    runBotCycle: async (event) => {
      await simulateBotActions(db, roomDoc, roomDocId);
      return { success: true };
    },
    werewolfAction: async (ev) => {
      await db.collection('game_rooms').doc(roomDocId).update({ data: { [`current_round_actions.werewolf_votes.${wxCtx.OPENID}`]: Number(ev.targetSeat) } });
      return { success: true };
    },
    witchAction: async (ev) => {
      const pIdx = roomDoc.players.findIndex(x => x.role === 'witch');
      const up = {};
      if (ev.actionType === 'save') {
        up['current_round_actions.witch_action.save'] = true;
        up[`players.${pIdx}.role_state.witch_save_used`] = true;
      } else if (ev.actionType === 'poison') {
        up['current_round_actions.witch_action.poison_target'] = Number(ev.targetSeat);
        up[`players.${pIdx}.role_state.witch_poison_used`] = true;
      }
      await db.collection('game_rooms').doc(roomDocId).update({ data: up });
      return { success: true };
    },
    seerAction: async (ev) => {
      const cur = roomDoc.current_round_actions || {};
      if (cur.seer_check && cur.seer_check.target) {
        return { success: false, message: '今晚已查验过，请闭眼' };
      }

      const targetSeat = Number(ev.targetSeat); const target = roomDoc.players.find(pl => pl.seat == targetSeat);
      if (!target) return { success: false, message: '目标不存在' };

      const isBad = ['werewolf', 'wolf_beauty', 'gargoyle'].includes(target.role);
      const seerIdx = roomDoc.players.findIndex(p => p.role === 'seer');
      const history = (roomDoc.players[seerIdx].role_state.check_history || []); history.push({ day: roomDoc.game_state.day_count, seat: targetSeat, isBad });
      const up = { 'current_round_actions.seer_check': { target: targetSeat, isBad }, [`players.${seerIdx}.role_state.check_history`]: history };
      await db.collection('game_rooms').doc(roomDocId).update({ data: up });
      return { success: true, isBad };
    },
    guardAction: async (ev) => {
      const up = { 'current_round_actions.guard_protect': Number(ev.targetSeat) };
      const pIdx = roomDoc.players.findIndex(x => x.role === 'guard');
      if (pIdx > -1) up[`players.${pIdx}.role_state.guard_last_protected_seat`] = Number(ev.targetSeat);
      await db.collection('game_rooms').doc(roomDocId).update({ data: up });
      return { success: true };
    },
    voteAction: async (ev) => {
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      const targetSeat = Number(ev.targetSeat);
      const voteMap = roomDoc.current_round_actions.day_votes || {};
      voteMap[me.seat] = targetSeat;
      await db.collection('game_rooms').doc(roomDocId).update({ data: { [`current_round_actions.day_votes.${me.seat}`]: targetSeat } });
      return { success: true };
    },
    hunterAction: async (ev) => {
      const targetSeat = Number(ev.targetSeat);
      const pIdx = roomDoc.players.findIndex(x => x.role === 'hunter');
      const targetIdx = roomDoc.players.findIndex(x => x.seat === targetSeat);
      
      const up = { 
        'current_round_actions.hunter_shoot': targetSeat,
        [`players.${pIdx}.role_state.hunter_shoot_used`]: true
      };
      
      // Apply death immediately
      if (targetIdx > -1) {
        const players = [...roomDoc.players];
        players[targetIdx].is_alive = false;
        players[targetIdx].death_reason = 'hunter_shoot';
        up['players'] = players;
        
        // Log locally (timeline update is handled in nextPhase usually, but we can push one here)
        // Actually nextPhase checkWinner will handle game over logic.
      }
      
      await db.collection('game_rooms').doc(roomDocId).update({ data: up });
      
      // Force proceed to next phase (Discussion)
      const updatedDoc = (await db.collection('game_rooms').doc(roomDocId).get()).data;
      await nextPhase(eventRoomId, updatedDoc, roomDocId);
      
      return { success: true };
    },
    wolfExplode: async () => {
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      if (me && me.role === 'werewolf') {
        const players = [...roomDoc.players]; const pIdx = players.findIndex(p => p.seat === me.seat);
        players[pIdx].is_alive = false; players[pIdx].death_reason = 'explode';
        const timeline = [...(roomDoc.timeline || []), { day: roomDoc.game_state.day_count, phase: roomDoc.game_state.phase, text: `${me.seat}号 狼人自爆`, timestamp: new Date() }];
        await db.collection('game_rooms').doc(roomDocId).update({ data: { players, 'game_state.phase': 'night', 'game_state.sub_phase': 'night_start', 'game_state.day_count': roomDoc.game_state.day_count + 1, 'current_round_actions': getInitialActions(), timeline } });
        return { success: true };
      }
      return { success: false };
    },
    confirmRole: async () => {
      // 1. Mark current user as confirmed
      const up = { [`current_round_actions.role_confirmations.${wxCtx.OPENID}`]: true };
      await db.collection('game_rooms').doc(roomDocId).update({ data: up });
      
      // 2. Check if all players confirmed
      const updatedRes = await db.collection('game_rooms').doc(roomDocId).get();
      const updatedDoc = updatedRes.data;
      const confirmations = updatedDoc.current_round_actions.role_confirmations || {};
      const confirmedCount = Object.keys(confirmations).length;
      // Filter valid players (exclude empty seats)
      const validPlayerCount = updatedDoc.players.filter(p => p.openid).length;

      if (confirmedCount >= validPlayerCount) {
        // All ready! Trigger next phase immediately
        await nextPhase(eventRoomId, updatedDoc, roomDocId);
        return { success: true, triggered: true };
      }
      return { success: true, triggered: false, confirmedCount, validPlayerCount };
    },
    sheriffAction: async (ev) => {
      if (ev.action === 'join') {
        let c = roomDoc.game_state.sheriff_candidate_seats || [];
        if (ev.isJoining) { if (!c.includes(ev.seat)) c.push(ev.seat); } else { c = c.filter(s => s !== ev.seat); }
        await db.collection('game_rooms').doc(roomDocId).update({ data: { 'game_state.sheriff_candidate_seats': c } });
      } else if (ev.action === 'vote') {
        const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
        const targetSeat = Number(ev.targetSeat);
        const sub = roomDoc.game_state.sub_phase;
        
        let validTargets = [];
        if (sub === 'sheriff_voting') validTargets = roomDoc.game_state.sheriff_candidate_seats || [];
        else if (sub === 'sheriff_pk_voting') validTargets = roomDoc.game_state.pk_candidates || [];
        else return { success: false, message: '非投票阶段' };

        if (!validTargets.includes(targetSeat)) return { success: false, message: '目标不是候选人' };
        if (targetSeat === me.seat) return { success: false, message: '不能投给自己' };

        await db.collection('game_rooms').doc(roomDocId).update({ data: { [`current_round_actions.sheriff_votes.${me.seat}`]: targetSeat } });
      } else if (ev.action === 'handover') {
        const targetSeat = Number(ev.targetSeat);
        await db.collection('game_rooms').doc(roomDocId).update({ data: { 'game_state.sheriff_seat': targetSeat } });
        await nextPhase(eventRoomId, applyUpdates(roomDoc, { 'game_state.sheriff_seat': targetSeat }), roomDocId);
      }
      return { success: true };
    },
    securityCheck: async (ev) => ({ success: true, isSafe: await checkContentSecurity(cloud, ev.content) }),
    getGameRecords: async (ev) => {
      const res = await db.collection('game_records').where({ player_openids: wxCtx.OPENID }).orderBy('record_date', 'desc').skip((ev.page || 0) * (ev.pageSize || 10)).limit(ev.pageSize || 10).get();
      return { success: true, records: res.data };
    },
    checkRunningGame: async () => {
      const res = await db.collection('game_rooms').where(_.or([{ 'players.openid': wxCtx.OPENID }, { '_openid': wxCtx.OPENID }])).where({ 'game_state.status': _.neq('finished') }).orderBy('updated_at', 'desc').get();
      const now = Date.now(); const EXPIRE_MS = 24 * 60 * 60 * 1000;
      for (const room of res.data) {
        const updateTime = room.updated_at ? new Date(room.updated_at).getTime() : 0;
        if (now - updateTime > EXPIRE_MS) { try { await db.collection('game_rooms').doc(room._id).remove(); } catch (e) { } }
        else return { success: true, roomId: room.roomId };
      }
      return { success: false };
    },
    deleteRoom: async () => { if (roomDoc._openid !== wxCtx.OPENID) return { success: false, message: "无权解散" }; await db.collection('game_rooms').doc(roomDocId).remove(); return { success: true }; },
    resetRoom: async () => {
      const resetP = roomDoc.players.map(p => p.openid ? { seat: p.seat, openid: p.openid, nickname: p.nickname, avatar_url: p.avatar_url, is_alive: true, role: "unknown", role_state: { witch_poison_used: false, witch_save_used: false, hunter_shoot_used: false, guard_last_protected_seat: null }, action_status: { is_ready: false } } : p);
      await db.collection('game_rooms').doc(roomDocId).update({ data: { game_state: { status: "waiting", day_count: 0, phase: "setup", sub_phase: "ready", lovers: [], last_night_deaths: [], deaths_announced: true, voting_history: [] }, players: resetP, current_round_actions: getInitialActions(), timeline: [] } }); return { success: true };
    },
    quitGame: async (ev) => {
      if (ev.abandon && roomDoc._openid === wxCtx.OPENID) { await db.collection('game_rooms').doc(roomDocId).remove(); return { success: true }; }
      const p = roomDoc.players; const idx = p.findIndex(x => x.openid === wxCtx.OPENID);
      if (idx > -1) { p[idx].openid = ""; p[idx].nickname = `玩家${p[idx].seat}`; p[idx].avatar_url = ""; await db.collection('game_rooms').doc(roomDocId).update({ data: { players: p } }); }
      return { success: true };
    },
    getAudioQueue: async (ev) => {
      const keys = getAudioQueue(ev.gameState, ev.lastGameState);
      return { success: true, keys: keys };
    },
    getUserStats: async (ev) => {
      const openid = wxCtx.OPENID;
      const countRes = await db.collection('game_records').where({ player_openids: openid }).count();
      const total = countRes.total;
      if (total === 0) return { success: true, stats: { total: 0, wins: 0, winRate: '0%' } };
      const res = await db.collection('game_records').where({ player_openids: openid }).field({ winner: true, players: true, record_date: true }).orderBy('record_date', 'desc').limit(100).get();
      let wins = 0; let validGames = 0;
      res.data.forEach(rec => {
        const me = rec.players.find(p => p.openid === openid);
        if (me) {
          validGames++;
          const winner = rec.winner;
          if (winner === 'good' && !['werewolf', 'wolf_beauty', 'gargoyle', 'wild_child'].includes(me.role)) wins++;
          else if (winner === 'werewolf' && ['werewolf', 'wolf_beauty', 'gargoyle'].includes(me.role)) wins++;
        }
      });
      return { success: true, stats: { total, wins, winRate: `${validGames > 0 ? Math.round((wins / validGames) * 100) : 0}%` }, recentRecord: res.data.length > 0 ? res.data[0] : null };
    }
  };

  if (acts[type]) return await acts[type](event);
  return { success: false, message: `Unknown type: ${type}` };
};
