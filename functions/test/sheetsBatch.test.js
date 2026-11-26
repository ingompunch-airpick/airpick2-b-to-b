/**
 * 시트 묶음 쓰기 단위 테스트 — 실제 구글 시트 대신 메모리 가짜 시트로 돌린다.
 * 실행: cd functions && npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { planTab, executeSpreadsheetOps, emptySpreadsheetOps, addUpsert, addRemoval } = require('../lib/sheets/batchPlan.js');
const { SHEET_HEADERS } = require('../lib/sheets/constants.js');

const HEADERS = Array.from(SHEET_HEADERS);
const W = HEADERS.length;

function row(id, label) {
  const r = new Array(W).fill('');
  r[0] = id;
  r[1] = label;
  return r;
}

function colIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseRange(range) {
  const m = range.match(/^'((?:[^']|'')+)'!(.+)$/);
  if (!m) throw new Error(`bad range ${range}`);
  const tab = m[1].replace(/''/g, "'");
  const ref = m[2];
  let r;
  if ((r = ref.match(/^([A-Z]+):([A-Z]+)$/))) return { tab, kind: 'cols', from: colIndex(r[1]), to: colIndex(r[2]) };
  if ((r = ref.match(/^(\d+):(\d+)$/))) return { tab, kind: 'rows', row: Number(r[1]) };
  if ((r = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/))) return { tab, kind: 'cells', row: Number(r[2]), from: colIndex(r[1]) };
  throw new Error(`bad ref ${ref}`);
}

/** 메모리 가짜 구글 시트. calls에 API 호출이 쌓인다. */
function fakeSheets(initial) {
  let nextId = 100;
  const tabs = new Map();
  for (const [title, rows] of Object.entries(initial)) tabs.set(title, { sheetId: nextId++, rows: rows.map((r) => [...r]) });
  const calls = [];
  const bySheetId = (id) => [...tabs.values()].find((t) => t.sheetId === id);
  const api = {
    spreadsheets: {
      async get() {
        calls.push('get');
        return { data: { sheets: [...tabs.entries()].map(([title, t]) => ({ properties: { title, sheetId: t.sheetId } })) } };
      },
      async batchUpdate({ requestBody }) {
        calls.push('batchUpdate');
        const replies = [];
        for (const req of requestBody.requests) {
          if (req.addSheet) {
            const sheetId = nextId++;
            tabs.set(req.addSheet.properties.title, { sheetId, rows: [] });
            replies.push({ addSheet: { properties: { sheetId } } });
          } else if (req.deleteDimension) {
            const { sheetId, startIndex, endIndex } = req.deleteDimension.range;
            bySheetId(sheetId).rows.splice(startIndex, endIndex - startIndex);
            replies.push({});
          }
        }
        return { data: { replies } };
      },
      values: {
        async batchGet({ ranges }) {
          calls.push('values.batchGet');
          return {
            data: {
              valueRanges: ranges.map((range) => {
                const p = parseRange(range);
                const t = tabs.get(p.tab);
                if (p.kind === 'cols') return { range, values: t.rows.map((r) => [r[p.from] ?? '']) };
                return { range, values: t.rows[p.row - 1] ? [t.rows[p.row - 1]] : [] };
              }),
            },
          };
        },
        async batchUpdate({ requestBody }) {
          calls.push('values.batchUpdate');
          for (const d of requestBody.data) {
            const p = parseRange(d.range);
            const t = tabs.get(p.tab);
            while (t.rows.length < p.row) t.rows.push(new Array(W).fill(''));
            t.rows[p.row - 1] = [...d.values[0]];
          }
          return { data: {} };
        },
        async append({ range, requestBody }) {
          calls.push('values.append');
          const t = tabs.get(parseRange(range).tab);
          for (const v of requestBody.values) t.rows.push([...v]);
          return { data: {} };
        },
      },
    },
  };
  return { api, tabs, calls };
}

const ids = (tabs, title) => tabs.get(title).rows.slice(1).map((r) => r[0]);

test('planTab: 고치기·추가·중복 지우기', () => {
  const plan = planTab({
    tab: '와와',
    isNew: false,
    columnA: [['예약ID'], ['A'], ['B'], ['A'], ['C']],
    headerRow: HEADERS,
    upserts: new Map([['A', row('A', 'new')], ['D', row('D', 'new')]]),
    removals: new Set(['C', 'A']),
  });
  assert.deepEqual(plan.updates.map((u) => u.row), [2]);
  assert.equal(plan.appends.length, 1);
  assert.deepEqual(plan.deleteRows, [5, 4]); // A 중복(4) + C(5), A는 다시 쓰므로 지우지 않음
  assert.equal(plan.headerFix, false);
});

