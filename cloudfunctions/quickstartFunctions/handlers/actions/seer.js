module.exports = (ctx) => ({
  seerAction: async (ev) => {
    const seerIdx = ctx.roomDoc.players.findIndex(p => p.role === 'seer');
    if (seerIdx === -1) return { success: false, message: '本局无预言家' };
    const seer = ctx.roomDoc.players[seerIdx];
    if (!seer.is_alive) return { success: false, message: '您已出局' };
    const targetSeat = Number(ev.targetSeat);
    const target = ctx.roomDoc.players.find(pl => pl.seat == targetSeat);
    if (!target) return { success: false, message: '目标不存在' };
    const isBad = ctx.WOLF_ROLES.includes(target.role);
    const history = (seer.role_state.check_history || []);
    history.push({ day: ctx.roomDoc.game_state.day_count, seat: targetSeat, isBad });
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: {
        'current_round_actions.seer_check': { target: targetSeat, isBad },
        [`players.${seerIdx}.role_state.check_history`]: history
      }
    });
    return { success: true, isBad };
  }
});
