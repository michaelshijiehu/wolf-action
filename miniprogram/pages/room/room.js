Page({
  behaviors: [
    require('./room-audio'),
    require('./room-actions'),
    require('./room-config'),
    require('./room-marking'),
    require('./room-debug'),
    require('./room-lifecycle'),
    require('./room-modal'),
    require('./room-timers'),
    require('./room-watch'),
    require('./room-state'),
    require('./room-ui'),
    require('./room-seat')
  ],

  data: {
    roomId: '',
    gameState: null,
    loading: true,
    mySeat: null,
    myRole: null,
    myRoleState: {},
    isMyTurn: false,
    myOpenid: '',
    isCreator: false,
    wolfKillTarget: null,
    witchPoisonTarget: null,
    cupidTargets: [],
    isJudge: false,
    currentCount: 0,
    tempConfig: { werewolf: 0, villager: 0, seer: true, witch: true, hunter: true, idiot: false },
    configTotal: 0,
    configValid: false,

    // --- Role Confirmation ---
    hasConfirmedRole: false,
    confirmedCount: 0,

    // --- Player Marking ---
    showMarkModal: false,
    currentMarkPlayerSeat: null,
    currentMark: null,
    playerMarks: {},
    markOptions: [],
    showRoleCard: false,
    roleCardFlipped: false,
    showLog: false,
    gameDuration: '',
    roomNotFound: false,
    showAuthModal: false,
    actionCountdown: 0,
    logTab: 'vote',
    modalConfig: {
      show: false,
      title: '',
      content: '',
      showCancel: true,
      confirmText: '确定',
      cancelText: '取消',
      confirmColor: ''
    },
    _modalCallbacks: null,
    showGodViewList: false,
    isTheaterMode: false, // 全屏大圆桌模式
    watchRetryCount: 0,
    voteScrollTop: 0
  }
});
