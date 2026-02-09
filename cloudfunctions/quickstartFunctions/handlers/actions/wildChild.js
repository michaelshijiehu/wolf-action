const { getMe, requireAliveRole, requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  wildChildAction: async (ev) => {
    const me = getMe(ctx);
    const guard = requireAliveRole(me, 'wild_child', '您不是野孩子', '您已出局');
    if (!guard.ok) return guard.res;
    if (ctx.roomDoc.game_state.day_count > 1) return { success: false, message: '野孩子仅首夜行动' };
    const targetSeat = Number(ev.targetSeat);
    const aliveTarget = requireTargetAlive(ctx, targetSeat);
    if (!aliveTarget.ok) return aliveTarget.res;
    const meIdx = ctx.roomDoc.players.findIndex(p => p.openid === ctx.wxCtx.OPENID);
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: { [`players.${meIdx}.role_state.model_seat`]: targetSeat }
    });
    return { success: true };
  }
});
