const getMe = (ctx) => ctx.roomDoc.players.find(p => p.openid === ctx.wxCtx.OPENID);

const requireAlive = (me, message) => {
  if (!me || !me.is_alive) return { ok: false, res: { success: false, message: message || '您已出局或未入座' } };
  return { ok: true };
};

const requireRole = (me, role, message) => {
  if (!me || me.role !== role) return { ok: false, res: { success: false, message: message || '身份不匹配' } };
  return { ok: true };
};

const requireAliveRole = (me, role, roleMessage, aliveMessage) => {
  const r = requireRole(me, role, roleMessage);
  if (!r.ok) return r;
  return requireAlive(me, aliveMessage);
};

const requireTargetAlive = (ctx, seat, message) => {
  const target = ctx.roomDoc.players.find(p => p.seat === seat);
  if (!target || !target.is_alive) return { ok: false, res: { success: false, message: message || '目标已出局' } };
  return { ok: true, target };
};

module.exports = { getMe, requireAlive, requireRole, requireAliveRole, requireTargetAlive };
