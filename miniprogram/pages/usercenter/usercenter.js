// pages/usercenter/usercenter.js
const app = getApp();

Page({
  data: {
    userInfo: null,
    showEditModal: false,
    tempAvatarUrl: '',
    tempNickname: '',
    saveLoading: false,
    stats: {
      total: 0,
      wins: 0,
      winRate: '0%'
    },
    recentRecord: null,
    menuItems: [
      { id: 'records', title: '比赛记录', icon: '📜', path: '/pages/records/records' },
      { id: 'rules', title: '游戏规则', icon: '📖', path: '/pages/rules/rules' },
      { id: 'feedback', title: '意见反馈', icon: '💬', type: 'feedback' }
    ]
  },

  onShow() {
    this.getUserInfo();
    this.fetchUserStats();
  },

  getUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo: userInfo });
    }
  },

  // --- Edit Profile Logic ---
  onEditProfile() {
    this.setData({
      showEditModal: true,
      tempAvatarUrl: this.data.userInfo?.avatarUrl || '',
      tempNickname: this.data.userInfo?.nickName || ''
    });
  },

  closeEditModal() {
    this.setData({ showEditModal: false });
  },

  onChooseAvatar(e) {
    this.setData({ tempAvatarUrl: e.detail.avatarUrl });
  },

  onNicknameChange(e) {
    this.setData({ tempNickname: e.detail.value });
  },

  async saveProfile() {
    const { tempAvatarUrl, tempNickname, userInfo } = this.data;
    if (!tempAvatarUrl || !tempNickname) {
      wx.showToast({ title: '请完善信息', icon: 'none' });
      return;
    }

    this.setData({ saveLoading: true });
    try {
      // 1. 安全审核
      const secRes = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'securityCheck', content: tempNickname }
      });
      if (secRes.result && !secRes.result.isSafe) {
        wx.showModal({ title: '提醒', content: '昵称包含敏感词', showCancel: false });
        this.setData({ saveLoading: false });
        return;
      }

      // 2. 上传头像 (如果是新选的临时路径)
      let finalAvatarUrl = tempAvatarUrl;
      if (tempAvatarUrl.startsWith('http://tmp/') || tempAvatarUrl.startsWith('wxfile://')) {
        const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 1000)}.png`;
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: tempAvatarUrl
        });
        finalAvatarUrl = uploadRes.fileID;
      }

      // 3. 更新本地缓存
      const newUserInfo = Object.assign({}, userInfo, {
        nickName: tempNickname,
        avatarUrl: finalAvatarUrl
      });
      wx.setStorageSync('userInfo', newUserInfo);

      this.setData({
        userInfo: newUserInfo,
        showEditModal: false,
        saveLoading: false
      });
      wx.showToast({ title: '修改成功', icon: 'success' });
    } catch (e) {
      console.error('Save profile failed', e);
      wx.showToast({ title: '保存失败', icon: 'none' });
      this.setData({ saveLoading: false });
    }
  },

  async fetchUserStats() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'getUserStats' }
      });

      if (res.result && res.result.success && res.result.stats) {
        this.setData({
          stats: res.result.stats,
          recentRecord: res.result.recentRecord || null
        });
      }
    } catch (e) {
      console.error('Fetch stats failed', e);
    }
  },

  onTapMenuItem(e) {
    const { path, type } = e.currentTarget.dataset;
    if (type === 'feedback') {
      wx.navigateTo({ url: '/pages/feedback/feedback' });
    } else if (path) {
      wx.navigateTo({ url: path });
    }
  },

  onTapRecent() {
    if (this.data.recentRecord) {
      wx.navigateTo({
        url: `/pages/recordDetail/recordDetail?id=${this.data.recentRecord._id}`
      });
    }
  }
});