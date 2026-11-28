/**
 * 에어픽 운영 점수 계산. 실행: cd functions && npm test
 * 예약·차량번호는 모두 지어낸 값이다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeMonthScores, kstMs } = require('../lib/partnerScore/compute.js');

const MONTH = '2026-12';
/** 1월 1일 13시 — 12월 확정 시점 */
const CONFIRM_AT = kstMs('2027-01-01', '13:00');

let seq = 0;
/** 12월 10일 10시 맡김 · 12월 13일 찾음 · 30분 뒤 입고완료 · 사진 4장 · 주차장 선택 · 찾는 날 출고완료 */
function good(companyId, over = {}) {
  seq += 1;
  return {
    id: `r${seq}`,
    companyId,
    airpick: true,
    status: 'completed_out',
    departureYmd: '2026-12-10',
    departureHm: '10:00',
    arrivalYmd: '2026-12-13',
    checkInMs: kstMs('2026-12-10', '10:30'),
    checkOutMs: kstMs('2026-12-13', '18:00'),
    photoCount: 4,
    hasParkingLot: true,
    cancelledBy: '',
    cancelledMs: null,
    carTail: '0000',
    ...over,
  };
}

function many(companyId, n, over = {}) {
  return Array.from({ length: n }, () => good(companyId, over));
}

function run(reservations, reviews = [], companies, nowMs = CONFIRM_AT, month = MONTH) {
  const ids = companies || [...new Set(reservations.map((r) => r.companyId))];
  return computeMonthScores({
    month,
    nowMs,
    companies: ids.map((id) => ({ id, name: id })),
    reservations,
    reviews,
  });
}

function pick(result, id) {
  return result.companies.find((c) => c.companyId === id);
}

test('모두 잘 처리하면 100점, 1등 가중치 3·배지', () => {
  const r = run(many('a', 6));
  const a = pick(r, 'a');
  assert.equal(a.score, 100);
  assert.equal(a.status, 'ranked');
  assert.equal(a.rank, 1);
  assert.equal(a.weight, 3);
  assert.equal(a.badge, true);
  assert.equal(a.misses.length, 0);
});

test('사진 3장·주차장 안 고름은 비율만큼 깎이고 부족한 예약 목록에 남는다', () => {
  const rows = [...many('a', 8), good('a', { photoCount: 3 }), good('a', { hasParkingLot: false })];
  const a = pick(run(rows), 'a');
  assert.equal(a.items.photo.ok, 9);
  assert.equal(a.items.photo.total, 10);
  assert.equal(a.items.photo.points, 22.5);
  assert.equal(a.items.parking.points, 13.5);
  assert.equal(a.status, 'ranked'); // 90% ≥ 80%
  assert.deepEqual(
    a.misses.map((m) => m.kind).sort(),
    ['parking', 'photo']
  );
});

test('사진 80% 미만이면 기준 미달(가중치 0)', () => {
  const rows = [...many('a', 7), ...many('a', 3, { photoCount: 0 })];
  const a = pick(run(rows), 'a');
  assert.equal(a.minimum.photo, false);
  assert.equal(a.status, 'below');
  assert.equal(a.weight, 0);
  assert.equal(a.rank, null);
});

test('판정월 2027-03부터는 90% 기준', () => {
  const at = kstMs('2027-04-01', '13:00');
  const rows = many('a', 9, {
    departureYmd: '2027-03-10',
    arrivalYmd: '2027-03-13',
    checkInMs: kstMs('2027-03-10', '10:30'),
    checkOutMs: kstMs('2027-03-13', '18:00'),
  });
  rows.push(good('a', {
    departureYmd: '2027-03-10',
    arrivalYmd: '2027-03-13',
    checkInMs: kstMs('2027-03-10', '10:30'),
    checkOutMs: kstMs('2027-03-13', '18:00'),
    photoCount: 1,
  }));
  rows.push(good('a', {
    departureYmd: '2027-03-11',
    arrivalYmd: '2027-03-13',
    checkInMs: kstMs('2027-03-11', '10:30'),
    checkOutMs: kstMs('2027-03-13', '18:00'),
    photoCount: 1,
  }));
  const a = pick(run(rows, [], ['a'], at, '2027-03'), 'a');
  assert.equal(a.strict, true);
  assert.equal(a.minimum.ratio, 0.9);
  assert.equal(a.status, 'below'); // 9/11 = 82%
});

test('입고 처리 속도: 3시간 안 통과 · 넘기면 감점 · 안 누르면 감점 · 시각 모르면 제외', () => {
  const rows = [
    ...many('a', 5),
    good('a', { checkInMs: kstMs('2026-12-10', '13:00') }), // 정확히 3시간 → 통과
    good('a', { checkInMs: kstMs('2026-12-10', '14:30') }), // 4시간 30분
    good('a', { status: 'pending', checkInMs: null, checkOutMs: null, arrivalYmd: '2027-01-05' }),
    good('a', { checkInMs: null }), // 입고완료인데 누른 시각 없음 → 재지 않음
  ];
  const a = pick(run(rows), 'a');
  assert.equal(a.items.speed.total, 8);
  assert.equal(a.items.speed.ok, 6);
  assert.equal(a.items.speed.points, 15);
  const notes = a.misses.filter((m) => m.kind === 'speed').map((m) => m.note).sort();
  assert.deepEqual(notes, ['맡기는 시각 4시간 30분 뒤 입고완료', '입고완료 안 누름']);
});

