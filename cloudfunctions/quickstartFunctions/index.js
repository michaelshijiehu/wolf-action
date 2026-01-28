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
    updates['game_state.sub_phase'] = key;
    updates['game_state.current_instruction'] = { 
      sub_phase: key, expire_time: Date.now() + dur * 1000, duration: dur, 
      audio: cfg.getAudio ? cfg.getAudio(gs) : [], roleRequired: cfg.roleRequired || null, 
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
      const isWakeSleepPhase = nextSub.endsWith('_wake') || nextSub.endsWith('_sleep') || nextSub.endsWith('_confirm');
      if (cfg.roleRequired) {
        const roleCount = roomDoc.config.roles[cfg.roleRequired] || 0;
        if (roleCount === 0) shouldSkip = true;
        else if (cfg.checkAlive && !isWakeSleepPhase) {
          const aliveRole = roomDoc.players.find(p => p.role === cfg.roleRequired && p.is_alive && !p.death_reason); 
          if (!aliveRole) shouldSkip = true;
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
  const discussionTime = Math.max(60, aliveCount * 20);

  if (gs.sub_phase === 'game_welcome') setInst('deal_cards');
  else if (gs.sub_phase === 'deal_cards') { updates['game_state.phase'] = 'night'; setInst('night_start'); }
  else if (gs.sub_phase === 'night_start') {
    const nextSub = findNextState('night_start');
    if (nextSub) setInst(nextSub); else setInst('calculate_death');
  }
  else if (gs.sub_phase === 'calculate_death') {
    const cur = roomDoc.current_round_actions || {};
    const players = [...roomDoc.players]; let deaths = [];
    const wolfKill = Object.values(cur.werewolf_votes || {})[0];
    const witchSave = cur.witch_action?.save ? wolfKill : null;
    const witchPoison = cur.witch_action?.poison_target;
    const guardProtect = cur.guard_protect;

    if (wolfKill && players.find(p => p.seat === wolfKill)?.is_alive) {
      if (wolfKill === witchSave && wolfKill === guardProtect) deaths.push({ seat: wolfKill, reason: 'milk_guard_clash' });
      else if (wolfKill !== witchSave && wolfKill !== guardProtect) deaths.push({ seat: wolfKill, reason: 'werewolf_kill' });
    }
    if (witchPoison && players.find(p => p.seat === witchPoison)?.is_alive) deaths.push({ seat: witchPoison, reason: 'witch_poison' });

    const lovers = gs.lovers || [];
    if (lovers.length === 2) {
      const deadSeats = deaths.map(d => d.seat);
      lovers.forEach(seat => {
        if (deadSeats.includes(seat)) {
          const other = lovers.find(s => s !== seat);
          if (players.find(p => p.seat === other)?.is_alive && !deaths.some(d => d.seat === other)) deaths.push({ seat: other, reason: 'lover' });
        }
      });
    }

    deaths.forEach(d => { const idx = players.findIndex(p => p.seat === d.seat); if (idx > -1) { players[idx].is_alive = false; players[idx].death_reason = d.reason; } });
    if (deaths.length === 0) log('昨晚是平安夜'); else log(`昨晚，${deaths.map(d => d.seat + '号').join(', ')} 倒在了血泊中`);

    updates['players'] = players;
    updates['game_state.last_night_deaths'] = deaths;
    setInst('day_announce');
  }
  else if (gs.sub_phase === 'day_announce') {
    if (gs.day_count === 1 && !gs.sheriff_seat && roomDoc.config.roles.sheriff !== 0) { updates['game_state.phase'] = 'sheriff_election'; setInst('sheriff_nomination'); }
    else { updates['game_state.phase'] = 'day_process'; setInst('day_dawn'); }
  }
  else if (gs.sub_phase === 'sheriff_nomination') {
    const cands = gs.sheriff_candidate_seats || [];
    if (cands.length === 0) { updates['game_state.phase'] = 'day_process'; setInst('day_dawn'); }
    else if (cands.length === 1) { updates['game_state.sheriff_seat'] = cands[0]; updates['game_state.election_result'] = 'elected'; setInst('election_announce'); }
    else setInst('sheriff_speech', cands.length * 20);
  }
  else if (gs.sub_phase === 'sheriff_speech') setInst('sheriff_voting');
  else if (gs.sub_phase === 'sheriff_voting') {
    const counts = {}; Object.entries(roomDoc.current_round_actions.sheriff_votes || {}).forEach(([v, t]) => { if(t > 0) counts[t] = (counts[t] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const max = sorted[0][1]; const winners = sorted.filter(x => x[1] === max);
      if (winners.length === 1) { log(`警长当选: ${winners[0][0]}号`); updates['game_state.sheriff_seat'] = Number(winners[0][0]); updates['game_state.election_result'] = 'elected'; setInst('election_announce'); }
      else { updates['game_state.pk_candidates'] = winners.map(x => Number(x[0])); setInst('sheriff_pk_speech'); }
    } else { updates['game_state.phase'] = 'day_process'; setInst('day_dawn'); }
  }
  else if (gs.sub_phase === 'day_dawn') {
    const deaths = gs.last_night_deaths || []; const deadSheriff = deaths.find(d => d.seat === gs.sheriff_seat);
    const deadHunter = deaths.find(d => { const p = roomDoc.players.find(x => x.seat === d.seat); return p && p.role === 'hunter' && d.reason !== 'witch_poison'; });
    if (deadSheriff) setInst('sheriff_handover'); else if (deadHunter) setInst('hunter_action');
    else { updates['game_state.phase'] = 'day_discussion'; setInst('discussion', discussionTime); }
  }
  else if (gs.sub_phase === 'discussion') { updates['game_state.phase'] = 'day_voting'; updates['current_round_actions.day_votes'] = {}; setInst('voting'); }
  else if (gs.sub_phase === 'voting' || gs.sub_phase === 'pk_voting') {
    const counts = {}; Object.entries(roomDoc.current_round_actions.day_votes || {}).forEach(([v, t]) => { if (t === 0) return; const weight = (Number(v) === gs.sheriff_seat) ? 1.5 : 1; counts[t] = (counts[t] || 0) + weight; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const max = sorted[0][1]; const winners = sorted.filter(x => x[1] === max);
      if (winners.length === 1) {
        const out = Number(winners[0][0]); const pIdx = roomDoc.players.findIndex(pl => pl.seat === out);
        if (pIdx > -1 && roomDoc.players[pIdx].role === 'idiot' && !roomDoc.players[pIdx].role_state.idiot_revealed) { updates[`players.${pIdx}.role_state.idiot_revealed`] = true; updates['game_state.exile_result'] = 'idiot_reveal'; updates['game_state.exile_seat'] = out; setInst('exile_announce'); }
        else if (pIdx > -1) {
          const players = [...roomDoc.players]; players[pIdx].is_alive = false; players[pIdx].death_reason = 'vote';
          const lovers = gs.lovers || []; if (lovers.includes(out)) { const other = lovers.find(s => s !== out); const oIdx = players.findIndex(pl => pl.seat === other); if (oIdx > -1 && players[oIdx].is_alive) { players[oIdx].is_alive = false; players[oIdx].death_reason = 'lover'; } }
          updates['players'] = players; updates['game_state.last_exiled_seat'] = out; updates['game_state.exile_result'] = 'out'; updates['game_state.exile_seat'] = out; setInst('exile_announce');
        }
      } else { if (gs.sub_phase === 'pk_voting') { updates['game_state.exile_result'] = 'tie'; setInst('exile_announce'); } else { updates['game_state.pk_candidates'] = winners.map(x => Number(x[0])); setInst('day_pk'); } }
    } else { updates['game_state.exile_result'] = 'tie'; setInst('exile_announce'); }
  }
  else if (gs.sub_phase === 'exile_announce') {
    if (gs.exile_result === 'idiot_reveal' || gs.exile_result === 'tie') { updates['game_state.phase'] = 'night'; updates['game_state.day_count'] = gs.day_count + 1; updates['current_round_actions'] = getInitialActions(); updates['game_state.last_night_deaths'] = []; setInst('night_start'); }
    else setInst('leave_speech');
  }
  else if (gs.sub_phase === 'leave_speech') {
    const out = gs.last_exiled_seat; const p = roomDoc.players.find(x => x.seat === out);
    if (gs.sheriff_seat === out) { updates['game_state.phase'] = 'day_process'; setInst('sheriff_handover'); }
    else if (p && p.role === 'hunter' && p.role_state.hunter_status === 'can_shoot') { updates['game_state.phase'] = 'day_process'; setInst('hunter_action'); }
    else { updates['game_state.phase'] = 'night'; updates['game_state.day_count'] = gs.day_count + 1; updates['current_round_actions'] = getInitialActions(); updates['game_state.last_night_deaths'] = []; setInst('night_start'); }
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
  if (winResult) { updates['game_state.status'] = 'finished'; updates['game_state.winner'] = winResult.winner; updates['game_state.current_instruction'] = { sub_phase: 'game_over', duration: 0, audio: ['GAME_OVER'], title: '🏆 游戏结束', tips: winResult.winner === 'good' ? '好人阵营获胜' : '狼人阵营获胜', actionPanel: 'none', auto_proceed: false }; }

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
      roomDoc = await checkAutoProceedInternal(eventRoomId, roomDoc, roomDocId);
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
    startGame: async (ev) => {
      const res = await db.collection('game_rooms').where({ roomId: eventRoomId }).get();
      const room = res.data[0]; const players = room.players; const real = players.filter(p => p.openid); const roles = ev.config.roles;
      let pool = []; for (const [role, count] of Object.entries(roles)) for (let i = 0; i < count; i++) pool.push(role);
      pool = pool.slice(0, real.length).sort(() => Math.random() - 0.5); let pi = 0;
      players.forEach(p => { if (p.openid) { p.role = pool[pi++]; p.is_alive = true; p.death_reason = null; p.role_state = { witch_poison_used: false, witch_save_used: false, hunter_shoot_used: false, hunter_status: 'can_shoot', guard_last_protected_seat: null, idiot_revealed: false, model_seat: null, knight_ability_used: false, merchant_item: null, silencer_last_silenced: null, magician_exchanged: [], dream_catcher_target: null, wolf_beauty_target: null, gargoyle_check_history: [] }; } });
      const inst = flowConfig['game_welcome']; const dur = inst.duration || 10;
      const initialGameState = { status: 'playing', start_time: new Date(), day_count: 1, phase: 'day', sub_phase: 'game_welcome', sheriff_seat: null, lovers: [], deaths_announced: true, current_instruction: { sub_phase: 'game_welcome', expire_time: Date.now() + dur * 1000, duration: dur, audio: inst.getAudio ? inst.getAudio() : ['WELCOME'], title: inst.ui.title, tips: inst.ui.tips, color: inst.ui.color, actionPanel: inst.ui.actionPanel || 'none', brightness: inst.ui.brightness || 1.0, auto_proceed: true }, stage_deadline: Date.now() + (dur * 1000), voting_history: [], last_night_deaths: [] };
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
    runBotCycle: async (event) => { await simulateBotActions(db, roomDoc, roomDocId); return { success: true }; },
    werewolfAction: async (ev) => { await db.collection('game_rooms').doc(roomDocId).update({ data: { [`current_round_actions.werewolf_votes.${wxCtx.OPENID}`]: Number(ev.targetSeat) } }); return { success: true }; },
    witchAction: async (ev) => {
      const pIdx = roomDoc.players.findIndex(x => x.role === 'witch'); const up = {};
      if (ev.actionType === 'save') { up['current_round_actions.witch_action.save'] = true; up[`players.${pIdx}.role_state.witch_save_used`] = true; }
      else if (ev.actionType === 'poison') { up['current_round_actions.witch_action.poison_target'] = Number(ev.targetSeat); up[`players.${pIdx}.role_state.witch_poison_used`] = true; }
      await db.collection('game_rooms').doc(roomDocId).update({ data: up }); return { success: true };
    },
    seerAction: async (ev) => {
      const targetSeat = Number(ev.targetSeat); const target = roomDoc.players.find(pl => pl.seat == targetSeat); const isBad = ['werewolf', 'wolf_beauty', 'gargoyle'].includes(target.role);
      const seerIdx = roomDoc.players.findIndex(p => p.role === 'seer'); const history = (roomDoc.players[seerIdx].role_state.check_history || []); history.push({ day: roomDoc.game_state.day_count, seat: targetSeat, isBad });
      await db.collection('game_rooms').doc(roomDocId).update({ data: { 'current_round_actions.seer_check': { target: targetSeat, isBad }, [`players.${seerIdx}.role_state.check_history`]: history } });
      return { success: true, isBad };
    },
    guardAction: async (ev) => {
      const pIdx = roomDoc.players.findIndex(x => x.role === 'guard');
      if (pIdx > -1) await db.collection('game_rooms').doc(roomDocId).update({ data: { 'current_round_actions.guard_protect': Number(ev.targetSeat), [`players.${pIdx}.role_state.guard_last_protected_seat`]: Number(ev.targetSeat) } });
      return { success: true };
    },
    voteAction: async (ev) => { const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID); await db.collection('game_rooms').doc(roomDocId).update({ data: { [`current_round_actions.day_votes.${me.seat}`]: Number(ev.targetSeat) } }); return { success: true }; },
    wolfExplode: async () => {
      const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID);
      if (me && me.role === 'werewolf') {
        const players = [...roomDoc.players]; const pIdx = players.findIndex(p => p.seat === me.seat); players[pIdx].is_alive = false; players[pIdx].death_reason = 'explode';
        await db.collection('game_rooms').doc(roomDocId).update({ data: { players, 'game_state.phase': 'night', 'game_state.sub_phase': 'night_start', 'game_state.day_count': roomDoc.game_state.day_count + 1, 'current_round_actions': getInitialActions(), timeline: [...(roomDoc.timeline || []), { day: roomDoc.game_state.day_count, phase: roomDoc.game_state.phase, text: `${me.seat}号 狼人自爆`, timestamp: new Date() }] } });
        return { success: true };
      } return { success: false };
    },
    sheriffAction: async (ev) => {
      if (ev.action === 'join') { let c = roomDoc.game_state.sheriff_candidate_seats || []; if (ev.isJoining) { if (!c.includes(ev.seat)) c.push(ev.seat); } else { c = c.filter(s => s !== ev.seat); } await db.collection('game_rooms').doc(roomDocId).update({ data: { 'game_state.sheriff_candidate_seats': c } }); }
      else if (ev.action === 'vote') { const me = roomDoc.players.find(p => p.openid === wxCtx.OPENID); await db.collection('game_rooms').doc(roomDocId).update({ data: { [`current_round_actions.sheriff_votes.${me.seat}`]: Number(ev.targetSeat) } }); }
      else if (ev.action === 'handover') { await db.collection('game_rooms').doc(roomDocId).update({ data: { 'game_state.sheriff_seat': Number(ev.targetSeat) } }); await nextPhase(eventRoomId, applyUpdates(roomDoc, { 'game_state.sheriff_seat': Number(ev.targetSeat) }), roomDocId); }
      return { success: true };
    },
    securityCheck: async (ev) => ({ success: true, isSafe: await checkContentSecurity(cloud, ev.content) }),
    getGameRecords: async (ev) => { const res = await db.collection('game_records').where({ player_openids: wxCtx.OPENID }).orderBy('record_date', 'desc').skip((ev.page || 0) * (ev.pageSize || 10)).limit(ev.pageSize || 10).get(); return { success: true, records: res.data }; },
    checkRunningGame: async () => {
      const res = await db.collection('game_rooms').where(_.or([{ 'players.openid': wxCtx.OPENID }, { '_openid': wxCtx.OPENID }])).where({ 'game_state.status': _.neq('finished') }).orderBy('updated_at', 'desc').get();
      const EXPIRE_MS = 24 * 60 * 60 * 1000; for (const room of res.data) { if (Date.now() - new Date(room.updated_at).getTime() > EXPIRE_MS) await db.collection('game_rooms').doc(room._id).remove(); else return { success: true, roomId: room.roomId }; }
      return { success: false };
    },
    deleteRoom: async () => { if (roomDoc._openid !== wxCtx.OPENID) return { success: false, message: "无权解散" }; await db.collection('game_rooms').doc(roomDocId).remove(); return { success: true }; },
    resetRoom: async () => {
      const resetP = roomDoc.players.map(p => p.openid ? { seat: p.seat, openid: p.openid, nickname: p.nickname, avatar_url: p.avatar_url, is_alive: true, role: "unknown", role_state: { witch_poison_used: false, witch_save_used: false, hunter_shoot_used: false, guard_last_protected_seat: null }, action_status: { is_ready: false } } : p);
      await db.collection('game_rooms').doc(roomDocId).update({ data: { game_state: { status: "waiting", day_count: 0, phase: "setup", sub_phase: "ready", lovers: [], last_night_deaths: [], deaths_announced: true, voting_history: [] }, players: resetP, current_round_actions: getInitialActions(), timeline: [] } }); return { success: true };
    },
    quitGame: async (ev) => { if (ev.abandon && roomDoc._openid === wxCtx.OPENID) await db.collection('game_rooms').doc(roomDocId).remove(); else { const p = roomDoc.players; const idx = p.findIndex(x => x.openid === wxCtx.OPENID); if (idx > -1) { p[idx].openid = ""; p[idx].nickname = `玩家${p[idx].seat}`; p[idx].avatar_url = ""; await db.collection('game_rooms').doc(roomDocId).update({ data: { players: p } }); } } return { success: true }; },
    getAudioQueue: async (ev) => ({ success: true, keys: getAudioQueue(ev.gameState, ev.lastGameState) }),
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
