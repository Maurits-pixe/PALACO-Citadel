export function canReadTask(membership, task, userId) {
  if (!membership || !task) return false;
  if (String(membership.team_id) !== String(task.team_id)) return false;
  if (Number(task.clearance_level) > Number(membership.clearance_level)) return false;
  return membership.role === 'commander'
    || String(task.assigned_to) === String(userId)
    || String(task.created_by) === String(userId);
}

export function canUpdateTask(membership, task, userId) {
  if (!canReadTask(membership, task, userId)) return false;
  return membership.role === 'commander'
    || String(task.assigned_to) === String(userId);
}

export function canAccessChannel(membership, channel, channelMembership) {
  return Boolean(
    membership
    && channel
    && channelMembership
    && String(membership.team_id) === String(channel.team_id)
    && Number(membership.clearance_level) >= Number(channel.clearance_level)
    && String(channelMembership.channel_id) === String(channel.id)
  );
}
