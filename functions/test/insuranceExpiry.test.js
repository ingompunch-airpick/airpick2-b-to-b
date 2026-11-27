/**
 * 보험 만기 알림 계산 — 실행: cd functions && npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { insuranceExpiryNotices, kstToday } = require('../lib/ops/insuranceExpiry.js');

const company = (id, periodEnd, extra = {}) => ({
  id,
  data: { name: id.toUpperCase(), insurance: { enrolled: true, periodEnd }, ...extra },
});

test('만기 30·7·1일 전·당일·다음 날만 알린다', () => {
  const today = '2026-11-27';
  const notices = insuranceExpiryNotices(
    [
      company('a', '2026-12-27'), // 30일 전
      company('b', '2026-12-04'), // 7일 전
      company('c', '2026-11-28'), // 1일 전
      company('d', '2026-11-27'), // 오늘
      company('e', '2026-11-26'), // 지남(다음 날)
      company('f', '2026-11-20'), // 이미 알림 끝
      company('g', '2026-12-10'), // 13일 전 — 알림 없음
    ],
    today
  );
  assert.deepEqual(
    notices.map((n) => n.companyId),
    ['a', 'b', 'c', 'd', 'e']
  );
  assert.match(notices[1].message, /7일 전: B \(2026-12-04\)/);
  assert.match(notices[4].message, /지남/);
});

test('보험 미가입·만기일 없음·정지·심사용 업체는 건너뛴다', () => {
  const notices = insuranceExpiryNotices(
    [
      { id: 'x', data: { insurance: { enrolled: false, periodEnd: '2026-12-04' } } },
      { id: 'y', data: { insurance: { enrolled: true } } },
      company('z', '2026-12-04', { status: 'suspended' }),
      company('demo', '2026-12-04'),
      company('w', 'not-a-date'),
    ],
    '2026-11-27'
  );
  assert.equal(notices.length, 0);
});

test('한국 날짜 기준', () => {
  assert.equal(kstToday(new Date('2026-11-26T15:30:00Z')), '2026-11-27');
  assert.equal(kstToday(new Date('2026-11-26T14:30:00Z')), '2026-11-26');
});
