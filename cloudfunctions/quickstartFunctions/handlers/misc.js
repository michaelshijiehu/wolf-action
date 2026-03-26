module.exports = (ctx) => ({
  getOpenId: async () => ({ openid: ctx.wxCtx.OPENID }),
  pingAutoProceed: async () => ({ success: true }),

  securityCheck: async (ev) => ({ success: true, isSafe: await ctx.checkContentSecurity(ctx.cloud, ev.content) }),

  getGameRecords: async (ev) => {
    // 关键修复：同时查询扁平化和嵌套结构的记录，确保用户能看到旧对局
    const res = await ctx.db.collection('game_records')
      .where(ctx._.or([
        { player_openids: ctx.wxCtx.OPENID },
        { 'data.player_openids': ctx.wxCtx.OPENID }
      ]))
      .orderBy('record_date', 'desc')
      .skip((ev.page || 0) * (ev.pageSize || 10))
      .limit(ev.pageSize || 10)
      .get();
    
    // 统一转换为扁平化结构返回给前端
    const records = res.data.map(rec => {
      if (rec.data && !rec.players) {
        return { _id: rec._id, _openid: rec._openid, ...rec.data };
      }
      return rec;
    });

    return { success: true, records };
  },

  getAudioQueue: async (ev) => ({ success: true, keys: ctx.getAudioQueue(ev.gameState, ev.lastGameState) }),

  getUserStats: async () => {
    const openid = ctx.wxCtx.OPENID;
    // 同时统计两种结构的记录
    const countRes = await ctx.db.collection('game_records')
      .where(ctx._.or([
        { player_openids: openid },
        { 'data.player_openids': openid }
      ])).count();

    if (countRes.total === 0) return { success: true, stats: { total: 0, wins: 0, winRate: '0%' } };
    
    const res = await ctx.db.collection('game_records')
      .where(ctx._.or([
        { player_openids: openid },
        { 'data.player_openids': openid }
      ]))
      .field({ winner: true, players: true, record_date: true, 'data.winner': true, 'data.players': true })
      .orderBy('record_date', 'desc')
      .limit(100)
      .get();
    
    // 阵营定义
    const WOLF_ROLES = ['werewolf', 'wolf_king', 'wolf_beauty', 'hidden_wolf', 'gargoyle', 'white_wolf_king'];
    
    let wins = 0; let validGames = 0;
    res.data.forEach(rawRec => {
      // 兼容两种结构
      const rec = (rawRec.data && !rawRec.players) ? rawRec.data : rawRec;
      const players = rec.players || [];
      const winner = rec.winner;

      const me = players.find(p => p.openid === openid);
      if (me) {
        validGames++;
        // 判断阵营
        const isWolf = WOLF_ROLES.includes(me.role) || me.role_state?.is_wolf_side === true;
        
        if (winner === 'good' && !isWolf) wins++;
        else if (winner === 'werewolf' && isWolf) wins++;
        else if (winner === 'third_party') {
          wins++; 
        }
      }
    });
    return {
      success: true,
      stats: { total: countRes.total, wins, winRate: `${validGames > 0 ? Math.round((wins / validGames) * 100) : 0}%` },
      recentRecord: res.data.length > 0 ? res.data[0] : null
    };
  },

  checkRunningGame: async () => {
    const res = await ctx.db.collection('game_rooms')
      .where(ctx._.or([{ 'players.openid': ctx.wxCtx.OPENID }, { '_openid': ctx.wxCtx.OPENID }]))
      .where({ 'game_state.status': ctx._.neq('finished') })
      .orderBy('updated_at', 'desc')
      .get();
    const EXPIRE_MS = 24 * 60 * 60 * 1000;
    for (const room of res.data) {
      // Double check room still exists in a valid state
      if (Date.now() - new Date(room.updated_at).getTime() > EXPIRE_MS) {
        await ctx.db.collection('game_rooms').doc(room._id).remove();
      } else {
        // Additional check: Ensure the player is actually still in the players list if they aren't the creator
        const isCreator = room._openid === ctx.wxCtx.OPENID;
        const isInSeat = room.players.some(p => p.openid === ctx.wxCtx.OPENID);
        if (isCreator || isInSeat) {
          return { success: true, roomId: room.roomId };
        }
      }
    }
    return { success: false };
  }
});
