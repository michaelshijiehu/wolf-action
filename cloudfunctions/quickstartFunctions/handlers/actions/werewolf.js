const { getMe, requireAlive } = require('./guards');

module.exports = (ctx) => ({
  werewolfAction: async (ev) => {
    const me = getMe(ctx);
    const aliveGuard = requireAlive(me);
    if (!aliveGuard.ok) return aliveGuard.res;
    if (!ctx.WOLF_ROLES.includes(me.role) && !me.role_state?.is_wolf_side) return { success: false, message: '您不是狼人' };
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: { [`current_round_actions.werewolf_votes.${ctx.wxCtx.OPENID}`]: Number(ev.targetSeat) }
    });
    return { success: true };
  }
});
