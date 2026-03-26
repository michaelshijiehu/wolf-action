const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

// 每批次删除的文档数量
const BATCH_SIZE = 100;

exports.main = async (event, context) => {
  try {
    const now = new Date();
    let hasMore = true;
    let deleteCount = 0;

    while (hasMore) {
      // 查询 expireAt 小于当前时间，或者没有 expireAt 但 created_at 超过 2 小时的房间
      const twoHoursAgo = new Date(now.getTime() - 7200000);
      const queryResult = await db.collection('game_rooms')
        .where(_.or([
          { expireAt: _.lt(now) },
          { 
            expireAt: _.exists(false),
            created_at: _.lt(twoHoursAgo)
          }
        ]))
        .limit(BATCH_SIZE)
        .get();

      const expiredRooms = queryResult.data;

      if (expiredRooms.length > 0) {
        const deletePromises = expiredRooms.map(room => {
          return db.collection('game_rooms').doc(room._id).remove()
            .catch(err => console.error(`Failed to delete room ${room._id}:`, err));
        });
        await Promise.all(deletePromises);
        deleteCount += expiredRooms.length;
        console.log(`Successfully processed ${expiredRooms.length} rooms in this batch.`);
      }

      if (expiredRooms.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    console.log(`Cleanup complete. Total deleted: ${deleteCount} rooms.`);
    return {
      success: true,
      deletedCount: deleteCount
    };

  } catch (e) {
    console.error('[cleanExpiredRooms] Error during cleanup:', e);
    return {
      success: false,
      error: e
    };
  }
};
