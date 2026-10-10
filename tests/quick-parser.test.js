const test = require('node:test');
const assert = require('node:assert/strict');
const { parse, mondayOf, startOfDay } = require('../src/shared/quick-parser');

const now = new Date(2026, 8, 7, 10, 0, 0);

test('没有日期时进入待安排', () => {
  const result = parse('整理实验数据', now);
  assert.equal(result.title, '整理实验数据');
  assert.equal(result.scheduleKind, 'inbox');
  assert.equal(result.start, null);
});

test('解析明天下午的固定时间', () => {
  const result = parse('明天下午2点开会', now);
  const date = new Date(result.start);
  assert.equal(result.title, '开会');
  assert.equal(result.scheduleKind, 'fixed');
  assert.equal(date.getDate(), 8);
  assert.equal(date.getHours(), 14);
});

test('解析下周五和半点', () => {
  const result = parse('下周五下午2点半开组会', now);
  const date = new Date(result.start);
  assert.equal(result.title, '开组会');
  assert.equal(date.getDay(), 5);
  assert.equal(date.getDate(), 18);
  assert.equal(date.getHours(), 14);
  assert.equal(date.getMinutes(), 30);
});

test('只写时间时使用今天', () => {
  const result = parse('下午3点整理报销材料', now);
  const date = new Date(result.start);
  assert.equal(result.title, '整理报销材料');
  assert.equal(date.getDate(), 7);
  assert.equal(date.getHours(), 15);
});

test('无年份的已过日期顺延到下一年', () => {
  const result = parse('1月12日提交摘要', now);
  const date = new Date(result.start);
  assert.equal(date.getFullYear(), 2027);
  assert.equal(date.getMonth(), 0);
  assert.equal(date.getDate(), 12);
});

test('周一是一周起点', () => {
  assert.equal(mondayOf(new Date(2026, 8, 13)).getDate(), 7);
});

test('日期输入按本地日期解析', () => {
  const date = startOfDay('2026-10-10');
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 9);
  assert.equal(date.getDate(), 10);
});
