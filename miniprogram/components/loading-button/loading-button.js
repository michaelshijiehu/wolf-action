/**
 * 带加载状态的按钮组件
 * 统一按钮加载状态样式，支持多种主题
 */
Component({
  properties: {
    // 按钮文字
    text: {
      type: String,
      value: '按钮'
    },
    // 加载中文字
    loadingText: {
      type: String,
      value: '加载中...'
    },
    // 是否加载中
    loading: {
      type: Boolean,
      value: false
    },
    // 是否禁用
    disabled: {
      type: Boolean,
      value: false
    },
    // 自定义样式类
    customClass: {
      type: String,
      value: 'primary'
    },
    // 悬浮样式类
    hoverClass: {
      type: String,
      value: 'button-hover'
    },
    // 表单类型
    formType: {
      type: String,
      value: ''
    },
    // 开放能力
    openType: {
      type: String,
      value: ''
    }
  },

  methods: {
    onTap(e) {
      if (!this.properties.loading && !this.properties.disabled) {
        this.triggerEvent('tap', e.detail);
      }
    },

    onGetUserInfo(e) {
      this.triggerEvent('getuserinfo', e.detail);
    },

    onChooseAvatar(e) {
      this.triggerEvent('chooseavatar', e.detail);
    },

    onContact(e) {
      this.triggerEvent('contact', e.detail);
    },

    onGetPhoneNumber(e) {
      this.triggerEvent('getphonenumber', e.detail);
    },

    onError(e) {
      this.triggerEvent('error', e.detail);
    },

    onOpenSetting(e) {
      this.triggerEvent('opensetting', e.detail);
    },

    onLaunchApp(e) {
      this.triggerEvent('launchapp', e.detail);
    }
  }
});
