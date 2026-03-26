/**
 * 工具模块入口
 * 统一导出所有工具函数
 */

const cloud = require('./cloud');
const storage = require('./storage');
const auth = require('./auth');
const util = require('./util');
const errorHandler = require('./errorHandler');

module.exports = {
  cloud,
  storage,
  auth,
  util,
  errorHandler
};
