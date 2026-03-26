const { getMe, requireAliveRole, requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  witchAction: async (ev) => {
    const me = getMe(ctx);
    const guard = requireAliveRole(me, 'witch', '您不是女巫', '您已出局');
    if (!guard.ok) return guard.res;
    if (ctx.roomDoc.game_state.sub_phase !== 'witch_phase') {
      return { success: false, message: '当前不是女巫行动阶段' };
    }

    if (ev.actionType === 'skip') {
      await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
        data: { 'current_round_actions.witch_acted': true }
      });
      return { success: true };
    }

    const pIdx = ctx.roomDoc.players.findIndex(x => x.openid === ctx.wxCtx.OPENID);
    if (pIdx === -1) return { success: false, message: '您未入座' };
    const player = ctx.roomDoc.players[pIdx];
    const up = { 'current_round_actions.witch_acted': true };

    if (ev.actionType === 'save') {
      if (player.role_state.witch_save_used) return { success: false, message: '解药已使用' };
      up['current_round_actions.witch_action.save'] = true;
      up[`players.${pIdx}.role_state.witch_save_used`] = true;
    } else if (ev.actionType === 'poison') {
      const targetSeat = Number(ev.targetSeat);
      const aliveTarget = requireTargetAlive(ctx, targetSeat);
      if (!aliveTarget.ok) return aliveTarget.res;
      if (player.role_state.witch_poison_used) return { success: false, message: '毒药已使用' };
      up['current_round_actions.witch_action.poison_target'] = targetSeat;
      up[`players.${pIdx}.role_state.witch_poison_used`] = true;
    }

    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: up });
    return { success: true };
  }
});
