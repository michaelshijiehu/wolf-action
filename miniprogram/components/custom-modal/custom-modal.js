/**
 * 自定义弹窗组件
 * 支持自定义标题、内容、按钮文字
 */
Component({
  properties: {
    // 是否显示弹窗
    show: {
      type: Boolean,
      value: false
    },
    // 标题
    title: {
      type: String,
      value: ''
    },
    // 内容文字
    content: {
      type: String,
      value: ''
    },
    // 是否显示取消按钮
    showCancel: {
      type: Boolean,
      value: true
    },
    // 取消按钮文字
    cancelText: {
      type: String,
      value: '取消'
    },
    // 确认按钮文字
    confirmText: {
      type: String,
      value: '确定'
    },
    // 确认按钮样式类名
    confirmClass: {
      type: String,
      value: ''
    },
    // 点击遮罩是否关闭
    maskClosable: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    /**
     * 阻止事件冒泡
     */
    preventBubble() {},

    /**
     * 阻止滚动穿透
     */
    preventMove() {},

    /**
     * 点击遮罩
     */
    onMaskTap() {
      if (this.properties.maskClosable) {
        this.triggerEvent('cancel');
      }
    },

    /**
     * 点击取消
     */
    onCancel() {
      this.triggerEvent('cancel');
    },

    /**
     * 点击确认
     */
    onConfirm() {
      this.triggerEvent('confirm');
    }
  }
});
