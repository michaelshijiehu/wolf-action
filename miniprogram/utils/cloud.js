/**
 * 云函数调用封装
 * 提供统一的云函数调用接口，包含错误处理、重试机制、日志记录
 */

// 云函数名称
const FUNCTION_NAME = 'quickstartFunctions';

// 重试配置
const RETRY_CONFIG = {
  maxRetries: 2,        // 最大重试次数
  retryDelay: 1000,     // 重试延迟(ms)
  timeout: 15000        // 请求超时时间(ms)
};

// 错误码映射
const ERROR_MESSAGES = {
  '-1': '系统繁忙，请稍后重试',
  '-401002': '参数错误',
  '-402002': '登录状态失效，请重新登录',
  '-404001': '云函数不存在',
  '-501001': '数据库操作失败',
  '-502001': '文件操作失败',
  '-503001': '云函数执行错误'
};

// 请求缓存
const requestCache = new Map();
const CACHE_TTL = 3000; // 缓存有效期 3秒

/**
 * 延迟函数
 * @param {number} ms 延迟毫秒数
 * @returns {Promise}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 生成缓存key
 * @param {string} type 请求类型
 * @param {object} data 请求数据
 * @returns {string}
 */
function generateCacheKey(type, data) {
  try {
    return `${type}:${JSON.stringify(data)}`;
  } catch (e) {
    return `${type}:${Date.now()}`;
  }
}

/**
 * 从缓存获取结果
 * @param {string} key 缓存key
 * @returns {object|null}
 */
function getFromCache(key) {
  const cached = requestCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  requestCache.delete(key);
  return null;
}

/**
 * 设置缓存
 * @param {string} key 缓存key
 * @param {object} data 缓存数据
 */
function setToCache(key, data) {
  requestCache.set(key, {
    data,
    timestamp: Date.now()
  });

  // 定期清理过期缓存
  if (requestCache.size > 50) {
    const now = Date.now();
    for (const [k, v] of requestCache.entries()) {
      if (now - v.timestamp >= CACHE_TTL) {
        requestCache.delete(k);
      }
    }
  }
}

/**
 * 获取用户友好的错误信息
 * @param {object} error 错误对象
 * @returns {string}
 */
function getErrorMessage(error) {
  if (error.errMsg) {
    // 检查是否是已知错误码
    for (const [code, msg] of Object.entries(ERROR_MESSAGES)) {
      if (error.errMsg.includes(code)) {
        return msg;
      }
    }
    return error.errMsg;
  }
  if (error.message) {
    return error.message;
  }
  return '操作失败，请稍后重试';
}

/**
 * 记录错误日志
 * @param {string} type 请求类型
 * @param {object} error 错误对象
 * @param {number} attempt 尝试次数
 */
function logError(type, error, attempt) {
  console.error(`[CloudFunction Error] type: ${type}, attempt: ${attempt}`, error);

  // 可选：上报到云端日志
  // wx.reportAnalytics('cloud_function_error', {
  //   type,
  //   error: error.errMsg || error.message,
  //   attempt
  // });
}

/**
 * 调用云函数（带重试和缓存）
 * @param {string} type 请求类型
 * @param {object} data 请求数据
 * @param {object} options 选项
 * @param {boolean} options.useCache 是否使用缓存
 * @param {boolean} options.showLoading 是否显示加载提示
 * @param {string} options.loadingText 加载提示文字
 * @param {boolean} options.showError 是否显示错误提示
 * @returns {Promise<object>}
 */
async function callFunction(type, data = {}, options = {}) {
  const {
    useCache = false,
    showLoading = false,
    loadingText = '加载中...',
    showError = true
  } = options;

  // 检查缓存
  const cacheKey = generateCacheKey(type, data);
  if (useCache) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      console.log(`[CloudFunction] Cache hit: ${type}`);
      return cached;
    }
  }

  // 显示加载提示
  if (showLoading) {
    wx.showLoading({ title: loadingText, mask: true });
  }

  let lastError = null;

  // 重试循环
  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const result = await wx.cloud.callFunction({
        name: FUNCTION_NAME,
        data: { type, ...data }
      });

      // 隐藏加载提示
      if (showLoading) {
        wx.hideLoading();
      }

      // 检查返回结果
      if (result.result) {
        // 设置缓存
        if (useCache && result.result.success) {
          setToCache(cacheKey, result.result);
        }
        return result.result;
      }

      throw new Error('返回结果为空');
    } catch (error) {
      lastError = error;
      logError(type, error, attempt);

      // 判断是否需要重试
      const errMsg = error.errMsg || '';
      const shouldRetry = attempt < RETRY_CONFIG.maxRetries &&
        !errMsg.includes('-402002') && // 登录失效不重试
        !errMsg.includes('-401002');   // 参数错误不重试

      if (shouldRetry) {
        console.log(`[CloudFunction] Retrying (${attempt}/${RETRY_CONFIG.maxRetries})...`);
        await delay(RETRY_CONFIG.retryDelay * attempt);
      } else {
        break;
      }
    }
  }

  // 隐藏加载提示
  if (showLoading) {
    wx.hideLoading();
  }

  // 显示错误提示
  const errorMessage = getErrorMessage(lastError);
  if (showError) {
    wx.showToast({
      title: errorMessage,
      icon: 'none',
      duration: 2000
    });
  }

  // 返回错误结果
  return {
    success: false,
    message: errorMessage,
    error: lastError
  };
}

/**
 * 批量调用云函数
 * @param {Array} requests 请求列表 [{type, data}]
 * @returns {Promise<Array>}
 */
async function batchCall(requests) {
  return Promise.all(
    requests.map(req => callFunction(req.type, req.data, { showError: false }))
  );
}

/**
 * 清除缓存
 */
function clearCache() {
  requestCache.clear();
}

/**
 * 清除特定类型的缓存
 * @param {string} type 请求类型
 */
function clearCacheByType(type) {
  for (const key of requestCache.keys()) {
    if (key.startsWith(type + ':')) {
      requestCache.delete(key);
    }
  }
}

module.exports = {
  callFunction,
  batchCall,
  clearCache,
  clearCacheByType,
  getErrorMessage,
  FUNCTION_NAME,
  RETRY_CONFIG
};
