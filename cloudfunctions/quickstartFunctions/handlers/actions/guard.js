const { getMe, requireAliveRole, requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  guardAction: async (ev) => {
    const me = getMe(ctx);
    const guardCheck = requireAliveRole(me, 'guard', '您不是守卫', '您已出局');
    if (!guardCheck.ok) return guardCheck.res;

    const pIdx = ctx.roomDoc.players.findIndex(x => x.openid === ctx.wxCtx.OPENID);
    if (pIdx === -1) return { success: false, message: '您未入座' };
    const guard = ctx.roomDoc.players[pIdx];
    const lastProtect = guard.role_state.guard_last_protected_seat;
    const targetSeat = Number(ev.targetSeat);
    const aliveTarget = requireTargetAlive(ctx, targetSeat);
    if (!aliveTarget.ok) return aliveTarget.res;
    if (lastProtect === targetSeat) return { success: false, message: '不能连续守护同一人' };
    if (ctx.roomDoc.game_state.sub_phase !== 'guard_phase') {
      return { success: false, message: '当前不是守卫行动阶段' };
    }

    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: {
        'current_round_actions.guard_protect': targetSeat,
        'current_round_actions.guard_acted': true,
        [`players.${pIdx}.role_state.guard_last_protected_seat`]: targetSeat
      }
    });
    return { success: true };
  }
});
