/**
 * 全局错误处理器
 * 捕获和处理各类错误，提供用户友好的错误提示
 */

const cloud = require('./cloud');

// 错误类型枚举
const ERROR_TYPES = {
  NETWORK: 'NETWORK',
  CLOUD_FUNCTION: 'CLOUD_FUNCTION',
  DATABASE: 'DATABASE',
  BUSINESS: 'BUSINESS',
  UNKNOWN: 'UNKNOWN'
};

// 错误级别
const ERROR_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  FATAL: 'fatal'
};

// 是否开启错误上报
let enableReport = true;

// 错误队列（用于批量上报）
const errorQueue = [];
const REPORT_INTERVAL = 30000; // 30秒上报一次
let reportTimer = null;

/**
 * 初始化错误处理器
 */
function init() {
  // 启动定期上报
  startReportTimer();

  // 监听小程序错误
  if (typeof App !== 'undefined') {
    const originalApp = App;
    App = function(config) {
      const originalOnError = config.onError;
      config.onError = function(err) {
        handleError(err, ERROR_TYPES.UNKNOWN, ERROR_LEVELS.ERROR);
        if (originalOnError) {
          originalOnError.call(this, err);
        }
      };
      return originalApp(config);
    };
  }
}

/**
 * 启动上报定时器
 */
function startReportTimer() {
  if (reportTimer) clearInterval(reportTimer);
  reportTimer = setInterval(() => {
    flushErrorQueue();
  }, REPORT_INTERVAL);
}

/**
 * 刷新错误队列，批量上报
 */
async function flushErrorQueue() {
  if (errorQueue.length === 0) return;

  const errors = [...errorQueue];
  errorQueue.length = 0;

  try {
    // 这里可以上报到云端日志服务
    console.log('[ErrorHandler] Flushing errors:', errors.length);
  } catch (e) {
    console.error('[ErrorHandler] Flush failed:', e);
  }
}

/**
 * 处理错误
 * @param {Error|string} error 错误对象或消息
 * @param {string} type 错误类型
 * @param {string} level 错误级别
 * @param {object} context 上下文信息
 */
function handleError(error, type = ERROR_TYPES.UNKNOWN, level = ERROR_LEVELS.ERROR, context = {}) {
  const errorInfo = {
    type,
    level,
    message: error.message || String(error),
    stack: error.stack || '',
    context,
    timestamp: Date.now(),
    page: getCurrentPageRoute()
  };

  // 控制台输出
  logError(errorInfo);

  // 加入上报队列
  if (enableReport) {
    errorQueue.push(errorInfo);
    if (errorQueue.length >= 10) {
      flushErrorQueue();
    }
  }

  return errorInfo;
}

/**
 * 控制台日志输出
 * @param {object} errorInfo 错误信息
 */
function logError(errorInfo) {
  const prefix = `[ErrorHandler][${errorInfo.type}][${errorInfo.level}]`;
  const timestamp = new Date(errorInfo.timestamp).toISOString();

  switch (errorInfo.level) {
    case ERROR_LEVELS.INFO:
      console.info(prefix, timestamp, errorInfo.message);
      break;
    case ERROR_LEVELS.WARNING:
      console.warn(prefix, timestamp, errorInfo.message);
      break;
    case ERROR_LEVELS.FATAL:
    case ERROR_LEVELS.ERROR:
    default:
      console.error(prefix, timestamp, errorInfo.message, errorInfo.stack);
      break;
  }
}

/**
 * 获取当前页面路由
 */
function getCurrentPageRoute() {
  try {
    const pages = getCurrentPages();
    if (pages.length > 0) {
      return pages[pages.length - 1].route;
    }
  } catch (e) {
    // ignore
  }
  return 'unknown';
}

/**
 * 显示用户友好的错误提示
 * @param {object} errorInfo 错误信息
 * @param {object} options 选项
 */
function showErrorToast(errorInfo, options = {}) {
  const { title = '操作失败', duration = 2000 } = options;

  wx.showToast({
    title: errorInfo.message || title,
    icon: 'none',
    duration
  });
}

/**
 * 显示错误弹窗
 * @param {object} errorInfo 错误信息
 * @param {object} options 选项
 */
function showErrorModal(errorInfo, options = {}) {
  const {
    title = '出错了',
    showCancel = false,
    confirmText = '知道了'
  } = options;

  return new Promise((resolve) => {
    wx.showModal({
      title,
      content: errorInfo.message || '操作失败，请稍后重试',
      showCancel,
      confirmText,
      success: (res) => {
        resolve(res.confirm);
      },
      fail: () => {
        resolve(false);
      }
    });
  });
}

/**
 * 包装异步函数，自动处理错误
 * @param {Function} fn 异步函数
 * @param {object} options 选项
 */
function wrapAsync(fn, options = {}) {
  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      const errorInfo = handleError(error, options.type, options.level, options.context);

      if (options.showToast !== false) {
        showErrorToast(errorInfo, options.toastOptions);
      }

      if (options.onFail) {
        options.onFail(errorInfo);
      }

      return { success: false, error: errorInfo };
    }
  };
}

/**
 * 设置是否开启错误上报
 * @param {boolean} enabled 是否开启
 */
function setReportEnabled(enabled) {
  enableReport = enabled;
}

module.exports = {
  init,
  handleError,
  showErrorToast,
  showErrorModal,
  wrapAsync,
  setReportEnabled,
  flushErrorQueue,
  ERROR_TYPES,
  ERROR_LEVELS
};
