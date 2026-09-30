// 任务分组只拥有展示成员和顺序；保留 tasks 与自动化表，避免清理分类时丢失会话及调度。
// 旧迁移参与校验，必须追加退役迁移，不能修改 schema-v1 的历史 SQL。
export const TASK_GROUP_RETIREMENT_MIGRATION_SQL = `
  DROP TABLE IF EXISTS task_group_members;
  DROP TABLE IF EXISTS task_group_view_node_orders;
  DROP TABLE IF EXISTS task_group_workspace_bootstraps;
  DROP TABLE IF EXISTS task_groups;
`;
