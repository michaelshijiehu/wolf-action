const { getMe, requireAliveRole } = require('./guards');

module.exports = (ctx) => ({
  gargoyleAction: async (ev) => {
    const me = getMe(ctx);
    const guard = requireAliveRole(me, 'gargoyle', '您不是石像鬼', '您已出局');
    if (!guard.ok) return guard.res;
    const targetSeat = Number(ev.targetSeat);
    const targetPlayer = ctx.roomDoc.players.find(p => p.seat === targetSeat);
    if (!targetPlayer) return { success: false, message: '目标不存在' };
    const role = targetPlayer.role;
    // Record verification
    const history = (me.role_state.gargoyle_check_history || []);
    history.push({ day: ctx.roomDoc.game_state.day_count, seat: targetSeat, role });
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: {
        'current_round_actions.gargoyle_check': targetSeat,
        [`players.${ctx.roomDoc.players.findIndex(p => p.openid === ctx.wxCtx.OPENID)}.role_state.gargoyle_check_history`]: history
      }
    });
    return { success: true, role };
  }
});
