// miniprogram/pages/room/room-audio.js
const AUDIO_MANIFEST = require('../../audioManifest.js');
const AUDIO_TEXTS = require('./audioTexts');

module.exports = Behavior({
  data: {
    audioText: '',
    audioQueue: [],
    countdown: 0,
    currentAudioRetryCount: 0,
  },

  methods: {
    initAudioContext() {
      this.audioCtx = wx.createInnerAudioContext();
      if (wx.setInnerAudioOption) {
        wx.setInnerAudioOption({
          obeyMuteSwitch: false,
          mixWithOther: true
        });
      }
      this.audioCtx.onEnded(() => { this.handleAudioEnded(); });
      this.audioCtx.onError((res) => { console.error('[AUDIO_ERROR]', res); this.handleAudioEnded(); });
      this.audioCtx.onStop(() => { this.handleAudioEnded(); });
    },

    playSingleAudio(item) {
      if (!this.audioCtx) this.initAudioContext();
      const text = AUDIO_TEXTS[item.key] || '语音播报';
      this.setData({ audioText: text });
      this.audioCtx.src = item.url;
      this.audioCtx.play();
      if (this.audioSafetyTimer) clearTimeout(this.audioSafetyTimer);
      this.audioSafetyTimer = setTimeout(() => {
        if (this.data.isPlayingAudio && this.audioCtx.src === item.url) {
          this.handleAudioEnded();
        }
      }, 30000);
    },

    handleAudioEnded() {
      if (this.audioSafetyTimer) clearTimeout(this.audioSafetyTimer);
      const oldQueue = this.data.audioQueue;
      if (oldQueue.length > 0) oldQueue.shift();
      if (oldQueue.length > 0) {
        this.setData({ audioQueue: oldQueue });
        this.playSingleAudio(oldQueue[0]);
      } else {
        this.setData({ isPlayingAudio: false });
        setTimeout(() => { if (!this.data.isPlayingAudio) this.setData({ audioText: '' }); }, 1500);
        this.triggerCountdown();
      }
    },

    playAudioKeys(keys) {
      if (!keys || keys.length === 0) { this.triggerCountdown(); return; }
      this.setData({ isPlayingAudio: true, countdown: 0 });
      if (this.countdownTimer) clearInterval(this.countdownTimer);
      const audioItems = keys.map(k => { return { key: k, url: `/audio_assets/${k}.mp3` }; });
      this.playAudioQueue(audioItems);
    },

    playAudioQueue(audioItems) {
      this.setData({ isPlayingAudio: true, countdown: 0 });
      if (this.countdownTimer) clearInterval(this.countdownTimer);
      if (!audioItems || audioItems.length === 0) { this.setData({ isPlayingAudio: false }); this.triggerCountdown(); return; }
      this.setData({ audioText: '...' });
      const queue = audioItems.map(item => ({ key: item.key, url: `/audio_assets/${item.key}.mp3` }));
      this.setData({ audioQueue: queue });
      if (queue.length > 0) this.playSingleAudio(queue[0]);
      else this.triggerCountdown();
    },

    getPhaseDuration(gameState) {
      if (!gameState) return 3;
      if (gameState.game_state.current_instruction && typeof gameState.game_state.current_instruction.duration === 'number') {
        return gameState.game_state.current_instruction.duration;
      }
      if (gameState.game_state.phase_info && typeof gameState.game_state.phase_info.duration === 'number') {
        return gameState.game_state.phase_info.duration;
      }
      const subPhase = gameState.game_state.sub_phase;
      const phase = gameState.game_state.phase;
      if (['game_welcome', 'deal_cards', 'night_start'].includes(subPhase)) return 8;
      if (['sheriff_voting', 'day_voting', 'pk_voting', 'werewolf_action'].includes(subPhase)) return 30;
      if (phase === 'day_discussion' || (phase === 'day_process' && subPhase === 'discussion')) {
        const aliveCount = gameState.players ? gameState.players.filter(p => p.is_alive).length : 5;
        return Math.max(60, aliveCount * 60);
      }
      if (['sheriff_speech', 'sheriff_pk_speech', 'pk_speech', 'day_pk'].includes(subPhase)) {
        const cands = (gameState.game_state.pk_candidates && gameState.game_state.pk_candidates.length > 0) ? gameState.game_state.pk_candidates : (gameState.game_state.sheriff_candidate_seats || []);
        return Math.max(40, cands.length * 20);
      }
      if (['sheriff_nomination'].includes(subPhase)) return 0;
      if (['cupid_action', 'lover_confirm', 'guard_action', 'seer_action', 'witch_action', 'hunter_confirm', 'hunter_action'].includes(subPhase)) return 30;
      return 3;
    },

    triggerCountdown(gameState) {
      const gs = gameState || this.data.gameState;
      if (!gs || !gs.game_state) return;
      const deadline = gs.game_state.stage_deadline;
      const isAuto = gs.game_state.current_instruction && gs.game_state.current_instruction.auto_proceed;
      if (deadline && deadline > 0) {
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        if (remaining > 0) this.startCountdown(remaining);
        else {
          this.setData({ countdown: 0 });
          this.stopCountdownTimer();
          if (isAuto && this.data.isCreator) this.onNextPhase();
        }
      } else {
        const duration = this.getPhaseDuration(gs);
        if (duration > 0) this.startCountdown(duration);
        else { this.stopCountdownTimer(); this.setData({ countdown: 0 }); }
      }
    },

    stopCountdownTimer() {
      if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null; }
    },

    startCountdown(seconds) {
      this.stopCountdownTimer();
      this.setData({ countdown: seconds });
      this.countdownTimer = setInterval(() => {
        const newVal = this.data.countdown - 1;
        this.setData({ countdown: newVal });
        if (newVal <= 0) {
          this.stopCountdownTimer();
          const currentState = this.data.gameState;
          const isAuto = currentState && currentState.game_state.current_instruction && currentState.game_state.current_instruction.auto_proceed;
          console.log('[DEBUG] Timer ended. isAuto:', isAuto, 'isCreator:', this.data.isCreator);
          if (this.data.isCreator) {
             console.log('[DEBUG] Triggering onNextPhase from timer...');
             this.onNextPhase();
          } else {
             console.warn('[DEBUG] Not triggering next phase because isCreator is false');
          }
        }
      }, 1000);
    },

    stopAudioAndTimer() {
      if (this.audioCtx) this.audioCtx.stop();
      if (this.audioSafetyTimer) clearTimeout(this.audioSafetyTimer);
      this.stopCountdownTimer();
      this.setData({ countdown: 0, audioText: '', isPlayingAudio: false });
    }
  }
});