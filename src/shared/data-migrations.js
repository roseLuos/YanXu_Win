const LEGACY_DEMO_DEADLINE_TITLES = new Set([
  '论文初稿交给导师',
  '数据集申请截止',
  '实验室年度汇报'
]);

function removeLegacyDemoDeadlines(value, currentVersion) {
  if (!value || typeof value !== 'object' || Number(value.version) >= currentVersion || !Array.isArray(value.deadlines)) {
    return value;
  }

  const demoMilestone = value.deadlines.find((item) => (
    item?.kind === 'milestone'
    && item.title === '开始规律运动'
    && typeof item.createdAt === 'string'
  ));
  if (!demoMilestone) return value;

  const deadlines = value.deadlines.filter((item) => !(
    item?.kind === 'deadline'
    && LEGACY_DEMO_DEADLINE_TITLES.has(item.title)
    && item.createdAt === demoMilestone.createdAt
  ));

  return deadlines.length === value.deadlines.length ? value : { ...value, deadlines };
}

module.exports = { removeLegacyDemoDeadlines };
