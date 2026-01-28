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
      // 改用 InnerAudioContext 避免系统播放弹框
      this.audioCtx = wx.createInnerAudioContext();

      // 设置音频播放选项，允许与兼听应用混合，即使由于静音开关处于静音状态也播放声音
      if (wx.setInnerAudioOption) {
        wx.setInnerAudioOption({
          obeyMuteSwitch: false,
          mixWithOther: true
        });
      }

      this.audioCtx.onEnded(() => {
        this.handleAudioEnded();
      });

      this.audioCtx.onError((res) => {
        console.error('[AUDIO_ERROR]', res);
        this.handleAudioEnded();
      });

      this.audioCtx.onStop(() => {
        console.log('[AUDIO_DEBUG] Audio Stopped. Treating as ended.');
        this.handleAudioEnded();
      });
    },

    playSingleAudio(item) {
      if (!this.audioCtx) {
          console.warn('[AUDIO_DEBUG] Audio context missing, initializing...');
          this.initAudioContext();
      }
      
      // InnerAudioContext 不需要设置 title, epname, singer
      const text = AUDIO_TEXTS[item.key] || '语音播报';
      this.setData({ audioText: text });

      this.audioCtx.src = item.url;
      this.audioCtx.play(); // 需要显式调用 play
      console.log(`[AUDIO_DEBUG] Playing Audio: ${item.key} (${text})`);

      // Safety timeout in case onEnded never fires (30s)
      if (this.audioSafetyTimer) clearTimeout(this.audioSafetyTimer);
      this.audioSafetyTimer = setTimeout(() => {
        if (this.data.isPlayingAudio && this.audioCtx.src === item.url) {
          console.warn('[AUDIO_DEBUG] Safety timeout fired. Forcing end logic.');
          this.handleAudioEnded();
        }
      }, 30000);
    },

    handleAudioEnded() {
      console.log('[AUDIO_DEBUG] handleAudioEnded.');
      if (this.audioSafetyTimer) clearTimeout(this.audioSafetyTimer);
      const oldQueue = this.data.audioQueue;
      if (oldQueue.length > 0) oldQueue.shift();

      if (oldQueue.length > 0) {
        const nextItem = oldQueue[0];
        this.setData({ audioQueue: oldQueue });
        this.playSingleAudio(nextItem);
      } else {
        console.log('[AUDIO_DEBUG] Audio queue empty. Triggering countdown.');
        this.setData({ isPlayingAudio: false });
        setTimeout(() => {
          if (!this.data.isPlayingAudio) this.setData({ audioText: '' });
        }, 1500);
        this.triggerCountdown();
      }
    },

    playAudioKeys(keys) {
      console.log('[AUDIO_DEBUG] playAudioKeys called with:', keys);
      if (!keys || keys.length === 0) {
        console.log('[AUDIO_DEBUG] No keys provided.');
        this.triggerCountdown();
        return;
      }
      this.setData({ isPlayingAudio: true, countdown: 0 });
      if (this.countdownTimer) clearInterval(this.countdownTimer);

      // FORCE LOCAL AUDIO MODE
      const audioItems = keys.map(k => {
        return { key: k, url: `/audio_assets/${k}.mp3` };
      });

      this.playAudioQueue(audioItems);
    },

    async playAudioQueue(audioItems) {
      this.setData({ isPlayingAudio: true, countdown: 0 });
      if (this.countdownTimer) clearInterval(this.countdownTimer);

      if (!audioItems || audioItems.length === 0) {
        this.setData({ isPlayingAudio: false });
        this.triggerCountdown();
        return;
      }

      this.setData({ audioText: '...' });

      // FORCE LOCAL AUDIO MODE
      // Skip cloud URL fetching and directly use local assets
      console.log('[AUDIO_DEBUG] Using local audio assets directly.');

      const queue = audioItems.map(item => ({
        key: item.key,
        url: `/audio_assets/${item.key}.mp3`
      }));

      this.setData({ audioQueue: queue });

      if (queue.length > 0) {
        this.playSingleAudio(queue[0]);
      } else {
        this.triggerCountdown();
      }
    },

    getPhaseDuration(gameState) {
      if (!gameState) return 3;

      // NEW: Priority use server-configured duration (from current_instruction)
      if (gameState.game_state.current_instruction && gameState.game_state.current_instruction.audio && typeof gameState.game_state.current_instruction.audio.duration === 'number') {
        return gameState.game_state.current_instruction.audio.duration;
      }

      // Fallback: Check old phase_info
      if (gameState.game_state.phase_info && typeof gameState.game_state.phase_info.duration === 'number') {
        return gameState.game_state.phase_info.duration;
      }

      // Legacy Hardcoded Logic (Backup)
      const subPhase = gameState.game_state.sub_phase;
      const phase = gameState.game_state.phase;

      if (subPhase === 'game_welcome') return 8;
      if (subPhase === 'deal_cards') return 5;
      if (subPhase === 'night_start') return 5;

      // 1. Voting Phases -> 30s
      const actionPhases = ['sheriff_voting', 'day_voting', 'pk_voting'];
      if (actionPhases.includes(subPhase) || actionPhases.includes(phase)) return 30;

      // Special Fix: Werewolf Action Force 30s
      if (subPhase === 'werewolf_action') return 30;

      // 2. Day Discussion -> Dynamic (Alive Players * 20s)
      if (phase === 'day_discussion' || (phase === 'day_process' && subPhase === 'discussion')) {
        const aliveCount = gameState.players ? gameState.players.filter(p => p.is_alive).length : 5;
        return Math.max(60, aliveCount * 20);
      }

      // 2.5 Sheriff Speech & PK Speech -> Dynamic 20s per person
      const speechPhases = ['sheriff_speech', 'sheriff_pk_speech', 'pk_speech', 'day_pk'];
      if (speechPhases.includes(subPhase) || speechPhases.includes(phase)) {
        const cands = (gameState.game_state.pk_candidates && gameState.game_state.pk_candidates.length > 0) 
          ? gameState.game_state.pk_candidates 
          : (gameState.game_state.sheriff_candidate_seats || []);
        return Math.max(40, cands.length * 20);
      }

      // 3. Manual Phases (No Countdown)
      const noLimitPhases = ['sheriff_nomination'];
      if (noLimitPhases.includes(subPhase) || noLimitPhases.includes(phase)) return 0;

      // 4. Night Actions & Confirmations -> 30s
      const mediumDurationPhases = ['cupid_action', 'lover_confirm', 'guard_action', 'werewolf_action', 'seer_action', 'witch_action', 'hunter_confirm', 'hunter_action'];
      if (mediumDurationPhases.includes(subPhase) || mediumDurationPhases.includes(phase)) return 30;

      // Default
      return 3;
    },

    triggerCountdown(gameState) {
      console.log('[DEBUG] triggerCountdown called');
      const gs = gameState || this.data.gameState;
      if (!gs || !gs.game_state) return;

      const deadline = gs.game_state.stage_deadline;
      const isAuto = gs.game_state.current_instruction && gs.game_state.current_instruction.auto_proceed;

      if (deadline && deadline > 0) {
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        if (remaining > 0) {
          this.startCountdown(remaining);
        } else {
          this.setData({ countdown: 0 });
          this.stopCountdownTimer();
          // Fix: If deadline passed and it's an auto-proceed phase, trigger next immediately
          if (isAuto && this.data.isCreator) {
            console.log('[DEBUG] Deadline passed for auto phase, triggering nextPhase');
            this.onNextPhase();
          }
        }
      } else {
        // Fallback for phases without deadline
        const duration = this.getPhaseDuration(gs);
        if (duration > 0) {
          this.startCountdown(duration);
        } else {
          this.stopCountdownTimer();
          this.setData({ countdown: 0 });
        }
      }
    },

    // Helper to stop countdown timer
    stopCountdownTimer() {
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
    },

    startCountdown(seconds) {
      console.log(`[DEBUG] startCountdown called with ${seconds}s`);
      this.stopCountdownTimer(); // Always clear any existing timer first

      this.setData({ countdown: seconds });

      this.countdownTimer = setInterval(() => {
        const newVal = this.data.countdown - 1;
        this.setData({ countdown: newVal });
        // Call onNextPhase from Page, ONLY if creator (to avoid redundant CF calls)
        if (newVal <= 0) {
          this.stopCountdownTimer();
          if (this.data.isCreator) {
            console.log('[DEBUG] Timer reached zero, creator triggering nextPhase');
            this.onNextPhase();
          }
        }
      }, 1000);
    },

    stopAudioAndTimer() {
      console.log('[DEBUG] stopAudioAndTimer');
      if (this.audioCtx) this.audioCtx.stop();
      if (this.audioSafetyTimer) clearTimeout(this.audioSafetyTimer);
      this.stopCountdownTimer(); // Use the new helper to clear the timer
      // Force reset countdown visual and audio text
      this.setData({ countdown: 0, audioText: '', isPlayingAudio: false });
    }
  }
});
