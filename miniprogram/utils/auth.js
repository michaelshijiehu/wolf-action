/**
 * 用户认证相关工具函数
 */

const storage = require('./storage');
const cloud = require('./cloud');

/**
 * 获取用户信息
 * @returns {object|null}
 */
function getUserInfo() {
  return storage.get(storage.STORAGE_KEYS.USER_INFO);
}

/**
 * 设置用户信息
 * @param {object} userInfo 用户信息
 */
function setUserInfo(userInfo) {
  return storage.set(storage.STORAGE_KEYS.USER_INFO, userInfo);
}

/**
 * 检查用户是否已设置信息
 * @returns {boolean}
 */
function isUserInfoComplete() {
  const userInfo = getUserInfo();
  return !!(userInfo && userInfo.nickName && userInfo.avatarUrl);
}

/**
 * 清除用户信息
 */
function clearUserInfo() {
  storage.remove(storage.STORAGE_KEYS.USER_INFO);
}

/**
 * 获取用户 OpenID
 * @returns {Promise<string>}
 */
async function getOpenId() {
  try {
    const result = await cloud.callFunction('getOpenId', {}, { useCache: true });
    return result.openid || '';
  } catch (e) {
    console.error('[Auth] Get OpenID failed:', e);
    return '';
  }
}

/**
 * 上传头像到云存储
 * @param {string} filePath 本地文件路径
 * @returns {Promise<string>} 云存储文件ID
 */
async function uploadAvatar(filePath) {
  const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 1000)}.png`;
  try {
    const result = await wx.cloud.uploadFile({
      cloudPath,
      filePath
    });
    return result.fileID;
  } catch (e) {
    console.error('[Auth] Upload avatar failed:', e);
    throw new Error('头像上传失败');
  }
}

/**
 * 内容安全检测
 * @param {string} content 要检测的内容
 * @returns {Promise<boolean>} 是否安全
 */
async function checkContentSecurity(content) {
  try {
    const result = await cloud.callFunction('securityCheck', { content }, { showError: false });
    return result && result.isSafe;
  } catch (e) {
    console.error('[Auth] Content security check failed:', e);
    // 检测失败时默认放行，避免影响用户体验
    return true;
  }
}

/**
 * 完善用户信息流程
 * @param {object} options
 * @param {string} options.avatarUrl 头像URL（可能是临时路径）
 * @param {string} options.nickName 昵称
 * @returns {Promise<object>} 用户信息
 */
async function completeUserInfo({ avatarUrl, nickName }) {
  // 1. 上传头像（如果是临时路径）
  let finalAvatarUrl = avatarUrl;
  if (avatarUrl.startsWith('http://tmp/') || avatarUrl.startsWith('wxfile://')) {
    finalAvatarUrl = await uploadAvatar(avatarUrl);
  }

  // 2. 构建用户信息
  const userInfo = {
    nickName,
    avatarUrl: finalAvatarUrl,
    updatedAt: Date.now()
  };

  // 3. 保存到本地
  setUserInfo(userInfo);

  return userInfo;
}

module.exports = {
  getUserInfo,
  setUserInfo,
  isUserInfoComplete,
  clearUserInfo,
  getOpenId,
  uploadAvatar,
  checkContentSecurity,
  completeUserInfo
};
