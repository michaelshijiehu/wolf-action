module.exports = Behavior({
  methods: {
    // --- Action Timer Logic ---
    startActionTimer: function () {
      this.stopActionTimer(); // Clear existing
      
      const duration = this.data.gameState?.game_state?.current_instruction?.duration || 20;
      console.log(`[Timer] Starting ${duration}s action timer...`);
      let countdown = duration;
      this.setData({ actionCountdown: countdown });

      // UI Updater
      this.actionInterval = setInterval(() => {
        countdown--;
        this.setData({ actionCountdown: countdown });
        if (countdown <= 0) {
          clearInterval(this.actionInterval);
        }
      }, 1000);

      // Logic Timeout
      this.actionTimeout = setTimeout(() => {
        console.log('[Room] Action timeout triggered. Auto-confirming.');
        this.onActionTimeout();
      }, duration * 1000);
    },

    stopActionTimer: function () {
      if (this.actionInterval) clearInterval(this.actionInterval);
      if (this.actionTimeout) clearTimeout(this.actionTimeout);
      this.actionInterval = null;
      this.actionTimeout = null;
      this.setData({ actionCountdown: 0 });
    },

    onConfirmAction: function () {
      console.log('[Room] User manually confirmed action.');
      this.stopActionTimer();

      const gs = this.data.gameState;
      if (!gs) return;
      const subPhase = gs.game_state.sub_phase;
      const myRole = this.data.myRole;

      // Trigger actions based on phase
      if (subPhase === 'cupid_action' && myRole === 'cupid') {
        if (this.data.cupidTargets && this.data.cupidTargets.length === 2) {
          this.onCupidConfirm();
        } else {
          if (this.data.cupidTargets.length !== 2) {
            this.onGenericAction();
          } else {
            this.onCupidConfirm();
          }
        }
      } else if (subPhase === 'witch_action') {
        this.onWitchSkip();
      } else if (subPhase === 'guard_action') {
        this.onGuardSkip();
      } else if (subPhase === 'seer_action') {
        this.onSeerSkip(); 
      } else {
        this.onGenericAction();
      }
    },

    onActionTimeout: function () {
      if (this.data.isMyTurn) {
        const gs = this.data.gameState;
        const subPhase = gs ? gs.game_state.sub_phase : '';

        // Verify if still in a voting phase before auto-abstaining
        const VOTING_PHASES = ['voting', 'pk_voting', 'sheriff_voting', 'sheriff_pk_voting'];
        if (VOTING_PHASES.includes(subPhase)) {
          if (this.data.myVoteTarget) {
            console.log('[Room] Action timeout, but already voted. Ignoring.');
            return;
          }

          console.log('[Room] Voting timeout. Auto-abstaining.');
          if (subPhase === 'sheriff_voting' || subPhase === 'sheriff_pk_voting') {
            this.onSheriffAbstain();
          } else {
            this.onAbstainVote();
          }
        } else {
          // Only trigger generic confirm if the subPhase hasn't changed to a non-action phase
          if (gs && gs.game_state.current_instruction && gs.game_state.current_instruction.actionPanel !== 'none') {
            wx.showToast({ title: '超时自动执行', icon: 'none' });
            this.onConfirmAction();
          }
        }
      }
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
