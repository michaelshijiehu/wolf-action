const { getMe, requireAliveRole, requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  wolfBeautyAction: async (ev) => {
    const me = getMe(ctx);
    const guard = requireAliveRole(me, 'wolf_beauty', '您不是狼美人', '您已出局');
    if (!guard.ok) return guard.res;
    const targetSeat = Number(ev.targetSeat);
    const aliveTarget = requireTargetAlive(ctx, targetSeat);
    if (!aliveTarget.ok) return aliveTarget.res;
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: { 'current_round_actions.wolf_beauty_charm': targetSeat } });
    return { success: true };
  }
});
