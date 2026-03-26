/**
 * 状态同步优化模块
 * 提供数据差异比对和批量更新功能
 */

/**
 * 深度比较两个值是否相等
 * @param {any} a 值A
 * @param {any} b 值B
 * @returns {boolean}
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => deepEqual(a[key], b[key]));
  }

  return a === b;
}

/**
 * 比较两个状态对象，返回变化的字段
 * @param {object} oldState 旧状态
 * @param {object} newState 新状态
 * @param {Array} watchKeys 需要监听的key列表
 * @returns {object} 变化的字段
 */
function getChangedFields(oldState, newState, watchKeys) {
  const changes = {};

  watchKeys.forEach(key => {
    const oldVal = oldState[key];
    const newVal = newState[key];

    if (!deepEqual(oldVal, newVal)) {
      changes[key] = newVal;
    }
  });

  return changes;
}

/**
 * 批量更新状态，避免多次setData
 * @param {Page} page 页面实例
 * @param {object} updates 更新对象
 * @param {object} options 选项
 * @param {number} options.throttle 节流时间(ms)
 */
let pendingUpdates = null;
let updateTimer = null;

function batchUpdate(page, updates, options = {}) {
  const { throttle = 16 } = options;

  // 合并待更新数据
  if (!pendingUpdates) {
    pendingUpdates = { ...updates };
  } else {
    Object.assign(pendingUpdates, updates);
  }

  // 节流更新
  if (updateTimer) {
    clearTimeout(updateTimer);
  }

  updateTimer = setTimeout(() => {
    if (pendingUpdates && Object.keys(pendingUpdates).length > 0) {
      page.setData(pendingUpdates);
      pendingUpdates = null;
    }
    updateTimer = null;
  }, throttle);
}

/**
 * 立即执行待处理的更新
 * @param {Page} page 页面实例
 */
function flushUpdates(page) {
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }

  if (pendingUpdates && Object.keys(pendingUpdates).length > 0) {
    page.setData(pendingUpdates);
    pendingUpdates = null;
  }
}

/**
 * 创建状态管理器
 * @param {Page} page 页面实例
 * @returns {object} 状态管理器
 */
function createStateManager(page) {
  let lastState = {};

  return {
    /**
     * 更新状态
     * @param {object} newState 新状态
     * @param {Array} watchKeys 需要监听的key
     */
    update(newState, watchKeys) {
      const changes = getChangedFields(lastState, newState, watchKeys);

      if (Object.keys(changes).length > 0) {
        batchUpdate(page, changes);
        lastState = { ...lastState, ...changes };
      }
    },

    /**
     * 强制更新（忽略差异检测）
     * @param {object} updates 更新对象
     */
    forceUpdate(updates) {
      page.setData(updates);
      Object.assign(lastState, updates);
    },

    /**
     * 刷新所有待处理更新
     */
    flush() {
      flushUpdates(page);
    },

    /**
     * 重置状态
     */
    reset() {
      lastState = {};
      if (updateTimer) {
        clearTimeout(updateTimer);
        updateTimer = null;
      }
      pendingUpdates = null;
    }
  };
}

module.exports = {
  deepEqual,
  getChangedFields,
  batchUpdate,
  flushUpdates,
  createStateManager
};
