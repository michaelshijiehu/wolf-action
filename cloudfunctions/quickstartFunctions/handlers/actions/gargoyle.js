const { getMe, requireAliveRole, requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  gargoyleAction: async (ev) => {
    const me = getMe(ctx);
    const guard = requireAliveRole(me, 'gargoyle', '您不是石像鬼', '您已出局');
    if (!guard.ok) return guard.res;
    if (ctx.roomDoc.game_state.sub_phase !== 'gargoyle_phase') {
      return { success: false, message: '当前不是石像鬼行动阶段' };
    }
    const targetSeat = Number(ev.targetSeat);
    const aliveTarget = requireTargetAlive(ctx, targetSeat);
    if (!aliveTarget.ok) return aliveTarget.res;
    const targetPlayer = aliveTarget.target;
    const role = targetPlayer.role;
    // Record verification
    const history = (me.role_state.gargoyle_check_history || []);
    history.push({ day: ctx.roomDoc.game_state.day_count, seat: targetSeat, role });
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: {
        'current_round_actions.gargoyle_check': targetSeat,
        'current_round_actions.gargoyle_acted': true,
        [`players.${ctx.roomDoc.players.findIndex(p => p.openid === ctx.wxCtx.OPENID)}.role_state.gargoyle_check_history`]: history
      }
    });
    const refreshed = await ctx.db.collection('game_rooms').doc(ctx.roomDocId).get();
    await ctx.nextPhase(ctx.eventRoomId, refreshed.data, ctx.roomDocId);
    return { success: true, role };
  }
});
