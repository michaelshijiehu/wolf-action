const { getMe, requireAliveRole, requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  dreamCatcherAction: async (ev) => {
    const me = getMe(ctx);
    const guard = requireAliveRole(me, 'dream_catcher', '您不是摄梦人', '您已出局');
    if (!guard.ok) return guard.res;
    const targetSeat = Number(ev.targetSeat);
    const aliveTarget = requireTargetAlive(ctx, targetSeat);
    if (!aliveTarget.ok) return aliveTarget.res;
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: { 'current_round_actions.dream_catcher_sleep': targetSeat } });
    return { success: true };
  }
});
