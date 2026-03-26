const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { flowConfig } = require('./constants');
const { applyUpdates, getAudioQueue, checkContentSecurity } = require('./utils');
const { WOLF_ROLES, getInitialActions } = require('./state');
const phase = require('./engine/phase');

const buildMisc = require('./handlers/misc');
const buildRoom = require('./handlers/room');
const buildActions = require('./handlers/actions');

const nextPhase = (roomId, roomDoc, roomDocId) => phase.nextPhase(db, roomId, roomDoc, roomDocId);
const checkAutoProceedInternal = (roomId, roomDoc, roomDocId) => phase.checkAutoProceedInternal(db, roomId, roomDoc, roomDocId);

exports.main = async (event) => {
  const { type, roomId: eventRoomId } = event;
  const wxCtx = cloud.getWXContext();
  const noRoomNeeded = ['getOpenId', 'getGameRecords', 'getUserStats', 'createRoom', 'securityCheck', 'checkRunningGame'];
  let roomDoc = null; let roomDocId = null;

  if (!noRoomNeeded.includes(type)) {
    if (!eventRoomId) {
      return { success: false, message: '操作失败: 缺少房间ID' };
    }
    const res = await db.collection('game_rooms').where({ roomId: eventRoomId }).get();
    if (res.data.length > 0) {
      roomDoc = res.data[0]; roomDocId = roomDoc._id;
      if (type !== 'nextPhase') {
        roomDoc = await checkAutoProceedInternal(eventRoomId, roomDoc, roomDocId);
      }
    } else {
      return { success: false, message: '操作失败: 房间已解散或不存在' };
    }
  }

  const ctx = {
    cloud,
    db,
    _,
    wxCtx,
    eventRoomId,
    roomDoc,
    roomDocId,
    flowConfig,
    getInitialActions,
    nextPhase,
    applyUpdates,
    checkContentSecurity,
    getAudioQueue,
    WOLF_ROLES
  };

  const acts = {
    ...buildMisc(ctx),
    ...buildRoom(ctx),
    ...buildActions(ctx)
  };

  if (acts[type]) {
    try {
      return await acts[type](event);
    } catch (err) {
      console.error(`[FATAL ERROR] Action ${type} failed:`, err);
      return {
        success: false,
        message: `服务器内部错误: ${err.message || '未知错误'}`
      };
    }
  }
  return { success: false, message: `Unknown type: ${type}` };
};
