export async function writeAudit(pool, {
  userId = null,
  action,
  targetType = null,
  targetId = null,
  ipAddress = null,
  details = {}
}) {
  await pool.query(
    `INSERT INTO audit_logs
      (user_id, action, target_type, target_id, ip_address, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [userId, action, targetType, targetId, ipAddress, JSON.stringify(details)]
  );
}
