// index.js
// 引入工具模块
const { cloud, storage, auth, util } = require('../../utils/index');
const { debounce, throttle } = util;

Page({
  data: {
    createLoading: false,
    joinLoading: false,
    showAuthModal: false,
    tempAvatarUrl: '',
    tempNickname: '',
    roomIdInputs: ['', '', '', ''],
    focusIndex: -1,
    roomId: '',
    actionType: 'create',
    showReconnectModal: false,
    reconnectContent: '',
    reconnectRoomId: ''
  },

  onLoad: function (options) {
    this.setData({ focusIndex: 0 });
  },

  onShow: function () {
    // 使用封装的 auth 模块获取用户信息
    const userInfo = auth.getUserInfo();
    if (userInfo) {
      // 使用封装的 cloud 模块检查正在进行的对局
      this.checkRunningGame();
    }
  },

  /**
   * 检查正在进行的游戏
   */
  checkRunningGame: debounce(async function() {
    const result = await cloud.callFunction('checkRunningGame', {}, { useCache: false });
    if (result && result.success && result.roomId) {
      this.setData({
        showReconnectModal: true,
        reconnectContent: `检测到您有进行中的对局(房号:${result.roomId})，是否重连？`,
        reconnectRoomId: result.roomId
      });
    }
  }, 500),

  /**
   * 确认重连
   */
  async onReconnectConfirm() {
    wx.showLoading({ title: '正在校验...', mask: true });

    const result = await cloud.callFunction('checkRunningGame', {}, { showError: false });
    wx.hideLoading();

    if (result && result.success && result.roomId === this.data.reconnectRoomId) {
      this.setData({ showReconnectModal: false });
      wx.navigateTo({ url: `/pages/room/room?roomId=${this.data.reconnectRoomId}` });
    } else {
      this.setData({ showReconnectModal: false });
      wx.showToast({ title: '房间已失效或已解散', icon: 'none' });
    }
  },

  /**
   * 取消重连
   */
  async onReconnectCancel() {
    this.setData({ showReconnectModal: false });
    wx.showLoading({ title: '正在退出...' });

    await cloud.callFunction('quitGame', {
      roomId: this.data.reconnectRoomId,
      abandon: true
    }, { showError: false });

    wx.hideLoading();
    wx.showToast({ title: '已放弃对局', icon: 'none' });
  },

  /**
   * 房间号输入
   */
  onCodeInput(e) {
    const index = e.currentTarget.dataset.index;
    let value = e.detail.value;

    if (value.length > 1) {
      value = value.charAt(value.length - 1);
    }

    const roomIdInputs = [...this.data.roomIdInputs];
    roomIdInputs[index] = value;

    const roomId = roomIdInputs.join('');

    let nextFocus = this.data.focusIndex;
    if (value && index < 3) {
      nextFocus = index + 1;
    } else if (!value && index > 0) {
      nextFocus = index - 1;
    } else if (index === 3 && value) {
      nextFocus = -1;
    }

    this.setData({
      roomIdInputs,
      roomId,
      focusIndex: nextFocus
    });
  },

  /**
   * 加入房间按钮点击
   */
  onJoinBtnClick: throttle(function() {
    if (this.data.roomId.length !== 4) {
      wx.showToast({ title: '请输入4位房间号', icon: 'none' });
      return;
    }
    this.setData({ actionType: 'join' });

    // 使用封装的 auth 模块检查用户信息
    if (auth.isUserInfoComplete()) {
      this.doJoinRoom();
    } else {
      this.setData({ showAuthModal: true });
    }
  }, 1000),

  /**
   * 创建房间按钮点击
   */
  onCreateBtnClick: throttle(function() {
    this.setData({ actionType: 'create' });

    // 使用封装的 auth 模块检查用户信息
    if (auth.isUserInfoComplete()) {
      this.doCreateRoom();
    } else {
      this.setData({ showAuthModal: true });
    }
  }, 1000),

  // --- 授权相关 ---
  onChooseAvatar(e) {
    this.setData({ tempAvatarUrl: e.detail.avatarUrl });
  },

  onNicknameChange(e) {
    this.setData({ tempNickname: e.detail.value });
  },

  closeAuthModal() {
    this.setData({ showAuthModal: false });
  },

  /**
   * 确认授权
   */
  async confirmAuth() {
    const { tempAvatarUrl, tempNickname } = this.data;

    if (!tempAvatarUrl || !tempNickname) {
      wx.showToast({ title: '请完善信息', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '安全审核中...' });

    try {
      // 使用封装的 auth 模块完成用户信息设置
      await auth.completeUserInfo({
        avatarUrl: tempAvatarUrl,
        nickName: tempNickname
      });

      this.setData({
        showAuthModal: false,
        tempAvatarUrl: '',
        tempNickname: ''
      });

      wx.hideLoading();

      // 继续之前的操作
      if (this.data.actionType === 'create') {
        this.doCreateRoom();
      } else {
        this.doJoinRoom();
      }
    } catch (err) {
      wx.hideLoading();
      if (err.message && err.message.includes('敏感词')) {
        wx.showModal({
          title: '审核不通过',
          content: err.message,
          showCancel: false
        });
      } else {
        wx.showToast({ title: err.message || '操作失败', icon: 'none' });
      }
    }
  },

  // --- 核心逻辑 ---
  doJoinRoom() {
    if (this.data.joinLoading) return;
    this.setData({ joinLoading: true });
    wx.navigateTo({
      url: `/pages/room/room?roomId=${this.data.roomId}`,
      complete: () => {
        this.setData({ joinLoading: false });
      }
    });
  },

  /**
   * 创建房间
   */
  async doCreateRoom() {
    if (this.data.createLoading) return;
    this.setData({ createLoading: true });

    const result = await cloud.callFunction('createRoom', { config: {} }, { showError: false });

    if (result && result.success) {
      wx.navigateTo({ url: `/pages/room/room?roomId=${result.roomId}` });
    } else {
      wx.showToast({ title: result.message || '创建失败', icon: 'none' });
    }

    this.setData({ createLoading: false });
  },

  goToRules() {
    wx.navigateTo({ url: '/pages/rules/rules' });
  },

  goToMyRecords() {
    wx.navigateTo({ url: '/pages/records/records' });
  }
});
