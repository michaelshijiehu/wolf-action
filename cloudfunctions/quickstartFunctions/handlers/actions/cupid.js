const { getMe, requireAliveRole, requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  cupidAction: async (ev) => {
    const me = getMe(ctx);
    const guard = requireAliveRole(me, 'cupid', '您不是丘比特', '您已出局');
    if (!guard.ok) return guard.res;
    if (ctx.roomDoc.game_state.day_count > 1) return { success: false, message: '丘比特仅首夜行动' };
    const targetSeats = (ev.targetSeats || []).map(Number);
    if (targetSeats.length !== 2 || targetSeats[0] === targetSeats[1]) return { success: false, message: '必须选择两名不同玩家' };
    for (const seat of targetSeats) {
      const aliveTarget = requireTargetAlive(ctx, seat);
      if (!aliveTarget.ok) return aliveTarget.res;
    }
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: { 'game_state.lovers': targetSeats } });
    return { success: true };
  }
});
