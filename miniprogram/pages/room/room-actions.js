module.exports = Behavior({
  behaviors: [
    require('./room-actions-core'),
    require('./room-actions-werewolf'),
    require('./room-actions-witch'),
    require('./room-actions-seer'),
    require('./room-actions-guard'),
    require('./room-actions-cupid'),
    require('./room-actions-special')
  ]
});
