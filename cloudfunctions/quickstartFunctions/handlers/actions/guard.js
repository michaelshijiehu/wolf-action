module.exports = (ctx) => ({
  guardAction: async (ev) => {
    const pIdx = ctx.roomDoc.players.findIndex(x => x.role === 'guard');
    if (pIdx > -1) {
      const guard = ctx.roomDoc.players[pIdx];
      if (!guard.is_alive) return { success: false, message: '您已出局' };
      const lastProtect = guard.role_state.guard_last_protected_seat;
      const targetSeat = Number(ev.targetSeat);
      if (lastProtect === targetSeat) return { success: false, message: '不能连续守护同一人' };

      await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
        data: {
          'current_round_actions.guard_protect': targetSeat,
          [`players.${pIdx}.role_state.guard_last_protected_seat`]: targetSeat
        }
      });
    }
    return { success: true };
  }
});
