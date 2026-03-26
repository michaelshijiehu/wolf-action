const { getMe, requireRole } = require('./guards');

module.exports = (ctx) => ({
  hunterAction: async (ev) => {
    const me = getMe(ctx);
    const guard = requireRole(me, 'hunter', '您不是猎人');
    if (!guard.ok) return guard.res;
    const pIdx = ctx.roomDoc.players.findIndex(x => x.openid === ctx.wxCtx.OPENID);
    if (pIdx === -1) return { success: false, message: '您未入座' };
    const hunter = ctx.roomDoc.players[pIdx];
    const roleState = hunter.role_state || {};
    // Basic check: is hunter allowed to shoot? (e.g. not poisoned)
    if (roleState.is_poisoned || roleState.hunter_status !== 'can_shoot') {
      return { success: false, message: '当前状态无法开枪' };
    }
    if (ctx.roomDoc.game_state.sub_phase !== 'hunter_action') {
      return { success: false, message: '当前不是猎人开枪阶段' };
    }
    if (roleState.hunter_shoot_used) {
      return { success: false, message: '您已经开过枪了' };
    }

    const targetSeat = ev.targetSeat ? Number(ev.targetSeat) : null;
    if (targetSeat) {
      if (targetSeat === hunter.seat) {
        return { success: false, message: '不能对自己开枪' };
      }
      const aliveTarget = requireTargetAlive(ctx, targetSeat);
      if (!aliveTarget.ok) return aliveTarget.res;

      await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
        data: {
          'current_round_actions.hunter_shoot': targetSeat,
          'current_round_actions.hunter_acted': true,
          [`players.${pIdx}.role_state.hunter_shoot_used`]: true
        }
      });
    } else {
      // Opted not to shoot
      await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
        data: {
          'current_round_actions.hunter_acted': true
        }
      });
    }
    return await ctx.nextPhase(ctx.eventRoomId, ctx.roomDoc, ctx.roomDocId);
  },

  confirmHunterAction: async () => {
    const me = getMe(ctx);
    const guard = requireRole(me, 'hunter', '您不是猎人');
    if (!guard.ok) return guard.res;
    if (ctx.roomDoc.game_state.sub_phase !== 'hunter_phase' && ctx.roomDoc.game_state.sub_phase !== 'hunter_action') {
      return { success: false, message: '当前不是猎人确认阶段' };
    }

    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: { 'current_round_actions.hunter_acted': true }
    });
    return await ctx.nextPhase(ctx.eventRoomId, ctx.roomDoc, ctx.roomDocId);
  }
});
