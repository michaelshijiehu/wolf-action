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
      const refreshed = await ctx.db.collection('game_rooms').doc(ctx.roomDocId).get();
      await ctx.nextPhase(ctx.eventRoomId, refreshed.data, ctx.roomDocId);
      return { success: true };
    }

    const pIdx = ctx.roomDoc.players.findIndex(x => x.openid === ctx.wxCtx.OPENID);
    if (pIdx === -1) return { success: false, message: '您未入座' };
    const player = ctx.roomDoc.players[pIdx];
    const up = {};

    if (ev.actionType === 'save') {
      if (player.role_state.witch_save_used) return { success: false, message: '解药已使用' };
      // 当晚一旦确认用药，直接视为行动完成并进入下一阶段
      up['current_round_actions.witch_action.save'] = true;
      up['current_round_actions.witch_acted'] = true;
      up[`players.${pIdx}.role_state.witch_save_used`] = true;
    } else if (ev.actionType === 'poison') {
      const targetSeat = Number(ev.targetSeat);
      const aliveTarget = requireTargetAlive(ctx, targetSeat);
      if (!aliveTarget.ok) return aliveTarget.res;
      if (player.role_state.witch_poison_used) return { success: false, message: '毒药已使用' };
      up['current_round_actions.witch_action.poison_target'] = targetSeat;
      up['current_round_actions.witch_acted'] = true;
      up[`players.${pIdx}.role_state.witch_poison_used`] = true;
    } else {
      return { success: false, message: '不支持的女巫操作' };
    }

    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: up });
    const refreshed = await ctx.db.collection('game_rooms').doc(ctx.roomDocId).get();
    await ctx.nextPhase(ctx.eventRoomId, refreshed.data, ctx.roomDocId);
    return { success: true };
  }
});
