const { getMe, requireAliveRole, requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  wolfBeautyAction: async (ev) => {
    const me = getMe(ctx);
    const guard = requireAliveRole(me, 'wolf_beauty', '您不是狼美人', '您已出局');
    if (!guard.ok) return guard.res;
    const targetSeat = Number(ev.targetSeat);
    const aliveTarget = requireTargetAlive(ctx, targetSeat);
    if (!aliveTarget.ok) return aliveTarget.res;
    if (ctx.roomDoc.game_state.sub_phase !== 'wolf_beauty_phase') {
      return { success: false, message: '当前不是狼美人行动阶段' };
    }
    
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ 
      data: { 
        'current_round_actions.wolf_beauty_charm': targetSeat,
        'current_round_actions.wolf_beauty_acted': true
      } 
    });
    const refreshed = await ctx.db.collection('game_rooms').doc(ctx.roomDocId).get();
    await ctx.nextPhase(ctx.eventRoomId, refreshed.data, ctx.roomDocId);
    return { success: true };
  }
});
