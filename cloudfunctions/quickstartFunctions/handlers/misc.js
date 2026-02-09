module.exports = (ctx) => ({
  getOpenId: async () => ({ openid: ctx.wxCtx.OPENID }),

  securityCheck: async (ev) => ({ success: true, isSafe: await ctx.checkContentSecurity(ctx.cloud, ev.content) }),

  getGameRecords: async (ev) => {
    const res = await ctx.db.collection('game_records')
      .where({ player_openids: ctx.wxCtx.OPENID })
      .orderBy('record_date', 'desc')
      .skip((ev.page || 0) * (ev.pageSize || 10))
      .limit(ev.pageSize || 10)
      .get();
    return { success: true, records: res.data };
  },

  getAudioQueue: async (ev) => ({ success: true, keys: ctx.getAudioQueue(ev.gameState, ev.lastGameState) }),

  getUserStats: async () => {
    const openid = ctx.wxCtx.OPENID;
    const countRes = await ctx.db.collection('game_records').where({ player_openids: openid }).count();
    if (countRes.total === 0) return { success: true, stats: { total: 0, wins: 0, winRate: '0%' } };
    const res = await ctx.db.collection('game_records').where({ player_openids: openid })
      .field({ winner: true, players: true, record_date: true })
      .orderBy('record_date', 'desc')
      .limit(100)
      .get();
    let wins = 0; let validGames = 0;
    res.data.forEach(rec => {
      const me = rec.players.find(p => p.openid === openid);
      if (me) {
        validGames++;
        if (rec.winner === 'good' && !['werewolf', 'wolf_beauty', 'gargoyle', 'wild_child'].includes(me.role)) wins++;
        else if (rec.winner === 'werewolf' && ['werewolf', 'wolf_beauty', 'gargoyle'].includes(me.role)) wins++;
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