test('출고: 찾는 날 안 통과 · 다음 날 정오 전 늦음(감점만) · 정오 넘김·안 누름은 미처리 → 기준 미달', () => {
  const late = good('a', { checkOutMs: kstMs('2026-12-14', '01:00') });
  const base = [...many('a', 5), late];
  let a = pick(run(base), 'a');
  assert.equal(a.items.checkout.ok, 5);
  assert.equal(a.items.checkout.total, 6);
  assert.equal(a.minimum.checkoutOpen, 0);
  assert.equal(a.status, 'ranked');

  const open = good('a', { status: 'completed_in', checkOutMs: null });
  a = pick(run([...base, open]), 'a');
  assert.equal(a.minimum.checkoutOpen, 1);
  assert.equal(a.status, 'below');
  assert.ok(a.misses.some((m) => m.kind === 'checkout' && m.blocking && m.note === '출고완료 안 누름'));

  // 찾는 날 다음 날 오전 — 아직 미처리 아님
  const now = kstMs('2026-12-14', '09:00');
  a = pick(run([...many('a', 5), good('a', { status: 'completed_in', checkOutMs: null })], [], ['a'], now), 'a');
  assert.equal(a.minimum.checkoutOpen, 0);
  assert.equal(a.items.checkout.total, 6);
});

test('찾는 날이 아직 안 온 예약은 출고 계산에 넣지 않는다', () => {
  const now = kstMs('2026-12-12', '13:00');
  const a = pick(run(many('a', 5, { status: 'completed_in', checkOutMs: null }), [], ['a'], now), 'a');
  assert.equal(a.items.checkout.total, 0);
  assert.equal(a.items.checkout.points, 15);
  assert.equal(a.minimum.checkoutOpen, 0);
});

test('업체 사정 취소: 1건 5점·통과(1~3월) · 2건 0점·미달 · 손님 요청 취소는 안 셈', () => {
  const cancel = (by) =>
    good('a', { status: 'cancelled', cancelledBy: by, cancelledMs: kstMs('2026-12-05', '09:00') });
  let a = pick(run([...many('a', 6), cancel('partner'), cancel('customer_request'), cancel('customer')]), 'a');
  assert.equal(a.items.cancel.count, 1);
  assert.equal(a.items.cancel.points, 5);
  assert.equal(a.status, 'ranked');
  a = pick(run([...many('a', 6), cancel('partner'), cancel('partner')]), 'a');
  assert.equal(a.items.cancel.points, 0);
  assert.equal(a.status, 'below');
});

test('후기: 1~3점 한 건마다 −5, 다른 달 후기는 안 셈', () => {
  const reviews = [
    { id: 'v1', companyId: 'a', rating: 3, createdMs: kstMs('2026-12-20', '10:00') },
    { id: 'v2', companyId: 'a', rating: 5, createdMs: kstMs('2026-12-20', '10:00') },
    { id: 'v3', companyId: 'a', rating: 1, createdMs: kstMs('2026-11-30', '23:00') },
  ];
  const a = pick(run(many('a', 6), reviews), 'a');
  assert.equal(a.items.review.low, 1);
  assert.equal(a.items.review.points, 10);
});

test('자체 예약: 입고까지 간 것만 20건 +5 · 50건 +10', () => {
  const own = (n, over = {}) => many('a', n, { airpick: false, ...over });
  let a = pick(run([...many('a', 6), ...own(19), ...own(5, { status: 'pending', checkInMs: null })]), 'a');
  assert.equal(a.items.own.count, 19);
  assert.equal(a.items.own.points, 0);
  a = pick(run([...many('a', 6), ...own(20)]), 'a');
  assert.equal(a.items.own.points, 5);
  assert.equal(a.score, 105);
  a = pick(run([...many('a', 6), ...own(50)]), 'a');
  assert.equal(a.items.own.points, 10);
});

test('에어픽 입고 5건 미만은 순위 없이 가중치 1 · 출고 미처리는 그래도 미달', () => {
  let r = run([...many('a', 6), ...many('b', 4)]);
  assert.equal(pick(r, 'b').status, 'few');
  assert.equal(pick(r, 'b').weight, 1);
  assert.equal(pick(r, 'a').rankedCount, 1);
  r = run([...many('a', 6), ...many('b', 3), good('b', { status: 'completed_in', checkOutMs: null })]);
  assert.equal(pick(r, 'b').status, 'below');
  assert.equal(pick(r, 'b').weight, 0);
});

