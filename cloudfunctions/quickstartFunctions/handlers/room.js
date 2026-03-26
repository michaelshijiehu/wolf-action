module.exports = (ctx) => ({
  createRoom: async () => {
    let rid; let attempts = 0;
    while (attempts < 10) {
      rid = Math.floor(1000 + Math.random() * 9000).toString();
      const existing = await ctx.db.collection('game_rooms').where({ roomId: rid }).count();
      if (existing.total === 0) {
        const init = {
          roomId: rid,
          _openid: ctx.wxCtx.OPENID,
          created_at: new Date(),
          updated_at: new Date(),
          expireAt: new Date(Date.now() + 7200000),
          config: { player_count: 6, roles: { werewolf: 2, villager: 2, seer: 1, witch: 1 } },
          game_state: { status: 'waiting', day_count: 0, phase: 'setup', sub_phase: 'ready', sheriff_seat: null, sheriff_candidate_seats: [], lovers: [], last_night_deaths: [], last_revealed_deaths: [], last_dream_catcher_target: null, deaths_announced: true, voting_history: [], phase_version: 0, transition_lock: {} },
          players: Array.from({ length: 6 }, (_, i) => ({ seat: i + 1, openid: '', nickname: `玩家${i + 1}`, avatar_url: '', is_alive: true, role: 'unknown', role_state: {}, action_status: {} })),
          current_round_actions: ctx.getInitialActions(),
          timeline: [],
          hidden_timeline: []
        };
        await ctx.db.collection('game_rooms').add({ data: init });
        return { success: true, roomId: rid };
      }
      attempts++;
    }
    return { success: false, message: '无法创建房间' };
  },

  joinGame: async (ev) => {
    const p = ctx.roomDoc.players;
    if (ctx.roomDoc.game_state.status !== 'waiting') {
      return { success: false, message: '游戏已开始，无法换座' };
    }
    const idx = p.findIndex(x => x.seat === ev.seat);
    if (idx === -1) return { success: false, message: '该座位不存在' };
    if (p[idx].openid && p[idx].openid !== ctx.wxCtx.OPENID) {
      return { success: false, message: '该座位已被占用' };
    }

    const updatedPlayers = p.map(player => {
      if (player.openid === ctx.wxCtx.OPENID) {
        return {
          ...player,
          openid: '',
          nickname: `玩家${player.seat}`,
          avatar_url: ''
        };
      }
      return { ...player };
    });

    updatedPlayers[idx].openid = ctx.wxCtx.OPENID;
    updatedPlayers[idx].nickname = ev.userInfo.nickName;
    updatedPlayers[idx].avatar_url = ev.userInfo.avatarUrl;
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: { players: updatedPlayers } });
    return { success: true };
  },

  startGame: async (ev) => {
    if (ctx.roomDoc._openid !== ctx.wxCtx.OPENID) return { success: false, message: '仅房主可开始游戏' };
    if (ctx.roomDoc.game_state.status !== 'waiting') return { success: false, message: '当前状态不可开始游戏' };

    const res = await ctx.db.collection('game_rooms').where({ roomId: ctx.eventRoomId }).get();
    const room = res.data[0];
    const players = room.players;
    const real = players.filter(p => p.openid);
    if (real.length < 6) return { success: false, message: '至少需要 6 名玩家才能开始游戏' };

    const roles = (ev.config && ev.config.roles) || (room.config && room.config.roles) || {};
    const isManualMode = !!(ev.config && ev.config.isManualMode);

    let pool = [];
    for (const [role, count] of Object.entries(roles)) {
      if (!Number.isInteger(count) || count < 0) {
        return { success: false, message: `角色 ${role} 配置非法` };
      }
      for (let i = 0; i < count; i++) pool.push(role);
    }
    if (pool.length !== real.length) {
      return { success: false, message: '角色数量必须与实际玩家数一致' };
    }
    pool = pool.slice(0, real.length).sort(() => Math.random() - 0.5);
    let pi = 0;
    players.forEach(p => {
      if (p.openid) {
        p.role = pool[pi++];
        p.is_alive = true;
        p.death_reason = null;
        p.role_state = { witch_poison_used: false, witch_save_used: false, hunter_shoot_used: false, hunter_status: 'can_shoot', guard_last_protected_seat: null, idiot_revealed: false, model_seat: null, merchant_item: null, silencer_last_silenced: null, magician_exchanged: [], dream_catcher_target: null, wolf_beauty_target: null, gargoyle_check_history: [] };
      }
    });
    const inst = ctx.flowConfig['game_welcome'];
    const dur = inst.duration || 10;
    const initialGameState = {
      status: 'playing',
      start_time: new Date(),
      day_count: 1,
      phase: 'day',
      sub_phase: 'game_welcome',
      is_manual_mode: isManualMode,
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
      last_night_deaths: [],
      last_revealed_deaths: [],
      last_dream_catcher_target: null,
      phase_version: 0,
      transition_lock: {}
    };
    await ctx.db.collection('game_rooms').doc(room._id).update({
      data: {
        players,
        config: ctx._.set({ 
          player_count: players.length, 
          roles, 
          win_mode: ev.config.win_mode || 'kill_side',
          isManualMode 
        }),
        'game_state': ctx._.set(initialGameState),
        current_round_actions: ctx._.set({
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
        }),
        timeline: ctx._.set([{ day: 1, phase: 'day', text: '游戏开始', timestamp: new Date() }]),
        updated_at: new Date()
      }
    });
    return { success: true };
  },

  updateRoomSize: async (ev) => {
    let p = ctx.roomDoc.players;
    if (ev.targetCount > p.length) {
      for (let i = p.length; i < ev.targetCount; i++) {
        p.push({ seat: i + 1, openid: '', nickname: `玩家${i + 1}`, avatar_url: '', is_alive: true, role: 'unknown', role_state: {}, action_status: {} });
      }
    } else if (ev.targetCount < p.length) {
      // Check if any seats being removed are currently occupied
      const removedSeats = p.slice(ev.targetCount);
      const hasOccupied = removedSeats.some(player => player.openid !== '');
      if (hasOccupied) {
        return { success: false, message: '无法缩小人数：被缩减的座位上已有玩家入座，请先让其让座' };
      }
      p = p.slice(0, ev.targetCount);
    }
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: { players: p, 'config.player_count': ev.targetCount } });
    return { success: true };
  },

  enterRoom: async (ev) => {
    const { userInfo } = ev;
    const me = { openid: ctx.wxCtx.OPENID, nickname: userInfo.nickName, avatar_url: userInfo.avatarUrl, last_active: Date.now() };

    const res = await ctx.db.collection('game_rooms').where({ roomId: ctx.eventRoomId }).get();
    if (res.data.length === 0) return { success: false, message: '房间不存在' };
    const room = res.data[0];

    let visitors = room.visitors || [];
    const vIdx = visitors.findIndex(v => v.openid === ctx.wxCtx.OPENID);
    if (vIdx === -1) visitors.push(me);
    else visitors[vIdx] = me;

    // 清理超过 10 分钟未活跃的访客 (防止幽灵)
    const NOW = Date.now();
    visitors = visitors.filter(v => (NOW - (v.last_active || 0)) < 600000 || v.openid === ctx.wxCtx.OPENID);

    const up = { visitors, updated_at: new Date() };
    if (room.game_state.status === 'waiting') {
      const totalVisitors = visitors.length;
      const currentSeats = room.players.length;
      if (totalVisitors > currentSeats) {
        const newPlayers = [...room.players];
        for (let i = currentSeats; i < totalVisitors; i++) {
          newPlayers.push({ seat: i + 1, openid: '', nickname: `玩家${i + 1}`, avatar_url: '', is_alive: true, role: 'unknown', role_state: {}, action_status: {} });
        }
        up.players = newPlayers;
        up['config.player_count'] = totalVisitors;
        if (!up.timeline) up.timeline = room.timeline || [];
        up.timeline.push({ day: 0, phase: 'setup', text: `系统: 检测到新玩家，已扩容至${totalVisitors}人局`, timestamp: new Date() });
      }
    }
    await ctx.db.collection('game_rooms').doc(room._id).update({ data: up });
    return { success: true };
  },

  leaveRoom: async () => {
    const res = await ctx.db.collection('game_rooms').where({ roomId: ctx.eventRoomId }).get();
    if (res.data.length > 0) {
      const room = res.data[0];
      const visitors = (room.visitors || []).filter(v => v.openid !== ctx.wxCtx.OPENID);
      const up = { visitors, updated_at: new Date() };

      if (room.game_state.status === 'waiting') {
        let players = room.players;
        const pIdx = players.findIndex(p => p.openid === ctx.wxCtx.OPENID);
        if (pIdx > -1) {
          players[pIdx].openid = '';
          players[pIdx].nickname = `玩家${players[pIdx].seat}`;
          players[pIdx].avatar_url = '';
        }
        const targetCount = Math.max(6, visitors.length);
        while (players.length > targetCount && !players[players.length - 1].openid) {
          players.pop();
        }
        up.players = players;
        up['config.player_count'] = players.length;
      }
      await ctx.db.collection('game_rooms').doc(room._id).update({ data: up });
    }
    return { success: true };
  },

  deleteRoom: async () => {
    if (ctx.roomDoc._openid !== ctx.wxCtx.OPENID) return { success: false, message: '无权解散' };
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).remove();
    return { success: true };
  },

  resetRoom: async () => {
    const resetP = ctx.roomDoc.players.map(p => p.openid ? {
      seat: p.seat,
      openid: p.openid,
      nickname: p.nickname,
      avatar_url: p.avatar_url,
      is_alive: true,
      role: 'unknown',
      role_state: { witch_poison_used: false, witch_save_used: false, hunter_shoot_used: false, guard_last_protected_seat: null },
      action_status: { is_ready: false }
    } : p);
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: {
              game_state: ctx._.set({
                status: 'waiting',
                day_count: 0,
                phase: 'setup',
                sub_phase: 'ready',
                is_manual_mode: false, // 初始化手动模式为关闭
                sheriff_seat: null,
                sheriff_candidate_seats: [],
                pk_candidates: [],
                lovers: [],
                last_night_deaths: [],
                last_revealed_deaths: [],
                last_dream_catcher_target: null,
                deaths_announced: true,
                voting_history: [],
                phase_version: 0,
                transition_lock: {}
              }),
        players: resetP,
        config: {
          player_count: resetP.length,
          roles: resetP.length === 6 
            ? { werewolf: 2, villager: 2, seer: 1, witch: 1 } 
            : { werewolf: Math.floor(resetP.length / 3), villager: Math.floor(resetP.length / 3), seer: 1, witch: 1, hunter: 1 }
        },
        current_round_actions: ctx._.set(ctx.getInitialActions()),
        timeline: []
      }
    });
    return { success: true };
  },

  toggleManualMode: async (ev) => {
    if (ctx.roomDoc._openid !== ctx.wxCtx.OPENID) return { success: false, message: '权限不足' };
    const currentMode = !!ctx.roomDoc.game_state.is_manual_mode;
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: { 'game_state.is_manual_mode': !currentMode }
    });
    return { success: true, isManualMode: !currentMode };
  },

  quitGame: async (ev) => {
    if (ev.abandon && ctx.roomDoc._openid === ctx.wxCtx.OPENID) {
      await ctx.db.collection('game_rooms').doc(ctx.roomDocId).remove();
    } else {
      let p = ctx.roomDoc.players;
      const idx = p.findIndex(x => x.openid === ctx.wxCtx.OPENID);
      if (idx > -1) {
        p[idx].openid = '';
        p[idx].nickname = `玩家${p[idx].seat}`;
        p[idx].avatar_url = '';

        // 自动缩减逻辑
        if (ctx.roomDoc.game_state.status === 'waiting') {
          const visitorsCount = (ctx.roomDoc.visitors || []).length;
          while (p.length > 6 && p.length > visitorsCount && !p[p.length - 1].openid) {
            p.pop();
          }
        }
        await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: { players: p, 'config.player_count': p.length } });
      }
    }
    return { success: true };
  },

  transferOwner: async (ev) => {
    if (ctx.roomDoc._openid !== ctx.wxCtx.OPENID) return { success: false, message: '无权转移' };
    const targetOpenid = ev.targetOpenid;
    if (!targetOpenid) return { success: false, message: '目标玩家不存在' };
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: { _openid: targetOpenid, updated_at: new Date() } });
    return { success: true };
  },

  updateRoomConfig: async (ev) => {
    if (ctx.roomDoc._openid !== ctx.wxCtx.OPENID) return { success: false, message: '仅房主可修改配置' };
    if (ctx.roomDoc.game_state.status !== 'waiting') return { success: false, message: '游戏已开始，无法修改配置' };
    
    const { config } = ev;
    if (!config) return { success: false, message: '配置数据不能为空' };

    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: {
        config: ctx._.set(config),
        updated_at: new Date()
      }
    });
    return { success: true };
  }
});
