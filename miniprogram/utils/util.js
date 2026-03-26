/**
 * 通用工具函数
 */

/**
 * 防抖函数
 * @param {Function} fn 要防抖的函数
 * @param {number} delay 延迟时间（毫秒）
 * @returns {Function}
 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * 节流函数
 * @param {Function} fn 要节流的函数
 * @param {number} interval 间隔时间（毫秒）
 * @returns {Function}
 */
function throttle(fn, interval = 300) {
  let lastTime = 0;
  let timer = null;
  return function (...args) {
    const now = Date.now();
    const remaining = interval - (now - lastTime);

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      lastTime = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastTime = Date.now();
        timer = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

/**
 * 格式化时间
 * @param {Date|string|number} date 日期
 * @param {string} format 格式字符串
 * @returns {string}
 */
function formatTime(date, format = 'YYYY-MM-DD HH:mm:ss') {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  const second = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hour)
    .replace('mm', minute)
    .replace('ss', second);
}

/**
 * 格式化游戏时长
 * @param {number} startTime 开始时间戳
 * @returns {string}
 */
function formatGameDuration(startTime) {
  const duration = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * 生成随机房间号
 * @returns {string}
 */
function generateRoomId() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * 深拷贝
 * @param {any} obj 要拷贝的对象
 * @returns {any}
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }

  const cloned = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * 判断是否为空对象
 * @param {object} obj
 * @returns {boolean}
 */
function isEmptyObject(obj) {
  return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
}

/**
 * 安全地获取嵌套对象属性
 * @param {object} obj 对象
 * @param {string} path 属性路径，如 'a.b.c'
 * @param {any} defaultValue 默认值
 * @returns {any}
 */
function getNestedValue(obj, path, defaultValue = undefined) {
  const keys = path.split('.');
  let result = obj;

  for (const key of keys) {
    if (result === null || result === undefined) {
      return defaultValue;
    }
    result = result[key];
  }

  return result !== undefined ? result : defaultValue;
}

/**
 * 数组去重
 * @param {Array} arr 数组
 * @param {string} key 对象数组的去重key
 * @returns {Array}
 */
function unique(arr, key = null) {
  if (!key) {
    return [...new Set(arr)];
  }
  const seen = new Set();
  return arr.filter(item => {
    const val = item[key];
    if (seen.has(val)) {
      return false;
    }
    seen.add(val);
    return true;
  });
}

/**
 * 延迟执行
 * @param {number} ms 毫秒数
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试函数
 * @param {Function} fn 要重试的函数
 * @param {object} options 选项
 * @param {number} options.maxRetries 最大重试次数
 * @param {number} options.retryDelay 重试延迟
 * @returns {Promise}
 */
async function retry(fn, options = {}) {
  const { maxRetries = 3, retryDelay = 1000 } = options;
  let lastError;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < maxRetries) {
        await sleep(retryDelay * (i + 1));
      }
    }
  }

  throw lastError;
}

module.exports = {
  debounce,
  throttle,
  formatTime,
  formatGameDuration,
  generateRoomId,
  deepClone,
  isEmptyObject,
  getNestedValue,
  unique,
  sleep,
  retry
};
