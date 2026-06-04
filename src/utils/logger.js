export const logActivity = (req, action, detail = '') => {
    const user = req.user;
    const username = user?.username ?? 'unknown';
    const role = user?.role ?? 'unknown';
    const dinasId = user?.dinasId ?? null;
    const timestamp = new Date().toISOString();
    const detailStr = detail ? ` | ${detail}` : '';
    console.log(`✅ [${timestamp}] [${role.toUpperCase()}] '${username}' (Dinas: ${dinasId}) → ${action}${detailStr}`);
};