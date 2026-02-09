const { getMe, requireAliveRole, requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  silencerAction: async (ev) => {
    const me = getMe(ctx);
    const guard = requireAliveRole(me, 'silencer', '您不是禁言长老', '您已出局');
    if (!guard.ok) return guard.res;
    const targetSeat = Number(ev.targetSeat);
    const aliveTarget = requireTargetAlive(ctx, targetSeat);
    if (!aliveTarget.ok) return aliveTarget.res;
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: { 'current_round_actions.silencer_silence': targetSeat } });
    return { success: true };
  }
});
