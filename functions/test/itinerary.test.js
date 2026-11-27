/**
 * 항공권·일정표 읽기 — AI 응답 검사와 출국·귀국편 고르기. 실행: cd functions && npm test
 * 항공편·날짜는 지어낸 값이다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseItineraryResponse, pickTrip, normalizeFlightNumber } = require('../lib/documents/itineraryParse.js');

const leg = (o) => ({
  airlineCode: 'KE', airlineName: 'Korean Air', departTerminal: '', arriveTerminal: '', ...o,
});

test('편명 정리: 띄어쓰기·앞자리 0·숫자만', () => {
  assert.equal(normalizeFlightNumber('KE 0701'), 'KE701');
  assert.equal(normalizeFlightNumber('ke701'), 'KE701');
  assert.equal(normalizeFlightNumber('701', 'KE'), 'KE701');
  assert.equal(normalizeFlightNumber('7C1101'), '7C1101');
  assert.equal(normalizeFlightNumber('대한항공'), '');
});

test('왕복: 출국편=인천 출발, 귀국편=인천 도착 (다음 날 도착 포함)', () => {
  const { legs } = parseItineraryResponse(JSON.stringify({
    isItinerary: true,
    legs: [
      leg({ flightNumber: 'KE702', fromAirport: 'NRT', toAirport: 'ICN', departDate: '2027-01-10', departTime: '18:00', arriveDate: '2027-01-10', arriveTime: '20:35', arriveTerminal: '2' }),
      leg({ flightNumber: 'KE 701', fromAirport: 'ICN', toAirport: 'NRT', departDate: '2027-01-03', departTime: '9:30', arriveDate: '2027-01-03', arriveTime: '11:50', departTerminal: 'T2' }),
    ],
  }));
  const p = pickTrip(legs, '2026-12-01');
  assert.equal(p.outbound.flightNumber, 'KE701');
  assert.equal(p.outbound.date, '2027-01-03');
  assert.equal(p.outbound.time, '09:30');
  assert.equal(p.outbound.terminal, 'T2');
  assert.equal(p.inbound.flightNumber, 'KE702');
  assert.equal(p.inbound.date, '2027-01-10');
  assert.equal(p.inbound.time, '20:35');
  assert.equal(p.inbound.terminal, 'T2');
  assert.deepEqual(p.warnings, []);
});

test('경유: 귀국편은 인천에 도착하는 마지막 편', () => {
  const { legs } = parseItineraryResponse(JSON.stringify({
    isItinerary: true,
    legs: [
      leg({ airlineCode: 'VN', flightNumber: 'VN417', fromAirport: 'ICN', toAirport: 'HAN', departDate: '2027-02-01', departTime: '10:00', arriveTime: '12:30' }),
      leg({ airlineCode: 'VN', flightNumber: 'VN1555', fromAirport: 'HAN', toAirport: 'DAD', departDate: '2027-02-01', departTime: '15:00', arriveTime: '16:20' }),
      leg({ airlineCode: 'VN', flightNumber: 'VN1556', fromAirport: 'DAD', toAirport: 'HAN', departDate: '2027-02-06', departTime: '20:00', arriveTime: '21:20' }),
      leg({ airlineCode: 'VN', flightNumber: 'VN416', fromAirport: 'HAN', toAirport: 'ICN', departDate: '2027-02-06', departTime: '23:50', arriveDate: '2027-02-07', arriveTime: '06:10' }),
    ],
  }));
  const p = pickTrip(legs, '2026-12-01');
  assert.equal(p.outbound.flightNumber, 'VN417');
  assert.equal(p.inbound.flightNumber, 'VN416');
  assert.equal(p.inbound.date, '2027-02-07');
  assert.equal(p.inbound.time, '06:10');
  assert.deepEqual(p.warnings, []);
});

test('편도·김포·지난 날짜는 안내를 붙인다', () => {
  const oneWay = pickTrip(parseItineraryResponse(JSON.stringify({ legs: [
    leg({ flightNumber: 'KE701', fromAirport: 'ICN', toAirport: 'NRT', departDate: '2027-01-03', departTime: '09:30', arriveTime: '11:50' }),
  ] })).legs, '2026-12-01');
  assert.ok(oneWay.outbound);
  assert.equal(oneWay.inbound, null);
  assert.match(oneWay.warnings[0], /돌아오는 항공편/);

  const gimpo = pickTrip(parseItineraryResponse(JSON.stringify({ legs: [
    leg({ flightNumber: 'KE2101', fromAirport: 'GMP', toAirport: 'HND', departDate: '2027-01-03', departTime: '08:00', arriveTime: '10:20' }),
  ] })).legs, '2026-12-01');
  assert.equal(gimpo.outbound, null);
  assert.match(gimpo.warnings[0], /김포/);

  const past = pickTrip(parseItineraryResponse(JSON.stringify({ legs: [
    leg({ flightNumber: 'KE701', fromAirport: 'ICN', toAirport: 'NRT', departDate: '2026-11-01', departTime: '09:30', arriveTime: '11:50' }),
  ] })).legs, '2026-12-01');
  assert.match(past.warnings[0], /지났어요/);
});

test('형식이 틀린 구간·JSON 아님은 버린다', () => {
  assert.deepEqual(parseItineraryResponse('not json'), { isItinerary: false, legs: [] });
  const { legs } = parseItineraryResponse(JSON.stringify({ legs: [
    leg({ flightNumber: '???', fromAirport: 'ICN', toAirport: 'NRT', departDate: '2027-01-03', departTime: '09:30' }),
    leg({ flightNumber: 'KE701', fromAirport: '인천', toAirport: 'NRT', departDate: '2027-01-03', departTime: '09:30' }),
    leg({ flightNumber: 'KE701', fromAirport: 'ICN', toAirport: 'NRT', departDate: '2027-02-30', departTime: '09:30' }),
  ] }));
  assert.equal(legs.length, 0);
});
