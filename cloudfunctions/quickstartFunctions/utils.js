const { AUDIO_KEYS, flowConfig } = require('./constants');

function applyUpdates(obj, updates) {
  const newObj = JSON.parse(JSON.stringify(obj));
  for (const [key, value] of Object.entries(updates)) {
    const parts = key.split('.');
    let current = newObj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) current[parts[i]] = (isNaN(parts[i + 1]) ? {} : []);
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }
  return newObj;
}

async function doSaveRecord(db, roomId, finalRoomData) {
  console.log(`[DEBUG] Attempting to save record for room: ${roomId}`);
  try {
    const { _id, created_at, config, game_state, players, timeline, hidden_timeline } = finalRoomData;
    const recordId = `${_id}_${new Date(created_at).getTime()}`;

    const fullTimeline = (timeline || []).concat(hidden_timeline || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const record = {
      roomId: finalRoomData.roomId || roomId,
      record_date: new Date(),
      game_start_time: created_at,
      winner: game_state.winner,
      config,
      players: players.map(p => ({ seat: p.seat, nickname: p.nickname, openid: p.openid, avatar_url: p.avatar_url, role: p.role, is_alive: p.is_alive, death_reason: p.death_reason })),
      player_openids: Array.from(new Set([
        finalRoomData._openid, // Creator (Judge)
        ...players.map(p => p.openid).filter(o => o && !o.startsWith('bot_'))
      ])),
      timeline: fullTimeline,
      voting_history: game_state.voting_history || finalRoomData.voting_history || []
    };
    // Ensure no empty/null openids
    record.player_openids = record.player_openids.filter(id => !!id);

    console.log(`[DEBUG] Record prepared. Voting History Count: ${record.voting_history.length}`);
    console.log(`[DEBUG] Record player_openids:`, record.player_openids);
    console.log(`[DEBUG] Creator OpenID was: ${finalRoomData._openid}`);

    await db.collection('game_records').doc(recordId).set({ data: record });
    console.log(`[DEBUG] Record saved successfully.`);
  } catch (e) { console.error('[ERROR] Save Record Error:', e); }
}

/**
 * 内容安全检查
 */
async function checkContentSecurity(cloud, text) {
  try {
    const result = await cloud.openapi.security.msgSecCheck({
      content: text,
      version: 2,
      scene: 1, // 资料审核
      openid: cloud.getWXContext().OPENID
    });
    return result.suggest === 'pass';
  } catch (err) {
    console.error('Security Check Error:', err);
    // 接口异常时默认放行，避免因腾讯侧故障导致业务阻断
    return true;
  }
}

function checkWinner(players, lovers = []) {
  let wolfCount = 0, godCount = 0, villagerCount = 0;
  let alive = players.filter(p => p.is_alive);
  alive.forEach(p => {
    if (p.role === 'werewolf') wolfCount++;
    else if (p.role === 'villager') villagerCount++;
    else godCount++;
  });
  console.log(`[DEBUG] checkWinner - Alive: ${alive.length}, Wolves: ${wolfCount}, Gods: ${godCount}, Villagers: ${villagerCount}`);
  if (lovers.length === 2 && alive.length > 0 && alive.every(p => lovers.includes(p.seat))) return { winner: 'third_party', reason: 'third_party_win' };
  if (wolfCount === 0) return { winner: 'good', reason: 'villager_win' };
  if (godCount === 0) return { winner: 'werewolf', reason: 'wolf_kill_god' };
  if (villagerCount === 0) return { winner: 'werewolf', reason: 'wolf_kill_villager' };
  return null;
}



function getAudioQueue(gs, lgs) {
  if (!gs) return null;
  const p = gs.game_state.phase, sp = gs.game_state.sub_phase, st = gs.game_state.status, day = gs.game_state.day_count;
  if (lgs && p === lgs.game_state.phase && sp === lgs.game_state.sub_phase) return null;

  const keys = [];

  // Game Start - No early return, let flowConfig handle WELCOME phase first

  // Game End
  if (st === 'finished' && lgs?.game_state.status !== 'finished') {
    const winner = gs.game_state.winner;
    const winKey = winner === 'good' ? 'VILLAGER_WIN' : (winner === 'werewolf' ? 'WOLF_WIN' : 'THIRD_PARTY_WIN');
    return ['GAME_OVER', winKey];
  }

  // General Phase Audio from Config
  let cfg = flowConfig[sp];
  if (!cfg && flowConfig[p]) cfg = flowConfig[p];

  if (cfg && cfg.getAudio) {
    const phKeys = cfg.getAudio(gs.game_state);
    if (phKeys) keys.push(...phKeys);
  }

  return keys.length > 0 ? keys : null;
}

module.exports = {
  applyUpdates,
  doSaveRecord,
  checkWinner,
  getAudioQueue,
  checkContentSecurity
};