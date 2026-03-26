// pages/usercenter/usercenter.js
const { cloud, auth, util } = require('../../utils/index');
const { formatTime } = util;

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
    ],
    loading: true
  },

  onShow() {
    this.getUserInfo();
    this.fetchUserStats();
  },

  /**
   * 获取用户信息
   */
  getUserInfo() {
    const userInfo = auth.getUserInfo();
    this.setData({ userInfo });
  },

  // --- 编辑个人信息 ---
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

  /**
   * 保存个人信息
   */
  async saveProfile() {
    const { tempAvatarUrl, tempNickname, userInfo } = this.data;

    if (!tempAvatarUrl || !tempNickname) {
      wx.showToast({ title: '请完善信息', icon: 'none' });
      return;
    }

    this.setData({ saveLoading: true });

    try {
      // 使用封装的 auth 模块完成用户信息更新
      const newUserInfo = await auth.completeUserInfo({
        avatarUrl: tempAvatarUrl,
        nickName: tempNickname
      });

      this.setData({
        userInfo: newUserInfo,
        showEditModal: false,
        saveLoading: false
      });

      wx.showToast({ title: '修改成功', icon: 'success' });
    } catch (err) {
      this.setData({ saveLoading: false });
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
  },

  /**
   * 获取用户统计数据
   */
  async fetchUserStats() {
    this.setData({ loading: true });

    const result = await cloud.callFunction('getUserStats', {}, {
      useCache: true,
      showError: false
    });

    if (result && result.success && result.stats) {
      this.setData({
        stats: result.stats,
        recentRecord: result.recentRecord || null,
        loading: false
      });
    } else {
      this.setData({ loading: false });
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
  },

  /**
   * 格式化时间（供wxs使用）
   */
  formatRecordTime(dateStr) {
    return formatTime(dateStr, 'MM月DD日 HH:mm');
  }
});
