const WOLF_ROLES = ['werewolf', 'wolf_king', 'wolf_beauty', 'hidden_wolf', 'gargoyle'];

const getInitialActions = () => ({
  role_confirmations: {},
  werewolf_votes: {},
  day_votes: {},
  seer_check: {},
  witch_action: { save: false, poison_target: null },
  guard_protect: null,
  sheriff_votes: {},
  hunter_shoot: null,
  cupid_targets: [],
  magician_exchange: [],
  dream_catcher_sleep: null,
  wolf_beauty_charm: null,
  gargoyle_check: null,
  merchant_trade: null,
  merchant_item: null,
  silencer_silence: null,
  wild_child_choice: null,
  gravekeeper_result: null
});

module.exports = { WOLF_ROLES, getInitialActions };
