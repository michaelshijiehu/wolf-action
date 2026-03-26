/**
 * 骨架屏组件
 * 用于数据加载时展示占位效果
 */
Component({
  properties: {
    // 骨架项列表
    list: {
      type: Array,
      value: []
    },
    // 预设布局类型: 'card', 'list', 'avatar-text'
    layout: {
      type: String,
      value: ''
    },
    // 是否开启动画
    animate: {
      type: Boolean,
      value: true
    }
  },

  observers: {
    'layout': function(layout) {
      if (layout && this.data.list.length === 0) {
        this.setData({
          list: this.getPresetLayout(layout)
        });
      }
    }
  },

  methods: {
    /**
     * 获取预设布局
     */
    getPresetLayout(type) {
      const presets = {
        'card': [
          { type: 'card' }
        ],
        'list': [
          { type: 'title' },
          { type: 'text' },
          { type: 'text', width: '80%' }
        ],
        'avatar-text': [
          { type: 'avatar' },
          { type: 'title' },
          { type: 'text' }
        ],
        'profile': [
          { type: 'avatar', margin: '0 auto 30rpx' },
          { type: 'title', margin: '0 auto 20rpx' },
          { type: 'text', width: '60%', margin: '0 auto' }
        ]
      };
      return presets[type] || [];
    }
  }
});