test('순위: 1등 3 · 2등 2 · 3등 1 · 80점 못 넘으면 1등도 1 · 동점은 입고 속도 순', () => {
  const slow = { checkInMs: kstMs('2026-12-10', '15:00') }; // 5시간
  let r = run([
    ...many('a', 6),
    ...many('b', 5), good('b', slow), // 속도 5/6
    ...many('c', 4), good('c', slow), good('c', slow),
  ]);
  assert.deepEqual(
    ['a', 'b', 'c'].map((id) => [pick(r, id).rank, pick(r, id).weight]),
    [[1, 3], [2, 2], [3, 1]]
  );

  // 모두 80점 아래
  const weak = { photoCount: 0, hasParkingLot: false };
  r = run([...many('a', 6, { ...weak, photoCount: 4 }), ...many('a', 0)], [], ['a']);
  // 사진 100%, 주차 0% → 주차 기준 미달이라 below
  assert.equal(pick(r, 'a').status, 'below');

  const lowSpeed = { checkInMs: kstMs('2026-12-10', '20:00') };
  const reviews = [1, 2, 3].map((n) => ({
    id: `v${n}`, companyId: 'a', rating: 1, createdMs: kstMs('2026-12-20', '10:00'),
  }));
  r = run(many('a', 6, lowSpeed), reviews);
  const a = pick(r, 'a');
  assert.equal(a.score, 65); // 100 − 속도 20 − 후기 15
  assert.equal(a.rank, 1);
  assert.equal(a.weight, 1);
  assert.equal(a.badge, false);

  // 동점(95) → 입고 속도 같음 → 후기 점수 높은 y가 앞
  r = run(
    [
      ...many('x', 6),
      ...many('y', 6),
      good('y', { status: 'cancelled', cancelledBy: 'partner', cancelledMs: kstMs('2026-12-03', '09:00') }),
    ],
    [{ id: 'v9', companyId: 'x', rating: 2, createdMs: kstMs('2026-12-20', '10:00') }]
  );
  assert.equal(pick(r, 'x').score, 95);
  assert.equal(pick(r, 'y').score, 95);
  assert.equal(pick(r, 'y').rank, 1);
  assert.equal(pick(r, 'x').rank, 2);
});

test('취소된 예약과 다른 달 맡김은 입고 계산에서 빠진다', () => {
  const rows = [
    ...many('a', 6),
    good('a', { status: 'cancelled', cancelledBy: 'customer', cancelledMs: kstMs('2026-12-01', '09:00'), photoCount: 0 }),
    good('a', { departureYmd: '2026-11-30', photoCount: 0 }),
  ];
  const a = pick(run(rows), 'a');
  assert.equal(a.airpickIntakes, 6);
  assert.equal(a.items.photo.total, 6);
});

test('예약 문서 → 점수용 값 (시각·사진·출처·와와 별칭)', () => {
  const { toScoreReservation, countReservationPhotos } = require('../lib/partnerScore/run.js');
  const resolve = (id, name) => (String(id).startsWith('wawa') || String(name || '').includes('와와') ? 'wawa' : id);
  const r = toScoreReservation(
    'x1',
    {
      companyId: 'wawa_valet',
      companyName: '와와발렛',
      createdBy: 'airpick-b2c',
      status: '주차완료',
      departureDate: '2026-12-10',
      departureTime: '9:30',
      arrivalDate: '2026-12-13',
      checkedInAt: '2026-12-10T01:10:00.000Z',
      images: ['a', 'b', 'c'],
      scratchPhotos: { urls: ['b', 'c', 'd'], synced: true },
      parkingLotId: 'lot1',
      carNumber: '12가 3456',
      cancelledAt: '',
    },
    resolve
  );
  assert.equal(r.companyId, 'wawa');
  assert.equal(r.airpick, true);
  assert.equal(r.status, 'completed_in');
  assert.equal(r.departureHm, '09:30');
  assert.equal(r.checkInMs, Date.parse('2026-12-10T10:10:00+09:00'));
  assert.equal(r.photoCount, 4);
  assert.equal(r.hasParkingLot, true);
  assert.equal(r.carTail, '3456');
  assert.equal(r.cancelledMs, null);

  const old = toScoreReservation(
    'x2',
    {
      companyId: 'bucks',
      createdBy: 'b2b',
      status: 'completed_out',
      actualParkingTime: '2026-12-10 10:05:00',
      actualExitTime: '2026-12-13 18:00:00',
      photoCountAtPurge: 5,
    },
    resolve
  );
  assert.equal(old.airpick, false);
  assert.equal(old.checkInMs, Date.parse('2026-12-10T10:05:00+09:00'));
  assert.equal(old.checkOutMs, Date.parse('2026-12-13T18:00:00+09:00'));
  assert.equal(old.photoCount, 5);
  assert.equal(countReservationPhotos({ scratchPhotos: { front: 'f', rear: 'r', left: '', right: 'x' } }), 3);
});
