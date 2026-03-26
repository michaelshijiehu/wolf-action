const { getMe, requireAliveRole, requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  seerAction: async (ev) => {
    const me = getMe(ctx);
    const guard = requireAliveRole(me, 'seer', '您不是预言家', '您已出局');
    if (!guard.ok) return guard.res;

    const seerIdx = ctx.roomDoc.players.findIndex(p => p.openid === ctx.wxCtx.OPENID);
    if (seerIdx === -1) return { success: false, message: '您未入座' };
    const seer = ctx.roomDoc.players[seerIdx];

    const targetSeat = Number(ev.targetSeat);
    if (targetSeat === seer.seat) return { success: false, message: '不能查验自己' };
    const aliveTarget = requireTargetAlive(ctx, targetSeat);
    if (!aliveTarget.ok) return aliveTarget.res;
    const target = aliveTarget.target;

    // 核心限制：一晚只能查验一次
    if (ctx.roomDoc.current_round_actions?.seer_check?.target) {
      return { success: false, message: '今晚已完成查验' };
    }

    // 动作阶段校验
    if (ctx.roomDoc.game_state.sub_phase !== 'seer_phase') {
      return { success: false, message: '当前不是预言家行动阶段' };
    }

    const isBad = ctx.WOLF_ROLES.includes(target.role) || !!target.role_state.is_wolf_side;
    const history = (seer.role_state.check_history || []);
    history.push({ day: ctx.roomDoc.game_state.day_count, seat: targetSeat, isBad });
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: {
        'current_round_actions.seer_check': { target: targetSeat, isBad },
        'current_round_actions.seer_acted': true,
        [`players.${seerIdx}.role_state.check_history`]: history
      }
    });
    return { success: true, isBad };
  }
});
