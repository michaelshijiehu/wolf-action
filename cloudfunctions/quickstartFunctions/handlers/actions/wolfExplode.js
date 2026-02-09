const { getMe } = require('./guards');

module.exports = (ctx) => ({
  wolfExplode: async () => {
    const me = getMe(ctx);
    if (me && me.role === 'werewolf' && me.is_alive) {
      const players = [...ctx.roomDoc.players];
      const pIdx = players.findIndex(p => p.seat === me.seat);
      players[pIdx].is_alive = false;
      players[pIdx].death_reason = 'explode';
      await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
        data: {
          players,
          'game_state.phase': 'night',
          'game_state.sub_phase': 'night_start',
          'game_state.day_count': ctx.roomDoc.game_state.day_count + 1,
          'current_round_actions': ctx.getInitialActions(),
          timeline: [...(ctx.roomDoc.timeline || []), { day: ctx.roomDoc.game_state.day_count, phase: ctx.roomDoc.game_state.phase, text: `${me.seat}号 狼人自爆`, timestamp: new Date() }]
        }
      });
      return { success: true };
    }
    return { success: false };
  }
});
