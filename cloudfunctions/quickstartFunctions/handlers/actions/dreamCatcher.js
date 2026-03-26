const { getMe, requireAliveRole, requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  dreamCatcherAction: async (ev) => {
    const me = getMe(ctx);
    const guard = requireAliveRole(me, 'dream_catcher', '您不是摄梦人', '您已出局');
    if (!guard.ok) return guard.res;
    const targetSeat = Number(ev.targetSeat);
    const aliveTarget = requireTargetAlive(ctx, targetSeat);
    if (!aliveTarget.ok) return aliveTarget.res;
    if (ctx.roomDoc.game_state.sub_phase !== 'dream_catcher_phase') {
      return { success: false, message: '当前不是摄梦人行动阶段' };
    }
    
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ 
      data: { 
        'current_round_actions.dream_catcher_sleep': targetSeat,
        'current_round_actions.dream_catcher_acted': true
      } 
    });
    return { success: true };
  }
});
