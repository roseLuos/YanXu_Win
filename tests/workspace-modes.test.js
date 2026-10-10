const test = require('node:test');
const assert = require('node:assert/strict');
const { WORKSPACE_MODES, WORKSPACE_MODE_KEYS, normalizeWorkspaceMode } = require('../src/shared/workspace-modes');

test('提供三种完整且唯一的工作区模式', () => {
  assert.deepEqual(WORKSPACE_MODE_KEYS, ['research', 'work', 'study']);
  assert.equal(new Set(WORKSPACE_MODE_KEYS.map((key) => WORKSPACE_MODES[key].label)).size, 3);
  assert.equal(new Set(WORKSPACE_MODE_KEYS.map((key) => WORKSPACE_MODES[key].icon)).size, 3);
  for (const key of WORKSPACE_MODE_KEYS) {
    for (const field of ['label', 'short', 'icon', 'quickPlaceholder', 'weekDuration', 'duration', 'session', 'attendance']) {
      assert.ok(WORKSPACE_MODES[key][field], `${key}.${field} 不应为空`);
    }
  }
});

test('未知模式安全回退到科研模式', () => {
  assert.equal(normalizeWorkspaceMode('work'), 'work');
  assert.equal(normalizeWorkspaceMode('unknown'), 'research');
  assert.equal(normalizeWorkspaceMode(null), 'research');
});
