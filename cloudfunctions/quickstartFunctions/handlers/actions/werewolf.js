const { getMe, requireAlive, requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  werewolfAction: async (ev) => {
    const me = getMe(ctx);
    const aliveGuard = requireAlive(me);
    if (!aliveGuard.ok) return aliveGuard.res;
    if (!ctx.WOLF_ROLES.includes(me.role) && !me.role_state?.is_wolf_side) return { success: false, message: '您不是狼人' };
    if (ctx.roomDoc.game_state.sub_phase !== 'werewolf_phase') {
      return { success: false, message: '当前不是狼人行动阶段' };
    }

    const targetSeat = Number(ev.targetSeat);
    if (targetSeat > 0) {
      const aliveTarget = requireTargetAlive(ctx, targetSeat);
      if (!aliveTarget.ok) return aliveTarget.res;
    }
    
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: { [`current_round_actions.werewolf_votes.${me.seat}`]: targetSeat }
    });
    return { success: true };
  },

  confirmWerewolfAction: async () => {
    const me = getMe(ctx);
    const aliveGuard = requireAlive(me);
    if (!aliveGuard.ok) return aliveGuard.res;
    if (!ctx.WOLF_ROLES.includes(me.role) && !me.role_state?.is_wolf_side) return { success: false, message: '您不是狼人' };
    if (ctx.roomDoc.game_state.sub_phase !== 'werewolf_phase') {
      return { success: false, message: '当前不是狼人行动阶段' };
    }

    // 检查是否有刀人目标（全员达成共识）
    const aliveWolves = ctx.roomDoc.players.filter(p => p.is_alive && ctx.WOLF_ROLES.includes(p.role));
    const actions = ctx.roomDoc.current_round_actions || {};
    const votes = actions.werewolf_votes || {};
    const targetSeats = Object.values(votes);
    
    if (targetSeats.length < aliveWolves.length) {
      return { success: false, message: '请等待所有队友投票' };
    }

    const uniqueTargets = [...new Set(targetSeats)];
    if (uniqueTargets.length !== 1 || uniqueTargets[0] <= 0) {
      return { success: false, message: '意见不一，请商议统一目标' };
    }

    // 标记狼人整体已行动完成
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: { 'current_round_actions.werewolf_acted': true }
    });

    // 触发流转
    return await ctx.nextPhase(ctx.eventRoomId, ctx.roomDoc, ctx.roomDocId);
  }
});
