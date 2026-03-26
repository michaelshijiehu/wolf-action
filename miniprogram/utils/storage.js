/**
 * 本地存储封装
 * 提供统一的本地存储接口，支持过期时间、加密等功能
 */

// 存储键名前缀
const STORAGE_PREFIX = 'wolf_action_';

// 默认过期时间（毫秒）
const DEFAULT_EXPIRE = 7 * 24 * 60 * 60 * 1000; // 7天

/**
 * 获取完整的存储键名
 * @param {string} key 原始键名
 * @returns {string}
 */
function getFullKey(key) {
  return STORAGE_PREFIX + key;
}

/**
 * 设置存储
 * @param {string} key 键名
 * @param {any} value 值
 * @param {number} expire 过期时间（毫秒），0表示永不过期
 */
function set(key, value, expire = DEFAULT_EXPIRE) {
  try {
    const data = {
      value,
      timestamp: Date.now(),
      expire: expire > 0 ? expire : 0
    };
    wx.setStorageSync(getFullKey(key), data);
    return true;
  } catch (e) {
    console.error('[Storage] Set failed:', key, e);
    return false;
  }
}

/**
 * 获取存储
 * @param {string} key 键名
 * @param {any} defaultValue 默认值
 * @returns {any}
 */
function get(key, defaultValue = null) {
  try {
    const data = wx.getStorageSync(getFullKey(key));
    if (!data) return defaultValue;

    // 检查是否过期
    if (data.expire && data.expire > 0) {
      const now = Date.now();
      if (now - data.timestamp > data.expire) {
        remove(key);
        return defaultValue;
      }
    }

    return data.value;
  } catch (e) {
    console.error('[Storage] Get failed:', key, e);
    return defaultValue;
  }
}

/**
 * 移除存储
 * @param {string} key 键名
 */
function remove(key) {
  try {
    wx.removeStorageSync(getFullKey(key));
    return true;
  } catch (e) {
    console.error('[Storage] Remove failed:', key, e);
    return false;
  }
}

/**
 * 清除所有带前缀的存储
 */
function clearAll() {
  try {
    const res = wx.getStorageInfoSync();
    res.keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        wx.removeStorageSync(key);
      }
    });
    return true;
  } catch (e) {
    console.error('[Storage] Clear all failed:', e);
    return false;
  }
}

/**
 * 检查存储是否存在
 * @param {string} key 键名
 * @returns {boolean}
 */
function has(key) {
  try {
    const data = wx.getStorageSync(getFullKey(key));
    if (!data) return false;

    // 检查是否过期
    if (data.expire && data.expire > 0) {
      const now = Date.now();
      if (now - data.timestamp > data.expire) {
        remove(key);
        return false;
      }
    }

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 获取存储信息
 * @returns {object}
 */
function getInfo() {
  try {
    const info = wx.getStorageInfoSync();
    const ourKeys = info.keys.filter(key => key.startsWith(STORAGE_PREFIX));
    return {
      ...info,
      ourKeys,
      ourKeyCount: ourKeys.length
    };
  } catch (e) {
    return { keys: [], ourKeys: [], ourKeyCount: 0 };
  }
}

// 预定义的存储键
const STORAGE_KEYS = {
  USER_INFO: 'user_info',
  LAST_ROOM_ID: 'last_room_id',
  GAME_RECORDS: 'game_records',
  PLAYER_MARKS: 'player_marks', // 后面加 _roomId
  SETTINGS: 'settings',
  CACHE_PREFIX: 'cache_'
};

module.exports = {
  set,
  get,
  remove,
  clearAll,
  has,
  getInfo,
  STORAGE_KEYS,
  STORAGE_PREFIX
};
