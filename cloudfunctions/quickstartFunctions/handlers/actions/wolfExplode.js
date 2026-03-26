const { getMe } = require('./guards');
const { createInstruction } = require('../../engine/modules/instructionBuilder');

module.exports = (ctx) => ({
  wolfExplode: async () => {
    const me = getMe(ctx);
    const isWolfSide = !!me && (ctx.WOLF_ROLES.includes(me.role) || !!me.role_state?.is_wolf_side);
    if (!me || !isWolfSide || !me.is_alive) return { success: false, message: '无法自爆' };

    const dayLikePhases = ['day', 'day_voting', 'day_pk', 'sheriff_election', 'sheriff_pk'];
    if (!dayLikePhases.includes(ctx.roomDoc.game_state.phase)) {
      return { success: false, message: '只能在白天自爆' };
    }
    const forbiddenSubPhases = ['day_dawn', 'leave_speech', 'sheriff_handover'];
    if (forbiddenSubPhases.includes(ctx.roomDoc.game_state.sub_phase)) {
      return { success: false, message: '当前阶段禁止自爆' };
    }
    const players = [...ctx.roomDoc.players];
      const pIdx = players.findIndex(p => p.seat === me.seat);
      if (pIdx === -1) return { success: false, message: '玩家状态异常，无法自爆' };
      players[pIdx].is_alive = false;
      players[pIdx].death_reason = 'explode';
      const timeline = [...(ctx.roomDoc.timeline || []), { day: ctx.roomDoc.game_state.day_count, phase: ctx.roomDoc.game_state.phase, text: `${me.seat}号 狼人自爆`, timestamp: new Date() }];

      // Record the explosive death
      await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
        data: {
          players,
          timeline
        }
      });
      // We need to transition back to night_start properly with correct timer and instruction
      const updatedDocResponse = await ctx.db.collection('game_rooms').doc(ctx.roomDocId).get();
      const updatedDoc = updatedDocResponse.data;
      const gs = updatedDoc.game_state;
      
      gs.phase = 'night';
      gs.day_count += 1;
      
      const newActions = ctx.getInitialActions();
      
      const instructionUpdates = createInstruction('night_start', {
        gameState: gs,
        updates: {},
        currentRoundActions: newActions
      });
      
      const finalUpdates = {
        'game_state.phase': gs.phase,
        'game_state.day_count': gs.day_count,
        'current_round_actions': ctx._.set(newActions),
        'game_state.exile_seat': null,
        'game_state.exile_result': null,
        'game_state.election_result': null,
        'game_state.pk_candidates': [],
        'game_state.current_vote_id': null,
        'game_state.last_night_deaths': [],
        'game_state.sheriff_candidate_seats': [],
        'game_state.last_transition_at': new Date(),
        'game_state.transition_lock': { at: new Date() },
        'updated_at': new Date(),
        'game_state.phase_version': ctx.roomDoc.game_state.phase_version ? ctx.roomDoc.game_state.phase_version + 1 : 1
      };
      
      Object.assign(finalUpdates, instructionUpdates);
      
      // Update the DB with the formal instruction
      await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
        data: finalUpdates
      });
      
      return { success: true };
  }
});
