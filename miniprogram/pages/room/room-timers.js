module.exports = Behavior({
  methods: {
    startHeartbeat: function () {
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      // Ensure we hit the backend every 10 seconds to trigger auto-proceed
      this.heartbeatTimer = setInterval(() => {
        if (!this.data.roomId) return;
        const gs = this.data.gameState;
        if (gs && gs.game_state.status === 'playing') {
          wx.cloud.callFunction({
            name: 'quickstartFunctions',
            data: { type: 'pingAutoProceed', roomId: this.data.roomId }
          }).catch(console.error);
        }
      }, 10000);
    },

    stopHeartbeat: function () {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
    },
    // --- Action Timer Logic ---
    startActionTimer: function () {
      this.stopActionTimer(); // Clear existing

      const duration = this.data.gameState?.game_state?.current_instruction?.duration || 20;
      console.log(`[Timer] Starting ${duration}s action timeout...`);

      // We just log that the client-side visual timer finished.
      // Do NOT auto-submit actions anymore, the server handles auto-proceed.
      this.actionTimeout = setTimeout(() => {
        console.log('[Room] Client action visual timer ended. Waiting for server auto_proceed.');
      }, duration * 1000);
    },

    stopActionTimer: function () {
      if (this.actionTimeout) clearTimeout(this.actionTimeout);
      this.actionTimeout = null;
    },

    onConfirmAction: function () {
      console.log('[Room] User manually confirmed action.');
      this.stopActionTimer();

      const gs = this.data.gameState;
      if (!gs) return;
      const subPhase = gs.game_state.sub_phase;
      const myRole = this.data.myRole;

      // Trigger actions based on phase
      if (subPhase === 'cupid_phase' && myRole === 'cupid') {
        if (this.data.cupidTargets && this.data.cupidTargets.length === 2) {
          this.onCupidConfirm();
        } else {
          if (this.data.cupidTargets.length !== 2) {
            this.onGenericAction();
          } else {
            this.onCupidConfirm();
          }
        }
      } else if (subPhase === 'werewolf_phase') {
        this.onWolfConfirm();
      } else if (subPhase === 'witch_phase') {
        this.onWitchSkip();
      } else if (subPhase === 'guard_phase') {
        this.onGuardSkip();
      } else if (subPhase === 'seer_phase') {
        this.onSeerSkip();
      } else {
        this.onGenericAction();
      }
    },

    onActionTimeout: function () {
      // Deprecated: No longer simulate client-actions. Let the server transition the phase.
    },

    updateGameDuration() {
      if (!this.data.gameState || !this.data.gameState.game_state.start_time) return;
      const startTime = this.data.gameState.game_state.start_time;
      const now = Date.now();
      const diff = Math.max(0, now - startTime);
      const pad = n => n.toString().padStart(2, '0');
      const seconds = Math.floor((diff / 1000) % 60);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const hours = Math.floor((diff / (1000 * 60 * 60)));
      let durationStr = `${pad(minutes)}:${pad(seconds)}`;
      if (hours > 0) durationStr = `${pad(hours)}:${durationStr}`;
      this.setData({ gameDuration: durationStr });
    }
  }
});
