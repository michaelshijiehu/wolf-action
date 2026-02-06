const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { flowConfig } = require('./constants');
const { applyUpdates, doSaveRecord, checkWinner, getAudioQueue, checkContentSecurity } = require('./utils');
const { simulateBotActions, fillBots } = require('./botLogic');

const WOLF_ROLES = ['werewolf', 'wolf_king', 'wolf_beauty', 'hidden_wolf', 'gargoyle'];

const getInitialActions = () => ({
  role_confirmations: {},
  werewolf_votes: {},
  day_votes: {},
  seer_check: {},
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

// ==========================================
// 1. Core State Machine (THE ONLY ENTRY FOR PHASE TRANSITIONS)
// ==========================================

const nextPhase = async (roomId, roomDoc, roomDocId) => {
  const gs = roomDoc.game_state;
  let updates = { updated_at: new Date() };

  const log = (txt, day, phase) => {
    const filteredKeywords = ['天亮了', '天黑了', '黑夜降临', '进入死亡结算'];
    if (filteredKeywords.some(kw => txt.includes(kw))) return;
    if (!updates.timeline) updates.timeline = [...(roomDoc.timeline || [])];
    updates.timeline.push({ day: day || gs.day_count, phase: phase || gs.phase, text: txt, timestamp: new Date() });
  };

  const setInst = (key, forcedDuration) => {
    let cfg = flowConfig[key]; if (!cfg) return;
    let dur = forcedDuration !== undefined ? forcedDuration : (Array.isArray(cfg.duration) ? Math.floor(Math.random() * (cfg.duration[1] - cfg.duration[0] + 1)) + cfg.duration[0] : (cfg.duration !== undefined ? cfg.duration : 15));

    const tempGs = Object.assign({}, gs);
    Object.keys(updates).forEach(k => { if (k.startsWith('game_state.')) { tempGs[k.replace('game_state.', '')] = updates[k]; } });

    // Explicitly guarantee critical keys for audio
    ['sheriff_seat', 'exile_seat', 'exile_result', 'election_result'].forEach(prop => {
      if (updates[`game_state.${prop}`] !== undefined) tempGs[prop] = updates[`game_state.${prop}`];
    });

    updates['game_state.sub_phase'] = key;
    updates['game_state.current_instruction'] = {
      sub_phase: key, expire_time: Date.now() + dur * 1000, duration: dur,
      audio: cfg.getAudio ? cfg.getAudio(tempGs) : [], roleRequired: cfg.roleRequired || null,
      title: cfg.ui ? cfg.ui.title : '', tips: cfg.ui ? cfg.ui.tips : '',
      actionBtn: cfg.ui && cfg.ui.actionBtn ? cfg.ui.actionBtn : '', color: cfg.ui && cfg.ui.color ? cfg.ui.color : '#ffffff',
      actionPanel: cfg.ui && cfg.ui.actionPanel ? cfg.ui.actionPanel : 'none',
      brightness: cfg.ui && cfg.ui.brightness !== undefined ? cfg.ui.brightness : 1.0, auto_proceed: !!cfg.auto_proceed
    };
    updates['game_state.stage_deadline'] = Date.now() + (dur * 1000);
  };

  const findNextState = (currentSub) => {
    let nextSub = flowConfig[currentSub] ? flowConfig[currentSub].next : null;
    let safeguard = 0;
    while (nextSub && safeguard < 50) {
      const cfg = flowConfig[nextSub]; if (!cfg) return null;
      let shouldSkip = false;
      
      if (cfg.roleRequired) {
        const roleCount = roomDoc.config.roles[cfg.roleRequired] || 0;
        // Only skip if the role is not in the configuration at all
        if (roleCount === 0) {
          // Special case for werewolf variants
          if (cfg.roleRequired === 'werewolf') {
            const wolfVariants = ['werewolf', 'wolf_king', 'wolf_beauty', 'hidden_wolf', 'gargoyle'];
            const hasWolf = Object.keys(roomDoc.config.roles).some(r => wolfVariants.includes(r) && roomDoc.config.roles[r] > 0);
            if (!hasWolf) shouldSkip = true;
          } else {
            shouldSkip = true;
          }
        }
      }
      
      if (cfg.firstNightOnly && gs.day_count > 1) shouldSkip = true;
      if (!shouldSkip && cfg.shouldSkip) shouldSkip = cfg.shouldSkip(gs, roomDoc.players);
      
      if (!shouldSkip) return nextSub;
      nextSub = cfg.next; safeguard++;
    }
    return null;
  };

  const aliveCount = roomDoc.players.filter(p => p.is_alive).length;
  const discussionTime = Math.max(60, aliveCount * 60);

  // --- LOGIC ENGINE SWITCH ---
  if (gs.sub_phase === 'game_welcome') setInst('deal_cards');
  else if (gs.sub_phase === 'deal_cards') { updates['game_state.phase'] = 'night'; setInst('night_start'); }
  else if (gs.sub_phase === 'night_start') {
    const nextSub = findNextState('night_start');
    if (nextSub) setInst(nextSub); else setInst('calculate_death');
  }
  else if (gs.sub_phase === 'calculate_death') {
    const cur = roomDoc.current_round_actions || {};
    let players = [...roomDoc.players]; 
    let deaths = [];

    // --- Magician Swap Logic (Virtual) ---
    // If Magician exchanged A and B, actions on A affect B, and actions on B affect A.
    // We implement this by mapping 'effective targets' for calculation.
    const magExchange = cur.magician_exchange || [];
    const getEffectiveTarget = (seat) => {
      if (magExchange.length === 2) {
        if (seat === magExchange[0]) return magExchange[1];
        if (seat === magExchange[1]) return magExchange[0];
      }
      return seat;
    };

    const wolfVotes = cur.werewolf_votes || {};
    const wolfCounts = {};
    Object.values(wolfVotes).forEach(v => { wolfCounts[v] = (wolfCounts[v] || 0) + 1; });
    const wolfSorted = Object.entries(wolfCounts).sort((a, b) => b[1] - a[1]);
    let wolfKillOriginal = (wolfSorted.length > 0) ? Number(wolfSorted[0][0]) : null;
    const wolfKill = wolfKillOriginal ? getEffectiveTarget(wolfKillOriginal) : null;

    const witchSave = cur.witch_action?.save ? wolfKill : null; // Witch sees the original dead (usually), or if Magician swapped, does Witch see the result? 
    // Standard rule: Witch sees who is 'about to die'. If Magician swapped, the 'new' target is the one dying. 
    // Simplified: Witch saves the *effective* wolf kill target.
    
    const witchPoisonOriginal = cur.witch_action?.poison_target ? Number(cur.witch_action.poison_target) : null;
    const witchPoison = witchPoisonOriginal ? getEffectiveTarget(witchPoisonOriginal) : null;
    
    const guardProtectOriginal = cur.guard_protect ? Number(cur.guard_protect) : null;
    const guardProtect = guardProtectOriginal ? getEffectiveTarget(guardProtectOriginal) : null;

    const dreamTarget = cur.dream_catcher_sleep ? Number(cur.dream_catcher_sleep) : null;
    const lastDreamTarget = gs.last_dream_catcher_target ? Number(gs.last_dream_catcher_target) : null;

    // Merchant effect: shroud prevents wolf kill on target
    const merchantTarget = cur.merchant_trade ? Number(cur.merchant_trade) : null;
    const merchantItem = cur.merchant_item || null;
    const shroudTarget = merchantItem === 'shroud' ? merchantTarget : null;

    if (wolfKill && players.find(p => p.seat === wolfKill)?.is_alive) {
      if (shroudTarget && wolfKill === shroudTarget) {
        // Shroud blocks the wolf kill
      } else {
      if (wolfKill === witchSave && wolfKill === guardProtect) deaths.push({ seat: wolfKill, reason: 'milk_guard_clash' });
      else if (wolfKill !== witchSave && wolfKill !== guardProtect) {
        if (!dreamTarget || wolfKill !== dreamTarget) deaths.push({ seat: wolfKill, reason: 'werewolf_kill' });
      }
      }
    }
    if (witchPoison && players.find(p => p.seat === witchPoison)?.is_alive) {
      if (!dreamTarget || witchPoison !== dreamTarget) deaths.push({ seat: witchPoison, reason: 'witch_poison' });
    }

    // Merchant poison: add an extra death
    if (merchantItem === 'poison' && merchantTarget && players.find(p => p.seat === merchantTarget)?.is_alive) {
      if (!deaths.some(d => d.seat === merchantTarget)) {
        if (!dreamTarget || merchantTarget !== dreamTarget) deaths.push({ seat: merchantTarget, reason: 'merchant_poison' });
      }
    }

    // Merchant lucky card: prevent one death on the target this night
    if (merchantItem === 'lucky_card' && merchantTarget) {
      const idx = deaths.findIndex(d => d.seat === merchantTarget);
      if (idx > -1) deaths.splice(idx, 1);
    }

    // Dream catcher special rules
    if (dreamTarget && lastDreamTarget && dreamTarget === lastDreamTarget) {
      if (players.find(p => p.seat === dreamTarget)?.is_alive && !deaths.some(d => d.seat === dreamTarget)) {
        deaths.push({ seat: dreamTarget, reason: 'dream_catcher_repeat' });
      }
    }

    const dreamCatcher = players.find(p => p.role === 'dream_catcher');
    if (dreamCatcher && deaths.some(d => d.seat === dreamCatcher.seat) && dreamTarget) {
      if (players.find(p => p.seat === dreamTarget)?.is_alive && !deaths.some(d => d.seat === dreamTarget)) {
        deaths.push({ seat: dreamTarget, reason: 'dream_catcher_link' });
      }
    }

    // --- Wolf Beauty Charm (Martyrdom) ---
    // If Wolf Beauty dies, her target dies.
    const deadSeatsPre = deaths.map(d => d.seat);
    const wolfBeauty = players.find(p => p.role === 'wolf_beauty');
    if (wolfBeauty && deadSeatsPre.includes(wolfBeauty.seat) && cur.wolf_beauty_charm) {
       const charmTarget = Number(cur.wolf_beauty_charm);
       if (players.find(p => p.seat === charmTarget)?.is_alive && !deadSeatsPre.includes(charmTarget)) {
         deaths.push({ seat: charmTarget, reason: 'wolf_beauty_charm' });
       }
    }

    // --- Lovers Martyrdom ---
    const lovers = gs.lovers || [];
    if (lovers.length === 2) {
      // Re-calculate dead seats including Wolf Beauty victim
      const currentDeadSeats = deaths.map(d => d.seat);
      lovers.forEach(seat => {
        if (currentDeadSeats.includes(seat)) {
          const other = lovers.find(s => s !== seat);
          if (players.find(p => p.seat === other)?.is_alive && !deaths.some(d => d.seat === other)) {
            deaths.push({ seat: other, reason: 'lover' });
          }
        }
      });
    }

    // --- Wild Child Transformation ---
    const allDeadSeats = deaths.map(d => d.seat);
    const wildChild = players.find(p => p.role === 'wild_child');
    if (wildChild && wildChild.is_alive && wildChild.role_state.model_seat && allDeadSeats.includes(wildChild.role_state.model_seat)) {
      // Wild Child follows Wolf Leader -> becomes Werewolf (logically)
      // We don't change the role string 'wild_child', but we might flag it or handle it in team check.
      // For now, let's update a state flag.
      const wcIdx = players.findIndex(p => p.role === 'wild_child');
      if (wcIdx > -1) {
        updates[`players.${wcIdx}.role_state.is_wolf_side`] = true;
        log(`野孩子榜样死亡，已加入狼人阵营`); // Log visible to Judge
      }
    }

    // updates['players'] = players; // Moved to day_dawn
    updates['game_state.last_night_deaths'] = deaths;
    updates['game_state.last_dream_catcher_target'] = dreamTarget || null;
    setInst('day_announce');
  }
  else if (gs.sub_phase === 'day_announce') {
    if (gs.day_count === 1 && !gs.sheriff_seat && roomDoc.config.roles.sheriff !== 0) { updates['game_state.phase'] = 'sheriff_election'; setInst('sheriff_nomination'); }
    else { updates['game_state.phase'] = 'day_process'; setInst('day_dawn'); }
  }
  else if (gs.sub_phase === 'sheriff_nomination') {
    const cands = gs.sheriff_candidate_seats || [];
    if (cands.length === 0) { updates['game_state.phase'] = 'day_process'; updates['game_state.sheriff_candidate_seats'] = []; setInst('day_dawn'); }
    else if (cands.length === 1) { updates['game_state.sheriff_seat'] = cands[0]; updates['game_state.election_result'] = 'elected'; setInst('election_announce'); }
    else setInst('sheriff_speech', cands.length * 20);
  }
  else if (gs.sub_phase === 'sheriff_speech') setInst('sheriff_voting');
  else if (gs.sub_phase === 'sheriff_voting') {
    const deadSeats = (gs.last_night_deaths || []).map(d => d.seat);
    const counts = {}; 
    Object.entries(roomDoc.current_round_actions.sheriff_votes || {}).forEach(([v, t]) => { 
      const voterSeat = Number(v);
      if (t > 0 && !deadSeats.includes(voterSeat)) {
        counts[t] = (counts[t] || 0) + 1; 
      }
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const history = [...(gs.voting_history || [])];
    if (sorted.length > 0) {
      const max = sorted[0][1]; const winners = sorted.filter(x => x[1] === max);
      if (winners.length === 1) {
        log(`警长当选: ${winners[0][0]}号`);
        updates['game_state.sheriff_seat'] = Number(winners[0][0]);
        updates['game_state.election_result'] = 'elected';
        history.push({ day: gs.day_count, phase: 'sheriff_election', votes: roomDoc.current_round_actions.sheriff_votes, result: 'elected', winner: Number(winners[0][0]) });
        setInst('election_announce');
      } else {
        updates['game_state.pk_candidates'] = winners.map(x => Number(x[0]));
        updates['game_state.sheriff_candidate_seats'] = winners.map(x => Number(x[0]));
        history.push({ day: gs.day_count, phase: 'sheriff_election', votes: roomDoc.current_round_actions.sheriff_votes, result: 'pk', pk_candidates: winners.map(x => Number(x[0])) });
        setInst('sheriff_pk_speech');
      }
    } else {
      log(`无人投票，本届警长选举流失`);
      updates['game_state.phase'] = 'day_process';
      updates['game_state.sheriff_candidate_seats'] = [];
      updates['game_state.election_result'] = 'failed';
      history.push({ day: gs.day_count, phase: 'sheriff_election', votes: roomDoc.current_round_actions.sheriff_votes, result: 'failed' });
      setInst('day_dawn');
    }
    updates['game_state.voting_history'] = history;
  }
  else if (gs.sub_phase === 'sheriff_pk_voting') {
    const deadSeats = (gs.last_night_deaths || []).map(d => d.seat);
    const counts = {}; 
    Object.entries(roomDoc.current_round_actions.sheriff_votes || {}).forEach(([v, t]) => { 
      const voterSeat = Number(v);
      if (t > 0 && !deadSeats.includes(voterSeat)) {
        counts[t] = (counts[t] || 0) + 1; 
      }
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const history = [...(gs.voting_history || [])];
    if (sorted.length > 0) {
      const max = sorted[0][1]; const winners = sorted.filter(x => x[1] === max);
      if (winners.length === 1) {
        log(`警长PK当选: ${winners[0][0]}号`);
        updates['game_state.sheriff_seat'] = Number(winners[0][0]);
        updates['game_state.election_result'] = 'elected';
        history.push({ day: gs.day_count, phase: 'sheriff_pk_voting', votes: roomDoc.current_round_actions.sheriff_votes, result: 'elected', winner: Number(winners[0][0]) });
        setInst('election_announce');
      } else {
        log(`警长PK再次平票，警徽流失`);
        updates['game_state.election_result'] = 'tie';
        history.push({ day: gs.day_count, phase: 'sheriff_pk_voting', votes: roomDoc.current_round_actions.sheriff_votes, result: 'tie' });
        setInst('election_announce');
      }
    } else {
      log(`无人投票，警徽流失`);
      updates['game_state.election_result'] = 'failed';
      history.push({ day: gs.day_count, phase: 'sheriff_pk_voting', votes: roomDoc.current_round_actions.sheriff_votes, result: 'failed' });
      setInst('election_announce');
    }
    updates['game_state.voting_history'] = history;
  }
  else if (gs.sub_phase === 'election_announce') {
    updates['game_state.sheriff_candidate_seats'] = [];
    updates['game_state.phase'] = 'day_process';
    setInst('day_dawn');
  }
  else if (gs.sub_phase === 'day_dawn') {
    updates['game_state.is_day_ending'] = false;
    const deaths = gs.last_night_deaths || [];
    
    // Log death results visually at announcement time
    if (deaths.length === 0) log('昨晚是平安夜'); 
    else log(`昨晚，${deaths.map(d => d.seat + '号').join(', ')} 倒在了血泊中`);

    // Apply deaths visually here
    let players = [...roomDoc.players];
    let hasUpdates = false;
    deaths.forEach(d => {
        const idx = players.findIndex(p => p.seat === d.seat);
        if (idx > -1 && players[idx].is_alive) {
            players[idx].is_alive = false;
            players[idx].death_reason = d.reason;
            hasUpdates = true;
        }
    });
    if (hasUpdates) updates['players'] = players;
    updates['game_state.last_revealed_deaths'] = deaths;

    const deadSheriff = deaths.find(d => d.seat === gs.sheriff_seat);
    const deadHunter = deaths.find(d => { const p = roomDoc.players.find(x => x.seat === d.seat); return p && p.role === 'hunter' && d.reason !== 'witch_poison'; });
    if (deadSheriff) setInst('sheriff_handover'); else if (deadHunter) setInst('hunter_action');
    else { updates['game_state.phase'] = 'day_discussion'; setInst('discussion', discussionTime); }
  }
  else if (gs.sub_phase === 'discussion') { updates['game_state.phase'] = 'day_voting'; updates['current_round_actions.day_votes'] = {}; setInst('voting'); }
  else if (gs.sub_phase === 'voting' || gs.sub_phase === 'pk_voting') {
    const counts = {};
    Object.entries(roomDoc.current_round_actions.day_votes || {}).forEach(([v, t]) => {
      if (t === 0) return;
      const voterSeat = Number(v);
      const voter = roomDoc.players.find(p => p.seat === voterSeat);
      if (!voter || !voter.is_alive || voter.death_reason) return;
      const weight = (voterSeat === gs.sheriff_seat) ? 1.5 : 1;
      counts[t] = (counts[t] || 0) + weight;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const history = [...(gs.voting_history || [])];
    if (sorted.length > 0) {
      const max = sorted[0][1]; const winners = sorted.filter(x => x[1] === max);
      if (winners.length === 1) {
        const out = Number(winners[0][0]); const pIdx = roomDoc.players.findIndex(pl => pl.seat === out);
        const targetPlayer = roomDoc.players[pIdx];
        if (pIdx > -1 && targetPlayer.role === 'idiot' && !targetPlayer.role_state.idiot_revealed && targetPlayer.is_alive) {
          updates[`players.${pIdx}.role_state.idiot_revealed`] = true;
          updates['game_state.exile_result'] = 'idiot_reveal';
          updates['game_state.exile_seat'] = out;
          log(`${out}号 白痴翻牌，免于放逐`);
          history.push({ day: gs.day_count, phase: gs.sub_phase, votes: roomDoc.current_round_actions.day_votes, result: 'idiot_reveal', target: out });
          setInst('exile_announce');
        }
        else if (pIdx > -1 && targetPlayer.is_alive) {
          // const players = [...roomDoc.players]; players[pIdx].is_alive = false; players[pIdx].death_reason = 'vote';
          // const lovers = gs.lovers || []; if (lovers.includes(out)) { const other = lovers.find(s => s !== out); const oIdx = players.findIndex(pl => pl.seat === other); if (oIdx > -1 && players[oIdx].is_alive) { players[oIdx].is_alive = false; players[oIdx].death_reason = 'lover'; log(`${other}号 殉情而去`); } }
          // updates['players'] = players; 
          updates['game_state.last_exiled_seat'] = out; updates['game_state.exile_result'] = 'out'; updates['game_state.exile_seat'] = out;
          log(`${out}号 被投票放逐`);
          history.push({ day: gs.day_count, phase: gs.sub_phase, votes: roomDoc.current_round_actions.day_votes, result: 'out', target: out });
          setInst('exile_announce');
        } else {
          updates['game_state.exile_result'] = 'tie';
          log(`票人目标已不在场，无人出局`);
          history.push({ day: gs.day_count, phase: gs.sub_phase, votes: roomDoc.current_round_actions.day_votes, result: 'tie' });
          setInst('exile_announce');
        }
      } else {
        if (gs.sub_phase === 'pk_voting') {
          updates['game_state.exile_result'] = 'tie';
          log(`PK再次平票，本轮无人出局`);
          history.push({ day: gs.day_count, phase: gs.sub_phase, votes: roomDoc.current_round_actions.day_votes, result: 'tie' });
          setInst('exile_announce');
        } else {
          updates['game_state.pk_candidates'] = winners.map(x => Number(x[0]));
          log(`平票，进入PK发言`);
          history.push({ day: gs.day_count, phase: gs.sub_phase, votes: roomDoc.current_round_actions.day_votes, result: 'pk', pk_candidates: winners.map(x => Number(x[0])) });
          setInst('day_pk');
        }
      }
    } else {
      updates['game_state.exile_result'] = 'tie';
      log(`无人投票，平安日`);
      history.push({ day: gs.day_count, phase: gs.sub_phase, votes: roomDoc.current_round_actions.day_votes, result: 'tie' });
      setInst('exile_announce');
    }
    updates['game_state.voting_history'] = history;
  }
  else if (gs.sub_phase === 'exile_announce') {
    if (gs.exile_result === 'out') updates['game_state.is_day_ending'] = true;
    if (gs.exile_result === 'idiot_reveal' || gs.exile_result === 'tie') { updates['game_state.phase'] = 'night'; updates['game_state.day_count'] = gs.day_count + 1; updates['current_round_actions'] = getInitialActions(); updates['game_state.last_night_deaths'] = []; setInst('night_start'); }
    else setInst('leave_speech');
  }
  else if (gs.sub_phase === 'leave_speech') {
    const out = gs.last_exiled_seat; 
    let players = [...roomDoc.players];
    const pIdx = players.findIndex(x => x.seat === out);
    
    if (pIdx > -1 && gs.exile_result === 'out') {
      players[pIdx].is_alive = false;
      players[pIdx].death_reason = 'vote';
      
      const lovers = gs.lovers || [];
      if (lovers.includes(out)) {
        const other = lovers.find(s => s !== out);
        const oIdx = players.findIndex(pl => pl.seat === other);
        if (oIdx > -1 && players[oIdx].is_alive) {
          players[oIdx].is_alive = false;
          players[oIdx].death_reason = 'lover';
          log(`${other}号 殉情而去`);
        }
      }
      updates['players'] = players;
    }

    const p = players.find(x => x.seat === out);
    if (gs.sheriff_seat === out) { updates['game_state.phase'] = 'day_process'; setInst('sheriff_handover'); }
    else if (p && p.role === 'hunter' && p.role_state.hunter_status === 'can_shoot') { updates['game_state.phase'] = 'day_process'; setInst('hunter_action'); }
    else { updates['game_state.phase'] = 'night'; updates['game_state.day_count'] = gs.day_count + 1; updates['current_round_actions'] = getInitialActions(); updates['game_state.last_night_deaths'] = []; setInst('night_start'); }
  }
  else if (gs.sub_phase === 'sheriff_handover') {
    if (gs.is_day_ending) { updates['game_state.phase'] = 'night'; updates['game_state.day_count'] = gs.day_count + 1; updates['current_round_actions'] = getInitialActions(); updates['game_state.last_night_deaths'] = []; setInst('night_start'); }
    else setInst('discussion', discussionTime);
  }
  else if (gs.sub_phase === 'hunter_action') {
    const shootTarget = roomDoc.current_round_actions.hunter_shoot;
    if (shootTarget) {
      const idx = roomDoc.players.findIndex(p => p.seat == shootTarget);
      if (idx > -1) {
        updates[`players.${idx}.is_alive`] = false;
        updates[`players.${idx}.death_reason`] = 'hunter_shoot';
        log(`${shootTarget}号 被猎人带走`);
        // Dream catcher link: if dream catcher dies, dreamer dies
        if (roomDoc.players[idx].role === 'dream_catcher' && gs.last_dream_catcher_target) {
          const dreamIdx = roomDoc.players.findIndex(p => p.seat === gs.last_dream_catcher_target);
          if (dreamIdx > -1 && roomDoc.players[dreamIdx].is_alive) {
            updates[`players.${dreamIdx}.is_alive`] = false;
            updates[`players.${dreamIdx}.death_reason`] = 'dream_catcher_link';
            log(`${gs.last_dream_catcher_target}号 受摄梦牵连出局`);
          }
        }
        if (gs.sheriff_seat == shootTarget) { updates['game_state.phase'] = 'day_process'; setInst('sheriff_handover'); return applyUpdates(roomDoc, updates); }
      }
    }
    if (gs.is_day_ending) { updates['game_state.phase'] = 'night'; updates['game_state.day_count'] = gs.day_count + 1; updates['current_round_actions'] = getInitialActions(); updates['game_state.last_night_deaths'] = []; setInst('night_start'); }
    else setInst('discussion', discussionTime);
  }
  else {
    const nextSub = findNextState(gs.sub_phase);
    if (nextSub) {
      const nextCfg = flowConfig[nextSub];
      if (nextCfg.env && nextCfg.env !== gs.phase) {
        updates['game_state.phase'] = nextCfg.env;
        if (nextCfg.env === 'night') { updates['game_state.day_count'] = gs.day_count + 1; updates['current_round_actions'] = getInitialActions(); updates['game_state.last_night_deaths'] = []; }
      }
      setInst(nextSub);
    } else setInst('discussion', discussionTime);
  }

  const finalSnapshot = applyUpdates(roomDoc, updates);
  let winResult = null; if (finalSnapshot.game_state.status === 'playing') winResult = checkWinner(finalSnapshot.players, finalSnapshot.game_state.lovers);
  if (winResult) {
    const reasonMap = { 'villager_win': '狼人全灭', 'wolf_kill_god': '神职屠边', 'wolf_kill_villager': '村民屠边', 'third_party_win': '情侣绑票' };
    const reasonText = reasonMap[winResult.reason] || '';
    
    // Crucial: Update the updates object and RE-APPLY to finalSnapshot for recording
    updates['game_state.status'] = 'finished'; 
    updates['game_state.sub_phase'] = 'game_over';
    updates['game_state.winner'] = winResult.winner; 
    updates['game_state.current_instruction'] = { 
      sub_phase: 'game_over', 
      duration: 0, 
      audio: ['GAME_OVER'], 
      title: '🏆 游戏结束', 
      tips: (winResult.winner === 'good' ? '好人阵营获胜' : '狼人阵营获胜') + (reasonText ? `\n(${reasonText})` : ''), 
      actionPanel: 'none', 
      auto_proceed: false 
    }; 
    
    // Re-sync finalSnapshot so doSaveRecord gets the winner data
    Object.assign(finalSnapshot.game_state, {
      status: 'finished',
      sub_phase: 'game_over',
      winner: winResult.winner,
      current_instruction: updates['game_state.current_instruction']
    });
  }

  await db.collection('game_rooms').doc(roomDocId).update({ data: updates });
  if (winResult) await doSaveRecord(db, roomId, finalSnapshot);
  return finalSnapshot;
};

const checkAutoProceedInternal = async (roomId, roomDoc, roomDocId) => {
  if (!roomDoc || roomDoc.game_state.status !== 'playing') return roomDoc;
  const gs = roomDoc.game_state; const inst = gs.current_instruction;
  if (inst && inst.auto_proceed && gs.stage_deadline) {
    const now = Date.now(); if (now >= (gs.stage_deadline - 500)) return await nextPhase(roomId, roomDoc, roomDocId);
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
      roomDoc = res.data[0]; roomDocId = roomDoc._id;
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
          const init = { roomId: rid, _openid: wxCtx.OPENID, created_at: new Date(), updated_at: new Date(), expireAt: new Date(Date.now() + 7200000), config: { player_count: 6, roles: { werewolf: 2, villager: 2, seer: 1, witch: 1 } }, game_state: { status: "waiting", day_count: 0, phase: "setup", sub_phase: "ready", sheriff_seat: null, sheriff_candidate_seats: [], lovers: [], last_night_deaths: [], last_revealed_deaths: [], last_dream_catcher_target: null, deaths_announced: true, voting_history: [] }, players: Array.from({ length: 6 }, (_, i) => ({ seat: i + 1, openid: "", nickname: `玩家${i + 1}`, avatar_url: "", is_alive: true, role: "unknown", role_state: {}, action_status: {} })), current_round_actions: getInitialActions(), timeline: [], hidden_timeline: [] };
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
    startGame: async (ev) => {
      const res = await db.collection('game_rooms').where({ roomId: eventRoomId }).get();
      const room = res.data[0]; const players = room.players; const real = players.filter(p => p.openid); const roles = ev.config.roles;
      let pool = []; for (const [role, count] of Object.entries(roles)) for (let i = 0; i < count; i++) pool.push(role);
      pool = pool.slice(0, real.length).sort(() => Math.random() - 0.5); let pi = 0;
      players.forEach(p => { if (p.openid) { p.role = pool[pi++]; p.is_alive = true; p.death_reason = null; p.role_state = { witch_poison_used: false, witch_save_used: false, hunter_shoot_used: false, hunter_status: 'can_shoot', guard_last_protected_seat: null, idiot_revealed: false, model_seat: null, knight_ability_used: false, merchant_item: null, silencer_last_silenced: null, magician_exchanged: [], dream_catcher_target: null, wolf_beauty_target: null, gargoyle_check_history: [] }; } });
      const inst = flowConfig['game_welcome']; const dur = inst.duration || 10;
      const initialGameState = {
        status: 'playing', start_time: new Date(), day_count: 1, phase: 'day', sub_phase: 'game_welcome', sheriff_seat: null, lovers: [], deaths_announced: true,
        current_instruction: {
          sub_phase: 'game_welcome', expire_time: Date.now() + dur * 1000, duration: dur,
          audio: inst.getAudio ? inst.getAudio() : ['WELCOME'], title: inst.ui.title, tips: inst.ui.tips, color: inst.ui.color, actionPanel: inst.ui.actionPanel || 'none', brightness: inst.ui.brightness || 1.0, auto_proceed: true
        },
        stage_deadline: Date.now() + (dur * 1000), voting_history: [], last_night_deaths: [], last_revealed_deaths: [], last_dream_catcher_target: null
      };
      await db.collection('game_rooms').doc(room._id).update({ data: { players, config: { player_count: players.length, roles }, 'game_state': initialGameState, current_round_actions: getInitialActions(), timeline: [{ day: 1, phase: 'day', text: '游戏开始', timestamp: new Date() }], updated_at: new Date() } });
      return { success: true };
    },
    nextPhase: () => nextPhase(eventRoomId, roomDoc, roomDocId),
    updateRoomSize: async (ev) => {
      let p = roomDoc.players; if (ev.targetCount > p.length) for (let i = p.length; i < ev.targetCount; i++) p.push({ seat: i + 1, openid: "", nickname: `玩家${i + 1}`, avatar_url: "", is_alive: true, role: "unknown", role_state: {}, action_status: {} });
      else if (ev.targetCount < p.length) p = p.slice(0, ev.targetCount);
      await db.collection('game_rooms').doc(roomDocId).update({ data: { players: p, 'config.player_count': ev.targetCount } }); return { success: true };
    },
    debugFillBots: async (ev) => { return await fillBots(db, roomDoc, roomDocId, ev.targetCount); },
    fillRoom: async (ev) => { return await fillBots(db, roomDoc, roomDocId, ev.targetCount); },
    runBotCycle: async (event) => { await simulateBotActions(db, roomDoc, roomDocId); return { success: true }; },
    werewolfAction: async (ev) => { 
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      if (!me || !me.is_alive) return { success: false, message: '您已出局或未入座' };
      if (!WOLF_ROLES.includes(me.role) && !me.role_state?.is_wolf_side) return { success: false, message: '您不是狼人' };
      await db.collection('game_rooms').doc(roomDocId).update({ data: { [`current_round_actions.werewolf_votes.${wxCtx.OPENID}`]: Number(ev.targetSeat) } }); 
      return { success: true }; 
    },
    witchAction: async (ev) => {
      if (ev.actionType === 'skip') return { success: true };
      const pIdx = roomDoc.players.findIndex(x => x.role === 'witch'); 
      if (pIdx === -1) return { success: false, message: '本局无女巫' };
      const player = roomDoc.players[pIdx];
      if (!player.is_alive) return { success: false, message: '您已出局' };
      const up = {};
      if (ev.actionType === 'save') { 
        if (player.role_state.witch_save_used) return { success: false, message: '解药已使用' };
        up['current_round_actions.witch_action.save'] = true; 
        up[`players.${pIdx}.role_state.witch_save_used`] = true; 
      }
      else if (ev.actionType === 'poison') { 
        if (player.role_state.witch_poison_used) return { success: false, message: '毒药已使用' };
        up['current_round_actions.witch_action.poison_target'] = Number(ev.targetSeat); 
        up[`players.${pIdx}.role_state.witch_poison_used`] = true; 
      }
      await db.collection('game_rooms').doc(roomDocId).update({ data: up }); return { success: true };
    },
    seerAction: async (ev) => {
      const seerIdx = roomDoc.players.findIndex(p => p.role === 'seer');
      if (seerIdx === -1) return { success: false, message: '本局无预言家' };
      const seer = roomDoc.players[seerIdx];
      if (!seer.is_alive) return { success: false, message: '您已出局' };
      const targetSeat = Number(ev.targetSeat); 
      const target = roomDoc.players.find(pl => pl.seat == targetSeat); 
      if (!target) return { success: false, message: '目标不存在' };
      const isBad = WOLF_ROLES.includes(target.role);
      const history = (seer.role_state.check_history || []); history.push({ day: roomDoc.game_state.day_count, seat: targetSeat, isBad });
      await db.collection('game_rooms').doc(roomDocId).update({ data: { 'current_round_actions.seer_check': { target: targetSeat, isBad }, [`players.${seerIdx}.role_state.check_history`]: history } });
      return { success: true, isBad };
    },
    guardAction: async (ev) => {
      const pIdx = roomDoc.players.findIndex(x => x.role === 'guard');
      if (pIdx > -1) {
        const guard = roomDoc.players[pIdx];
        if (!guard.is_alive) return { success: false, message: '您已出局' };
        const lastProtect = guard.role_state.guard_last_protected_seat;
        const targetSeat = Number(ev.targetSeat);
        if (lastProtect === targetSeat) return { success: false, message: '不能连续守护同一人' };
        
        await db.collection('game_rooms').doc(roomDocId).update({ 
          data: { 
            'current_round_actions.guard_protect': targetSeat, 
            [`players.${pIdx}.role_state.guard_last_protected_seat`]: targetSeat 
          } 
        });
      }
      return { success: true };
    },
    roleConfirm: async () => {
      await db.collection('game_rooms').doc(roomDocId).update({ data: { [`current_round_actions.role_confirmations.${wxCtx.OPENID}`]: true } });
      return { success: true };
    },
    voteAction: async (ev) => { 
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID); 
      if (!me || !me.is_alive) return { success: false, message: '您已出局或未入座' };
      if (roomDoc.current_round_actions?.silencer_silence === me.seat) return { success: false, message: '您已被禁言，无法投票' };
      
      const up = { [`current_round_actions.day_votes.${me.seat}`]: Number(ev.targetSeat) };
      await db.collection('game_rooms').doc(roomDocId).update({ data: up }); 

      // Check if all voted
      const updatedRoom = applyUpdates(roomDoc, up);
      const subPhase = updatedRoom.game_state.sub_phase;
      const votes = updatedRoom.current_round_actions.day_votes || {};
      
      const pkCands = updatedRoom.game_state.pk_candidates || [];
      const eligibleVoters = updatedRoom.players.filter(p => {
        if (!p.is_alive || p.death_reason) return false;
        if (updatedRoom.current_round_actions.silencer_silence === p.seat) return false;
        if (subPhase === 'pk_voting' && pkCands.includes(p.seat)) return false;
        return true;
      });

      const actualVotesCount = Object.keys(votes).length;
      if (actualVotesCount >= eligibleVoters.length) {
        console.log('[Vote] All eligible players voted. Advancing phase.');
        
        // CRITICAL: Push current votes to history before nextPhase, 
        // since nextPhase usually handles this only for timeout/manual click
        const finalHistory = [...(updatedRoom.game_state.voting_history || [])];
        const counts = {}; 
        Object.entries(votes).forEach(([v, t]) => { 
          if (t === 0) return;
          const weight = (Number(v) === updatedRoom.game_state.sheriff_seat) ? 1.5 : 1;
          counts[t] = (counts[t] || 0) + weight;
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        
        let result = 'tie';
        let target = null;
        let pk_candidates = [];
        
        if (sorted.length > 0) {
          const max = sorted[0][1]; 
          const winners = sorted.filter(x => x[1] === max);
          if (winners.length === 1) {
            result = 'out'; // Simplified, handle idiot in nextPhase? No, must match nextPhase logic
            target = Number(winners[0][0]);
          } else {
            result = 'pk';
            pk_candidates = winners.map(x => Number(x[0]));
          }
        }
        
        finalHistory.push({ 
          day: updatedRoom.game_state.day_count, 
          phase: subPhase, 
          votes: votes, 
          result: result, 
          target: target,
          pk_candidates: pk_candidates
        });
        
        const roomWithHistory = applyUpdates(updatedRoom, { 'game_state.voting_history': finalHistory });
        return await nextPhase(eventRoomId, roomWithHistory, roomDocId);
      }

      return { success: true }; 
    },
    wolfExplode: async () => {
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      if (me && me.role === 'werewolf' && me.is_alive) {
        const players = [...roomDoc.players]; const pIdx = players.findIndex(p => p.seat === me.seat); players[pIdx].is_alive = false; players[pIdx].death_reason = 'explode';
        await db.collection('game_rooms').doc(roomDocId).update({ data: { players, 'game_state.phase': 'night', 'game_state.sub_phase': 'night_start', 'game_state.day_count': roomDoc.game_state.day_count + 1, 'current_round_actions': getInitialActions(), timeline: [...(roomDoc.timeline || []), { day: roomDoc.game_state.day_count, phase: roomDoc.game_state.phase, text: `${me.seat}号 狼人自爆`, timestamp: new Date() }] } });
        return { success: true };
      } return { success: false };
    },
    sheriffAction: async (ev) => {
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      if (!me) return { success: false, message: '未入座' };
      const isDeadTonight = (roomDoc.game_state.last_night_deaths || []).some(d => d.seat === me.seat);

      if (ev.action === 'join') { 
        if (!me.is_alive || isDeadTonight) return { success: false, message: '您已出局或今晚已死亡' };
        if (roomDoc.current_round_actions?.silencer_silence === me.seat) return { success: false, message: '您已被禁言，无法上警' };
        let c = roomDoc.game_state.sheriff_candidate_seats || []; 
        if (ev.isJoining) { if (!c.includes(ev.seat)) c.push(ev.seat); } else { c = c.filter(s => s !== ev.seat); } 
        await db.collection('game_rooms').doc(roomDocId).update({ data: { 'game_state.sheriff_candidate_seats': c } }); 
      }
      else if (ev.action === 'vote') { 
        if (!me.is_alive || isDeadTonight) return { success: false, message: '您已出局或今晚已死亡，无法投票' };
        if (roomDoc.current_round_actions?.silencer_silence === me.seat) return { success: false, message: '您已被禁言，无法投票' };
        
        const up = { [`current_round_actions.sheriff_votes.${me.seat}`]: Number(ev.targetSeat) };
        await db.collection('game_rooms').doc(roomDocId).update({ data: up }); 

        // Check if all voted
        const updatedRoom = applyUpdates(roomDoc, up);
        const subPhase = updatedRoom.game_state.sub_phase;
        const votes = updatedRoom.current_round_actions.sheriff_votes || {};
        
        const sheriffCands = updatedRoom.game_state.sheriff_candidate_seats || [];
        const pkCands = updatedRoom.game_state.pk_candidates || [];
        
        const eligibleVoters = updatedRoom.players.filter(p => {
          if (!p.is_alive || p.death_reason) return false;
          // Night deaths are also not eligible for sheriff voting
          if ((updatedRoom.game_state.last_night_deaths || []).some(d => d.seat === p.seat)) return false;
          if (updatedRoom.current_round_actions.silencer_silence === p.seat) return false;
          
          if (subPhase === 'sheriff_voting' && sheriffCands.includes(p.seat)) return false;
          if (subPhase === 'sheriff_pk_voting' && pkCands.includes(p.seat)) return false;
          return true;
        });

        const actualVotesCount = Object.keys(votes).length;
        if (actualVotesCount >= eligibleVoters.length) {
          console.log('[Sheriff Vote] All eligible players voted. Advancing phase.');
          
          const finalHistory = [...(updatedRoom.game_state.voting_history || [])];
          const counts = {}; 
          Object.entries(votes).forEach(([v, t]) => { if (t > 0) counts[t] = (counts[t] || 0) + 1; });
          const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
          
          let result = 'failed';
          let winner = null;
          let pk_candidates = [];
          
          if (sorted.length > 0) {
            const max = sorted[0][1]; 
            const winners = sorted.filter(x => x[1] === max);
            if (winners.length === 1) {
              result = 'elected';
              winner = Number(winners[0][0]);
            } else {
              result = subPhase === 'sheriff_pk_voting' ? 'tie' : 'pk';
              pk_candidates = winners.map(x => Number(x[0]));
            }
          }
          
          finalHistory.push({ 
            day: updatedRoom.game_state.day_count, 
            phase: subPhase, 
            votes: votes, 
            result: result, 
            winner: winner,
            pk_candidates: pk_candidates
          });
          
          const roomWithHistory = applyUpdates(updatedRoom, { 'game_state.voting_history': finalHistory });
          return await nextPhase(eventRoomId, roomWithHistory, roomDocId);
        }
      }
      else if (ev.action === 'handover') { 
        if (roomDoc.game_state.sheriff_seat !== me.seat) return { success: false, message: '您不是警长' };
        await db.collection('game_rooms').doc(roomDocId).update({ data: { 'game_state.sheriff_seat': Number(ev.targetSeat) } }); 
        await nextPhase(eventRoomId, applyUpdates(roomDoc, { 'game_state.sheriff_seat': Number(ev.targetSeat) }), roomDocId); 
      }
      return { success: true };
    },
    hunterAction: async (ev) => {
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      if (!me || me.role !== 'hunter') return { success: false, message: '您不是猎人' };
      const pIdx = roomDoc.players.findIndex(x => x.role === 'hunter');
      if (pIdx === -1) return { success: false };
      const hunter = roomDoc.players[pIdx];
      // Basic check: is hunter allowed to shoot? (e.g. not poisoned)
      if (hunter.role_state.is_poisoned || hunter.role_state.hunter_status !== 'can_shoot') {
        return { success: false, message: '当前状态无法开枪' };
      }

      const targetSeat = ev.targetSeat ? Number(ev.targetSeat) : null;
      if (targetSeat) {
        await db.collection('game_rooms').doc(roomDocId).update({ 
          data: { 
            'current_round_actions.hunter_shoot': targetSeat,
            [`players.${pIdx}.role_state.hunter_shoot_used`]: true
          } 
        });
      }
      return await nextPhase(eventRoomId, roomDoc, roomDocId);
    },
    securityCheck: async (ev) => ({ success: true, isSafe: await checkContentSecurity(cloud, ev.content) }),
    enterRoom: async (ev) => {
      const { userInfo } = ev;
      const me = { openid: wxCtx.OPENID, nickname: userInfo.nickName, avatar_url: userInfo.avatarUrl, last_active: Date.now() };
      
      const res = await db.collection('game_rooms').where({ roomId: eventRoomId }).get();
      if (res.data.length === 0) return { success: false, message: '房间不存在' };
      const room = res.data[0];
      
      let visitors = room.visitors || [];
      const vIdx = visitors.findIndex(v => v.openid === wxCtx.OPENID);
      if (vIdx === -1) visitors.push(me);
      else visitors[vIdx] = me;

      // 清理超过 10 分钟未活跃的访客 (防止幽灵)
      const NOW = Date.now();
      visitors = visitors.filter(v => (NOW - (v.last_active || 0)) < 600000 || v.openid === wxCtx.OPENID);

      const up = { visitors, updated_at: new Date() };
      if (room.game_state.status === 'waiting') {
        const totalVisitors = visitors.length;
        const currentSeats = room.players.length;
        if (totalVisitors > currentSeats) {
          const newPlayers = [...room.players];
          for (let i = currentSeats; i < totalVisitors; i++) {
            newPlayers.push({ seat: i + 1, openid: "", nickname: `玩家${i + 1}`, avatar_url: "", is_alive: true, role: "unknown", role_state: {}, action_status: {} });
          }
          up.players = newPlayers;
          up['config.player_count'] = totalVisitors;
          if (!up.timeline) up.timeline = room.timeline || [];
          up.timeline.push({ day: 0, phase: 'setup', text: `系统: 检测到新玩家，已扩容至${totalVisitors}人局`, timestamp: new Date() });
        }
      }
      await db.collection('game_rooms').doc(room._id).update({ data: up });
      return { success: true };
    },
    leaveRoom: async () => {
      const res = await db.collection('game_rooms').where({ roomId: eventRoomId }).get();
      if (res.data.length > 0) {
        const room = res.data[0];
        const visitors = (room.visitors || []).filter(v => v.openid !== wxCtx.OPENID);
        const up = { visitors, updated_at: new Date() };

        if (room.game_state.status === 'waiting') {
          let players = room.players;
          const pIdx = players.findIndex(p => p.openid === wxCtx.OPENID);
          if (pIdx > -1) {
            players[pIdx].openid = "";
            players[pIdx].nickname = `玩家${players[pIdx].seat}`;
            players[pIdx].avatar_url = "";
          }
          const targetCount = Math.max(6, visitors.length);
          while (players.length > targetCount && !players[players.length - 1].openid) {
            players.pop();
          }
          up.players = players;
          up['config.player_count'] = players.length;
        }
        await db.collection('game_rooms').doc(room._id).update({ data: up });
      }
      return { success: true };
    },
    getGameRecords: async (ev) => { const res = await db.collection('game_records').where({ player_openids: wxCtx.OPENID }).orderBy('record_date', 'desc').skip((ev.page || 0) * (ev.pageSize || 10)).limit(ev.pageSize || 10).get(); return { success: true, records: res.data }; },
    cupidAction: async (ev) => {
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      if (!me || me.role !== 'cupid') return { success: false, message: '您不是丘比特' };
      if (!me.is_alive) return { success: false, message: '您已出局' };
      if (roomDoc.game_state.day_count > 1) return { success: false, message: '丘比特仅首夜行动' };
      const targetSeats = (ev.targetSeats || []).map(Number);
      if (targetSeats.length !== 2 || targetSeats[0] === targetSeats[1]) return { success: false, message: '必须选择两名不同玩家' };
      const allAlive = targetSeats.every(s => roomDoc.players.find(p => p.seat === s && p.is_alive));
      if (!allAlive) return { success: false, message: '目标已出局' };
      await db.collection('game_rooms').doc(roomDocId).update({ data: { 'game_state.lovers': targetSeats } });
      return { success: true };
    },
    magicianAction: async (ev) => {
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      if (!me || me.role !== 'magician') return { success: false, message: '您不是魔术师' };
      if (!me.is_alive) return { success: false, message: '您已出局' };
      const targetSeats = (ev.targetSeats || []).map(Number);
      if (targetSeats.length !== 2 || targetSeats[0] === targetSeats[1]) return { success: false, message: '必须选择两名不同玩家' };
      const allAlive = targetSeats.every(s => roomDoc.players.find(p => p.seat === s && p.is_alive));
      if (!allAlive) return { success: false, message: '目标已出局' };
      await db.collection('game_rooms').doc(roomDocId).update({ data: { 'current_round_actions.magician_exchange': targetSeats } });
      return { success: true };
    },
    dreamCatcherAction: async (ev) => {
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      if (!me || me.role !== 'dream_catcher') return { success: false, message: '您不是摄梦人' };
      if (!me.is_alive) return { success: false, message: '您已出局' };
      const targetSeat = Number(ev.targetSeat);
      const target = roomDoc.players.find(p => p.seat === targetSeat);
      if (!target || !target.is_alive) return { success: false, message: '目标已出局' };
      await db.collection('game_rooms').doc(roomDocId).update({ data: { 'current_round_actions.dream_catcher_sleep': targetSeat } });
      return { success: true };
    },
    wolfBeautyAction: async (ev) => {
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      if (!me || me.role !== 'wolf_beauty') return { success: false, message: '您不是狼美人' };
      if (!me.is_alive) return { success: false, message: '您已出局' };
      const targetSeat = Number(ev.targetSeat);
      const target = roomDoc.players.find(p => p.seat === targetSeat);
      if (!target || !target.is_alive) return { success: false, message: '目标已出局' };
      await db.collection('game_rooms').doc(roomDocId).update({ data: { 'current_round_actions.wolf_beauty_charm': targetSeat } });
      return { success: true };
    },
    gargoyleAction: async (ev) => {
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      if (!me || me.role !== 'gargoyle') return { success: false, message: '您不是石像鬼' };
      if (!me.is_alive) return { success: false, message: '您已出局' };
      const targetSeat = Number(ev.targetSeat);
      const targetPlayer = roomDoc.players.find(p => p.seat === targetSeat);
      if (!targetPlayer) return { success: false, message: '目标不存在' };
      const role = targetPlayer.role;
      // Record verification
      const history = (me.role_state.gargoyle_check_history || []);
      history.push({ day: roomDoc.game_state.day_count, seat: targetSeat, role });
      await db.collection('game_rooms').doc(roomDocId).update({ 
        data: { 
          'current_round_actions.gargoyle_check': targetSeat,
          [`players.${roomDoc.players.findIndex(p => p.openid === wxCtx.OPENID)}.role_state.gargoyle_check_history`]: history
        } 
      });
      return { success: true, role };
    },
    merchantAction: async (ev) => {
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      if (!me || me.role !== 'merchant') return { success: false, message: '您不是黑商' };
      if (!me.is_alive) return { success: false, message: '您已出局' };
      const targetSeat = Number(ev.targetSeat);
      const item = ev.item; // 'shroud', 'poison', 'lucky_card'
      const target = roomDoc.players.find(p => p.seat === targetSeat);
      if (!target || !target.is_alive) return { success: false, message: '目标已出局' };
      await db.collection('game_rooms').doc(roomDocId).update({ 
        data: { 
          'current_round_actions.merchant_trade': targetSeat, 
          'current_round_actions.merchant_item': item 
        } 
      });
      return { success: true };
    },
    silencerAction: async (ev) => {
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      if (!me || me.role !== 'silencer') return { success: false, message: '您不是禁言长老' };
      if (!me.is_alive) return { success: false, message: '您已出局' };
      const targetSeat = Number(ev.targetSeat);
      const target = roomDoc.players.find(p => p.seat === targetSeat);
      if (!target || !target.is_alive) return { success: false, message: '目标已出局' };
      await db.collection('game_rooms').doc(roomDocId).update({ data: { 'current_round_actions.silencer_silence': targetSeat } });
      return { success: true };
    },
    wildChildAction: async (ev) => {
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      if (!me || me.role !== 'wild_child') return { success: false, message: '您不是野孩子' };
      if (!me.is_alive) return { success: false, message: '您已出局' };
      if (roomDoc.game_state.day_count > 1) return { success: false, message: '野孩子仅首夜行动' };
      const targetSeat = Number(ev.targetSeat);
      const target = roomDoc.players.find(p => p.seat === targetSeat);
      if (!target || !target.is_alive) return { success: false, message: '目标已出局' };
      const meIdx = roomDoc.players.findIndex(p => p.openid === wxCtx.OPENID);
      await db.collection('game_rooms').doc(roomDocId).update({ 
        data: { [`players.${meIdx}.role_state.model_seat`]: targetSeat } 
      });
      return { success: true };
    },
    gravekeeperAction: async (ev) => {
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      if (!me || me.role !== 'gravekeeper') return { success: false, message: '您不是守墓人' };
      if (!me.is_alive) return { success: false, message: '您已出局' };

      const exiledSeat = roomDoc.game_state.last_exiled_seat;
      if (!exiledSeat) return { success: true, result: [] };
      const p = roomDoc.players.find(pl => pl.seat === exiledSeat);
      const role = p ? p.role : 'unknown';
      const camp = (role && WOLF_ROLES.includes(role)) || p?.role_state?.is_wolf_side ? 'wolf' : 'good';
      const result = [{ seat: exiledSeat, role, camp }];
      await db.collection('game_rooms').doc(roomDocId).update({ data: { 'current_round_actions.gravekeeper_result': result } });
      return { success: true, result };
    },
    checkRunningGame: async () => {
      const res = await db.collection('game_rooms').where(_.or([{ 'players.openid': wxCtx.OPENID }, { '_openid': wxCtx.OPENID }])).where({ 'game_state.status': _.neq('finished') }).orderBy('updated_at', 'desc').get();
      const EXPIRE_MS = 24 * 60 * 60 * 1000; 
      for (const room of res.data) { 
        // Double check room still exists in a valid state
        if (Date.now() - new Date(room.updated_at).getTime() > EXPIRE_MS) {
          await db.collection('game_rooms').doc(room._id).remove(); 
        } else {
          // Additional check: Ensure the player is actually still in the players list if they aren't the creator
          const isCreator = room._openid === wxCtx.OPENID;
          const isInSeat = room.players.some(p => p.openid === wxCtx.OPENID);
          if (isCreator || isInSeat) {
            return { success: true, roomId: room.roomId }; 
          }
        }
      }
      return { success: false };
    },
    deleteRoom: async () => { if (roomDoc._openid !== wxCtx.OPENID) return { success: false, message: "无权解散" }; await db.collection('game_rooms').doc(roomDocId).remove(); return { success: true }; },
    resetRoom: async () => {
      const resetP = roomDoc.players.map(p => p.openid ? { seat: p.seat, openid: p.openid, nickname: p.nickname, avatar_url: p.avatar_url, is_alive: true, role: "unknown", role_state: { witch_poison_used: false, witch_save_used: false, hunter_shoot_used: false, guard_last_protected_seat: null }, action_status: { is_ready: false } } : p);
      await db.collection('game_rooms').doc(roomDocId).update({ data: { game_state: { status: "waiting", day_count: 0, phase: "setup", sub_phase: "ready", sheriff_seat: null, sheriff_candidate_seats: [], lovers: [], last_night_deaths: [], last_revealed_deaths: [], last_dream_catcher_target: null, deaths_announced: true, voting_history: [] }, players: resetP, current_round_actions: getInitialActions(), timeline: [] } }); return { success: true };
    },
    quitGame: async (ev) => { 
      if (ev.abandon && roomDoc._openid === wxCtx.OPENID) {
        await db.collection('game_rooms').doc(roomDocId).remove(); 
      } else { 
        let p = roomDoc.players; 
        const idx = p.findIndex(x => x.openid === wxCtx.OPENID); 
        if (idx > -1) { 
          p[idx].openid = ""; p[idx].nickname = `玩家${p[idx].seat}`; p[idx].avatar_url = ""; 
          
          // 自动缩减逻辑
          if (roomDoc.game_state.status === 'waiting') {
            const visitorsCount = (roomDoc.visitors || []).length;
            while (p.length > 6 && p.length > visitorsCount && !p[p.length - 1].openid) {
              p.pop();
            }
          }
          await db.collection('game_rooms').doc(roomDocId).update({ data: { players: p, 'config.player_count': p.length } }); 
        } 
      } 
      return { success: true }; 
    },
    getAudioQueue: async (ev) => ({ success: true, keys: getAudioQueue(ev.gameState, ev.lastGameState) }),
    transferOwner: async (ev) => {
      if (roomDoc._openid !== wxCtx.OPENID) return { success: false, message: "无权转移" };
      const targetOpenid = ev.targetOpenid;
      if (!targetOpenid) return { success: false, message: "目标玩家不存在" };
      await db.collection('game_rooms').doc(roomDocId).update({ data: { _openid: targetOpenid, updated_at: new Date() } });
      return { success: true };
    },
    getUserStats: async (ev) => {
      const openid = wxCtx.OPENID; const countRes = await db.collection('game_records').where({ player_openids: openid }).count();
      if (countRes.total === 0) return { success: true, stats: { total: 0, wins: 0, winRate: '0%' } };
      const res = await db.collection('game_records').where({ player_openids: openid }).field({ winner: true, players: true, record_date: true }).orderBy('record_date', 'desc').limit(100).get();
      let wins = 0; let validGames = 0; res.data.forEach(rec => { const me = rec.players.find(p => p.openid === openid); if (me) { validGames++; if (rec.winner === 'good' && !['werewolf', 'wolf_beauty', 'gargoyle', 'wild_child'].includes(me.role)) wins++; else if (rec.winner === 'werewolf' && ['werewolf', 'wolf_beauty', 'gargoyle'].includes(me.role)) wins++; } });
      return { success: true, stats: { total: countRes.total, wins, winRate: `${validGames > 0 ? Math.round((wins / validGames) * 100) : 0}%` }, recentRecord: res.data.length > 0 ? res.data[0] : null };
    }
  };

  if (acts[type]) return await acts[type](event);
  return { success: false, message: `Unknown type: ${type}` };
};
