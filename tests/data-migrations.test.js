const test = require('node:test');
const assert = require('node:assert/strict');
const { removeLegacyDemoDeadlines } = require('../src/shared/data-migrations');

test('旧版示例 DDL 会随示例里程碑一起被识别并移除', () => {
  const createdAt = '2026-10-10T03:27:26.610Z';
  const source = {
    version: 9,
    deadlines: [
      { id: 'a', title: '论文初稿交给导师', kind: 'deadline', createdAt },
      { id: 'b', title: '数据集申请截止', kind: 'deadline', createdAt },
      { id: 'c', title: '开始规律运动', kind: 'milestone', createdAt },
      { id: 'd', title: '运动', kind: 'milestone', createdAt: 'later' }
    ]
  };

  const migrated = removeLegacyDemoDeadlines(source, 10);
  assert.deepEqual(migrated.deadlines.map((item) => item.id), ['c', 'd']);
  assert.equal(source.deadlines.length, 4);
});

test('同名但由用户后来创建的 DDL 不会被误删', () => {
  const source = {
    version: 9,
    deadlines: [
      { id: 'seed', title: '开始规律运动', kind: 'milestone', createdAt: 'seed-time' },
      { id: 'user', title: '论文初稿交给导师', kind: 'deadline', createdAt: 'user-time' }
    ]
  };

  const migrated = removeLegacyDemoDeadlines(source, 10);
  assert.deepEqual(migrated.deadlines.map((item) => item.id), ['seed', 'user']);
});

test('新版本数据不再重复执行迁移', () => {
  const source = {
    version: 10,
    deadlines: [
      { id: 'a', title: '论文初稿交给导师', kind: 'deadline', createdAt: 'same' },
      { id: 'b', title: '开始规律运动', kind: 'milestone', createdAt: 'same' }
    ]
  };

  assert.equal(removeLegacyDemoDeadlines(source, 10), source);
});