test('기존 탭: 예약 50건이 바뀌어도 시트 API 5회 이하', async () => {
  const existing = [HEADERS, ...Array.from({ length: 40 }, (_, i) => row(`R${i}`, 'old')), row('R3', 'dup')];
  const { api, tabs, calls } = fakeSheets({ 와와: existing });
  const ops = emptySpreadsheetOps('file');
  for (let i = 0; i < 50; i++) addUpsert(ops, '와와', `R${i}`, row(`R${i}`, 'new'));
  const res = await executeSpreadsheetOps(api, ops);
  assert.ok(calls.length <= 5, calls.join(','));
  assert.equal(res.rowsUpdated, 40);
  assert.equal(res.rowsAppended, 10);
  assert.equal(res.rowsDeleted, 1);
  const all = ids(tabs, '와와');
  assert.equal(all.length, 50);
  assert.equal(new Set(all).size, 50);
  assert.ok(tabs.get('와와').rows.slice(1).every((r) => r[1] === 'new'));
});

test('새 탭: 만들고 헤더 쓴 뒤 2행부터 추가', async () => {
  const { api, tabs, calls } = fakeSheets({ 에어픽: [HEADERS] });
  const ops = emptySpreadsheetOps('file');
  addUpsert(ops, '시즌', 'S1', row('S1', 'x'));
  addUpsert(ops, '시즌', 'S2', row('S2', 'y'));
  const res = await executeSpreadsheetOps(api, ops);
  assert.equal(res.tabsCreated, 1);
  assert.deepEqual(tabs.get('시즌').rows[0], HEADERS);
  assert.deepEqual(ids(tabs, '시즌'), ['S1', 'S2']);
  assert.deepEqual(calls, ['get', 'batchUpdate', 'values.batchUpdate', 'values.append']);
});

test('탭 이동: 새 탭에 쓰고 예전 탭 줄은 지움', async () => {
  const { api, tabs } = fakeSheets({ 와와홈: [HEADERS, row('M1', 'old'), row('K', 'keep')], 와와: [HEADERS] });
  const ops = emptySpreadsheetOps('file');
  addUpsert(ops, '와와', 'M1', row('M1', 'new'));
  addRemoval(ops, '와와홈', 'M1');
  await executeSpreadsheetOps(api, ops);
  assert.deepEqual(ids(tabs, '와와'), ['M1']);
  assert.deepEqual(ids(tabs, '와와홈'), ['K']);
});

test('헤더가 다르면 고침, 지울 탭이 없으면 무시', async () => {
  const broken = [...HEADERS];
  broken[2] = '옛날 열';
  const { api, tabs } = fakeSheets({ 가유: [broken, row('G1', 'old')] });
  const ops = emptySpreadsheetOps('file');
  addUpsert(ops, '가유', 'G1', row('G1', 'new'));
  addRemoval(ops, '없는탭', 'G1');
  const res = await executeSpreadsheetOps(api, ops);
  assert.deepEqual(tabs.get('가유').rows[0], HEADERS);
  assert.equal(tabs.get('가유').rows[1][1], 'new');
  assert.equal(res.rowsDeleted, 0);
});

test('작은따옴표가 있는 탭 이름', async () => {
  const { api, tabs } = fakeSheets({ "O'Neil": [HEADERS, row('Q1', 'old')] });
  const ops = emptySpreadsheetOps('file');
  addUpsert(ops, "O'Neil", 'Q1', row('Q1', 'new'));
  await executeSpreadsheetOps(api, ops);
  assert.equal(tabs.get("O'Neil").rows[1][1], 'new');
});

test('시트 API 실패는 그대로 던짐(대기열이 다시 시도)', async () => {
  const { api } = fakeSheets({ 와와: [HEADERS] });
  api.spreadsheets.values.append = async () => {
    throw new Error('quota');
  };
  const ops = emptySpreadsheetOps('file');
  addUpsert(ops, '와와', 'X', row('X', 'n'));
  await assert.rejects(executeSpreadsheetOps(api, ops), /quota/);
});
