/**
 * 头像上传组件
 * 封装微信头像选择能力，提供统一的头像上传体验
 */
Component({
  properties: {
    // 当前头像URL
    avatarUrl: {
      type: String,
      value: ''
    },
    // 默认头像
    defaultAvatar: {
      type: String,
      value: '/images/icons/avatar.png'
    },
    // 头像大小：small, medium, large
    size: {
      type: String,
      value: 'large'
    },
    // 是否显示提示文字
    showTip: {
      type: Boolean,
      value: true
    },
    // 提示文字
    tip: {
      type: String,
      value: '点击设置'
    },
    // 是否显示编辑角标
    showEdit: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    /**
     * 选择头像回调
     */
    onChooseAvatar(e) {
      const { avatarUrl } = e.detail;
      this.triggerEvent('change', { avatarUrl });
    }
  }
});
