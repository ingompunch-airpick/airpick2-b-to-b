#!/usr/bin/env node
/**
 * 업체 홈 문구의 깨진 글자(�) 복구 — companies/{id}.partnerHomepage 안의 문장만 고친다.
 * 2026-11-09 ~ 11-20 사이 어떤 저장 과정에서 한글 한 글자씩이 �로 바뀐 것을 앞뒤 문맥으로 되돌린다.
 *
 * 실행 (firebase login 된 상태):
 *   node scripts/fix-broken-text.mjs           ← 바뀔 내용만 보여 줌 (저장 안 함)
 *   node scripts/fix-broken-text.mjs --apply   ← 실제 저장
 *
 * 다른 사람이 그사이 저장했으면(문서 시각이 바뀌면) 그 업체는 건너뛴다. 다시 실행하면 된다.
 */
import fs from 'node:fs';
import os from 'node:os';

const PROJECT = 'airpick-reservation';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const APPLY = process.argv.includes('--apply');

/** [앞 문맥, 뒤 문맥, 빠진 글자] — 앞뒤 사이의 �(1개 이상)를 글자로 바꾼다 */
const FIXES = {
  asia: [
    ['예', '·인계·요금', '약'],
    ['주차', '에 직접 가서', '장'],
    ['차량 인', '는 어디서', '계'],
    ['제1터미널', ' 지하 2층', '은'],
    ['바로 ', '정인가요', '확'],
    ['업체 ', '내에 따라', '안'],
    ['촬영', '모니터링', '·'],
    ['연락해 주', '요. 사전', '세'],
  ],
  bucks: [
    ['전용 주차', '으로 이동', '장'],
    ['장소에서 ', '량을 반환', '차'],
    ['인천공항 주차', '행. 인천', '대'],
    ['발렛·', '관 중에도', '보'],
    ['안내 ', '소에서', '장'],
    ['확인 후 ', '용 주차장', '전'],
    ['전용 주차', '에 안전하게', '장'],
  ],
  gayu: [
    ['신뢰를 더', '니다', '합'],
    ['신청한 뒤, ', '체 안내', '업'],
    ['오시면 되지', ', 당일', '만'],
    ['귀국 후 ', '을 찾으시고', '짐'],
    ['차량은 ', '떻게 받나요', '어'],
    ['출발 동선', ' 훨씬', '이'],
    ['맡기고 찾', ' 수 있나요', '을'],
    ['예약으로 ', '어집니다', '이'],
    ['', '천공항 주차대행', '인'],
    ['안전 ', '행', '운'],
  ],
  hi: [
    ['일정에 ', '춰 인계', '맞'],
    ['차량을 ', '관하는', '보'],
    ['도착 30', '전 안녕', '분'],
    ['5856)', '로 연락', '으'],
    ['', '천공항 주차대행', '인'],
  ],
  season: [
    ['여행은 ', '레게', '설'],
    ['바뀌면 ', '발 전에', '출'],
    ['1터미널, ', '천공항 2터미널', '인'],
  ],
  wawa: [
    ['이동·반', '', '환'],
    ['안전하게 ', '관합니다', '보'],
    ['반환받습', '다.', '니'],
    ['상태를 사', ' 등으로', '진'],
    ['남겨 두', '는 것을', '시'],
    ['기본 1~2', ' 40,000원', '일'],
  ],
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function accessToken() {
  const cfg = JSON.parse(fs.readFileSync(`${os.homedir()}/.config/configstore/firebase-tools.json`, 'utf8'));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cfg.tokens.refresh_token,
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error('firebase login 이 필요합니다: npx firebase-tools login');
  return json.access_token;
}

/** Firestore 값 트리의 모든 stringValue 에 fn 적용. 바뀐 [경로, 전, 후] 목록 반환 */
function walk(node, fn, path, changes) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.stringValue === 'string') {
    const next = fn(node.stringValue);
    if (next !== node.stringValue) {
      changes.push([path, node.stringValue, next]);
      node.stringValue = next;
    }
    return;
  }
  if (node.mapValue) {
    for (const [k, v] of Object.entries(node.mapValue.fields || {})) walk(v, fn, `${path}.${k}`, changes);
  }
  if (node.arrayValue) {
    (node.arrayValue.values || []).forEach((v, i) => walk(v, fn, `${path}.${i}`, changes));
  }
}

function leftover(node, path, out) {
  if (!node || typeof node !== 'object') return out;
  if (typeof node.stringValue === 'string' && node.stringValue.includes('�')) out.push([path, node.stringValue]);
  if (node.mapValue) for (const [k, v] of Object.entries(node.mapValue.fields || {})) leftover(v, `${path}.${k}`, out);
  if (node.arrayValue) (node.arrayValue.values || []).forEach((v, i) => leftover(v, `${path}.${i}`, out));
  return out;
}

const token = await accessToken();
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
let failed = 0;

for (const [companyId, rules] of Object.entries(FIXES)) {
  const res = await fetch(`${BASE}/companies/${companyId}`, { headers });
  const doc = await res.json();
  if (!res.ok) {
    console.error(`✗ ${companyId}: 문서를 읽지 못했습니다`, doc.error?.message || res.status);
    failed++;
    continue;
  }
  const ph = doc.fields?.partnerHomepage;
  if (!ph) {
    console.log(`- ${companyId}: 홈 설정 없음`);
    continue;
  }
  const used = new Set();
  const fix = (text) => {
    let out = text;
    rules.forEach(([before, after, ch], i) => {
      const re = new RegExp(`${esc(before)}\\uFFFD+${esc(after)}`, 'g');
      if (re.test(out)) {
        used.add(i);
        out = out.replace(re, `${before}${ch}${after}`);
      }
    });
    return out;
  };
  const changes = [];
  walk(ph, fix, 'partnerHomepage', changes);
  const left = leftover(ph, 'partnerHomepage', []);

  console.log(`\n■ ${companyId}: ${changes.length}곳 고침`);
  for (const [p, , after] of changes) console.log(`  ${p}\n    → ${after.slice(0, 120)}`);
  const unused = rules.filter((_, i) => !used.has(i));
  if (unused.length) console.log(`  (이미 고쳐졌거나 못 찾은 규칙 ${unused.length}개: ${unused.map((r) => r[0] + '…' + r[1]).join(' / ')})`);
  if (left.length) {
    console.error(`  ✗ 아직 깨진 글자가 남아 있어 이 업체는 저장하지 않습니다:`);
    for (const [p, v] of left) console.error(`    ${p}: ${v.slice(0, 120)}`);
    failed++;
    continue;
  }
  if (!changes.length) continue;
  if (!APPLY) continue;

  const url =
    `${BASE}/companies/${companyId}?updateMask.fieldPaths=partnerHomepage` +
    `&currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}`;
  const put = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { partnerHomepage: ph } }),
  });
  if (put.ok) console.log(`  ✓ 저장했습니다`);
  else {
    const j = await put.json().catch(() => ({}));
    console.error(`  ✗ 저장 실패: ${j.error?.message || put.status} (다시 실행해 주세요)`);
    failed++;
  }
}

console.log(APPLY ? '\n끝났습니다.' : '\n미리보기만 했습니다. 실제로 고치려면 --apply 를 붙여 다시 실행하세요.');
process.exit(failed ? 1 : 0);
