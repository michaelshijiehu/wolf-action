const { flowConfig } = require('../constants');
const { applyUpdates, doSaveRecord, checkWinner } = require('../utils');
const { getInitialActions } = require('../state');

// ==========================================
// 1. Core State Machine (THE ONLY ENTRY FOR PHASE TRANSITIONS)
// ==========================================

const nextPhase = async (db, roomId, roomDoc, roomDocId) => {
  const gs = roomDoc.game_state;
  const lock = gs.transition_lock;
  if (lock && lock.at) {
    const lockTime = new Date(lock.at).getTime();
    if (!Number.isNaN(lockTime) && (Date.now() - lockTime) < 1200) return roomDoc;
  }
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
  const startNightCycle = () => {
    updates['game_state.phase'] = 'night';
    updates['game_state.day_count'] = gs.day_count + 1;
    updates['current_round_actions'] = getInitialActions();
    updates['game_state.last_night_deaths'] = [];
    setInst('night_start');
  };
  const historyMatches = (phaseKey, votesObj) => {
    const history = gs.voting_history || [];
    if (history.length === 0) return false;
    const last = history[history.length - 1];
    if (!last || last.phase !== phaseKey) return false;
    try {
      return JSON.stringify(last.votes || {}) === JSON.stringify(votesObj || {});
    } catch (e) {
      return false;
    }
  };

  // --- LOGIC ENGINE SWITCH ---
  const handlers = {
    game_welcome: () => setInst('deal_cards'),
    deal_cards: () => { updates['game_state.phase'] = 'night'; setInst('night_start'); },
    night_start: () => {
      const nextSub = findNextState('night_start');
      if (nextSub) setInst(nextSub); else setInst('calculate_death');
    },
    calculate_death: () => {
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
    },
    day_announce: () => {
      if (gs.day_count === 1 && !gs.sheriff_seat && roomDoc.config.roles.sheriff !== 0) { updates['game_state.phase'] = 'sheriff_election'; setInst('sheriff_nomination'); }
      else { updates['game_state.phase'] = 'day_process'; setInst('day_dawn'); }
    },
    sheriff_nomination: () => {
      const cands = gs.sheriff_candidate_seats || [];
      if (cands.length === 0) { updates['game_state.phase'] = 'day_process'; updates['game_state.sheriff_candidate_seats'] = []; setInst('day_dawn'); }
      else if (cands.length === 1) { updates['game_state.sheriff_seat'] = cands[0]; updates['game_state.election_result'] = 'elected'; setInst('election_announce'); }
      else setInst('sheriff_speech', cands.length * 20);
    },
    sheriff_speech: () => setInst('sheriff_voting'),
    sheriff_voting: () => {
      const deadSeats = (gs.last_night_deaths || []).map(d => d.seat);
      const counts = {};
      const sheriffVotes = roomDoc.current_round_actions.sheriff_votes || {};
      Object.entries(sheriffVotes).forEach(([v, t]) => {
        const voterSeat = Number(v);
        const voter = roomDoc.players.find(p => p.seat === voterSeat);
        if (!voter || !voter.is_alive || voter.death_reason) return;
        if (roomDoc.current_round_actions?.silencer_silence === voterSeat) return;
        if (t > 0 && !deadSeats.includes(voterSeat)) {
          counts[t] = (counts[t] || 0) + 1;
        }
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const history = [...(gs.voting_history || [])];
      const historyPhase = 'sheriff_election';
      const canAppendHistory = !historyMatches(historyPhase, sheriffVotes);
      const pushHistory = (entry) => { if (canAppendHistory) history.push(entry); };
      if (sorted.length > 0) {
        const max = sorted[0][1]; const winners = sorted.filter(x => x[1] === max);
        if (winners.length === 1) {
          log(`警长当选: ${winners[0][0]}号`);
          updates['game_state.sheriff_seat'] = Number(winners[0][0]);
          updates['game_state.election_result'] = 'elected';
          pushHistory({ day: gs.day_count, phase: historyPhase, votes: sheriffVotes, result: 'elected', winner: Number(winners[0][0]) });
          setInst('election_announce');
        } else {
          updates['game_state.pk_candidates'] = winners.map(x => Number(x[0]));
          updates['game_state.sheriff_candidate_seats'] = winners.map(x => Number(x[0]));
          pushHistory({ day: gs.day_count, phase: historyPhase, votes: sheriffVotes, result: 'pk', pk_candidates: winners.map(x => Number(x[0])) });
          setInst('sheriff_pk_speech');
        }
      } else {
        log(`无人投票，本届警长选举流失`);
        updates['game_state.phase'] = 'day_process';
        updates['game_state.sheriff_candidate_seats'] = [];
        updates['game_state.election_result'] = 'failed';
        pushHistory({ day: gs.day_count, phase: historyPhase, votes: sheriffVotes, result: 'failed' });
        setInst('day_dawn');
      }
      updates['game_state.voting_history'] = history;
    },
    sheriff_pk_voting: () => {
      const deadSeats = (gs.last_night_deaths || []).map(d => d.seat);
      const counts = {};
      const sheriffVotes = roomDoc.current_round_actions.sheriff_votes || {};
      Object.entries(sheriffVotes).forEach(([v, t]) => {
        const voterSeat = Number(v);
        const voter = roomDoc.players.find(p => p.seat === voterSeat);
        if (!voter || !voter.is_alive || voter.death_reason) return;
        if (roomDoc.current_round_actions?.silencer_silence === voterSeat) return;
        if (t > 0 && !deadSeats.includes(voterSeat)) {
          counts[t] = (counts[t] || 0) + 1;
        }
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const history = [...(gs.voting_history || [])];
      const historyPhase = 'sheriff_pk_voting';
      const canAppendHistory = !historyMatches(historyPhase, sheriffVotes);
      const pushHistory = (entry) => { if (canAppendHistory) history.push(entry); };
      if (sorted.length > 0) {
        const max = sorted[0][1]; const winners = sorted.filter(x => x[1] === max);
        if (winners.length === 1) {
          log(`警长PK当选: ${winners[0][0]}号`);
          updates['game_state.sheriff_seat'] = Number(winners[0][0]);
          updates['game_state.election_result'] = 'elected';
          pushHistory({ day: gs.day_count, phase: historyPhase, votes: sheriffVotes, result: 'elected', winner: Number(winners[0][0]) });
          setInst('election_announce');
        } else {
          log(`警长PK再次平票，警徽流失`);
          updates['game_state.election_result'] = 'tie';
          pushHistory({ day: gs.day_count, phase: historyPhase, votes: sheriffVotes, result: 'tie' });
          setInst('election_announce');
        }
      } else {
        log(`无人投票，警徽流失`);
        updates['game_state.election_result'] = 'failed';
        pushHistory({ day: gs.day_count, phase: historyPhase, votes: sheriffVotes, result: 'failed' });
        setInst('election_announce');
      }
      updates['game_state.voting_history'] = history;
    },
    election_announce: () => {
      updates['game_state.sheriff_candidate_seats'] = [];
      updates['game_state.phase'] = 'day_process';
      setInst('day_dawn');
    },
    day_dawn: () => {
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
    },
    discussion: () => { updates['game_state.phase'] = 'day_voting'; updates['current_round_actions.day_votes'] = {}; setInst('voting'); },
    voting: () => {
      const counts = {};
      const dayVotes = roomDoc.current_round_actions.day_votes || {};
      Object.entries(dayVotes).forEach(([v, t]) => {
        if (t === 0) return;
        const voterSeat = Number(v);
        const voter = roomDoc.players.find(p => p.seat === voterSeat);
        if (!voter || !voter.is_alive || voter.death_reason) return;
        if (roomDoc.current_round_actions?.silencer_silence === voterSeat) return;
        const weight = (voterSeat === gs.sheriff_seat) ? 1.5 : 1;
        counts[t] = (counts[t] || 0) + weight;
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const history = [...(gs.voting_history || [])];
      const historyPhase = gs.sub_phase;
      const canAppendHistory = !historyMatches(historyPhase, dayVotes);
      const pushHistory = (entry) => { if (canAppendHistory) history.push(entry); };
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
            pushHistory({ day: gs.day_count, phase: historyPhase, votes: dayVotes, result: 'idiot_reveal', target: out });
            setInst('exile_announce');
          }
          else if (pIdx > -1 && targetPlayer.is_alive) {
            updates['game_state.last_exiled_seat'] = out; updates['game_state.exile_result'] = 'out'; updates['game_state.exile_seat'] = out;
            log(`${out}号 被投票放逐`);
            pushHistory({ day: gs.day_count, phase: historyPhase, votes: dayVotes, result: 'out', target: out });
            setInst('exile_announce');
          } else {
            updates['game_state.exile_result'] = 'tie';
            log(`票人目标已不在场，无人出局`);
            pushHistory({ day: gs.day_count, phase: historyPhase, votes: dayVotes, result: 'tie' });
            setInst('exile_announce');
          }
        } else {
          updates['game_state.pk_candidates'] = winners.map(x => Number(x[0]));
          log(`平票，进入PK发言`);
          pushHistory({ day: gs.day_count, phase: historyPhase, votes: dayVotes, result: 'pk', pk_candidates: winners.map(x => Number(x[0])) });
          setInst('day_pk');
        }
      } else {
        updates['game_state.exile_result'] = 'tie';
        log(`无人投票，平安日`);
        pushHistory({ day: gs.day_count, phase: historyPhase, votes: dayVotes, result: 'tie' });
        setInst('exile_announce');
      }
      updates['game_state.voting_history'] = history;
    },
    pk_voting: () => {
      const counts = {};
      const dayVotes = roomDoc.current_round_actions.day_votes || {};
      Object.entries(dayVotes).forEach(([v, t]) => {
        if (t === 0) return;
        const voterSeat = Number(v);
        const voter = roomDoc.players.find(p => p.seat === voterSeat);
        if (!voter || !voter.is_alive || voter.death_reason) return;
        if (roomDoc.current_round_actions?.silencer_silence === voterSeat) return;
        const weight = (voterSeat === gs.sheriff_seat) ? 1.5 : 1;
        counts[t] = (counts[t] || 0) + weight;
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const history = [...(gs.voting_history || [])];
      const historyPhase = gs.sub_phase;
      const canAppendHistory = !historyMatches(historyPhase, dayVotes);
      const pushHistory = (entry) => { if (canAppendHistory) history.push(entry); };
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
            pushHistory({ day: gs.day_count, phase: historyPhase, votes: dayVotes, result: 'idiot_reveal', target: out });
            setInst('exile_announce');
          }
          else if (pIdx > -1 && targetPlayer.is_alive) {
            updates['game_state.last_exiled_seat'] = out; updates['game_state.exile_result'] = 'out'; updates['game_state.exile_seat'] = out;
            log(`${out}号 被投票放逐`);
            pushHistory({ day: gs.day_count, phase: historyPhase, votes: dayVotes, result: 'out', target: out });
            setInst('exile_announce');
          } else {
            updates['game_state.exile_result'] = 'tie';
            log(`票人目标已不在场，无人出局`);
            pushHistory({ day: gs.day_count, phase: historyPhase, votes: dayVotes, result: 'tie' });
            setInst('exile_announce');
          }
        } else {
          updates['game_state.exile_result'] = 'tie';
          log(`PK再次平票，本轮无人出局`);
          pushHistory({ day: gs.day_count, phase: historyPhase, votes: dayVotes, result: 'tie' });
          setInst('exile_announce');
        }
      } else {
        updates['game_state.exile_result'] = 'tie';
        log(`无人投票，平安日`);
        pushHistory({ day: gs.day_count, phase: historyPhase, votes: dayVotes, result: 'tie' });
        setInst('exile_announce');
      }
      updates['game_state.voting_history'] = history;
    },
    exile_announce: () => {
      if (gs.exile_result === 'out') updates['game_state.is_day_ending'] = true;
      if (gs.exile_result === 'idiot_reveal' || gs.exile_result === 'tie') { startNightCycle(); }
      else setInst('leave_speech');
    },
    leave_speech: () => {
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
      else { startNightCycle(); }
    },
    sheriff_handover: () => {
      if (gs.is_day_ending) { startNightCycle(); }
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
          // Dream catcher link: if dream catcher dies, dreamer dies
          if (roomDoc.players[idx].role === 'dream_catcher' && gs.last_dream_catcher_target) {
            const dreamIdx = roomDoc.players.findIndex(p => p.seat === gs.last_dream_catcher_target);
            if (dreamIdx > -1 && roomDoc.players[dreamIdx].is_alive) {
              updates[`players.${dreamIdx}.is_alive`] = false;
              updates[`players.${dreamIdx}.death_reason`] = 'dream_catcher_link';
              log(`${gs.last_dream_catcher_target}号 受摄梦牵连出局`);
            }
          }
          if (gs.sheriff_seat == shootTarget) { updates['game_state.phase'] = 'day_process'; setInst('sheriff_handover'); return; }
        }
      }
      if (gs.is_day_ending) { startNightCycle(); }
      else setInst('discussion', discussionTime);
    },
    day_pk: () => setInst('pk_voting', 15),
    sheriff_pk_speech: () => setInst('sheriff_pk_voting', 15)
  };

  const handler = handlers[gs.sub_phase];
  if (handler) {
    handler();
  } else {
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
  updates['game_state.phase_version'] = (gs.phase_version || 0) + 1;
  updates['game_state.last_transition_at'] = new Date();
  updates['game_state.transition_lock'] = { at: new Date() };

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
}

const checkAutoProceedInternal = async (db, roomId, roomDoc, roomDocId) => {
  if (!roomDoc || roomDoc.game_state.status !== 'playing') return roomDoc;
  const gs = roomDoc.game_state; const inst = gs.current_instruction;
  if (inst && inst.auto_proceed && gs.stage_deadline) {
    const now = Date.now(); if (now >= (gs.stage_deadline - 500)) return await nextPhase(db, roomId, roomDoc, roomDocId);
  }
  return roomDoc;
}

module.exports = { nextPhase, checkAutoProceedInternal };
