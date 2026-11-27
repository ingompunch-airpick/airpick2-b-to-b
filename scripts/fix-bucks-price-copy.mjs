#!/usr/bin/env node
/**
 * 주차벅스 업체 홈 요금 문구를 실제 요금(앱 설정)에 맞춘다. 2026-11-27 대표 확인:
 *   기본 1~2일 40,000원 · 3일부터 1일 야외 5,000원 / 실내 10,000원 추가
 *   야간할증 19:00~04:55 직전 15,000원 · 제2터미널 10,000원 (앱 요금 설정 값)
 *
 * 실행 (firebase login 된 상태):
 *   node scripts/fix-bucks-price-copy.mjs           ← 바뀔 내용만 보여 줌
 *   node scripts/fix-bucks-price-copy.mjs --apply   ← 실제 저장
 */
import fs from 'node:fs';
import os from 'node:os';

const PROJECT = 'airpick-reservation';
const URL_DOC = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/companies/bucks`;
const APPLY = process.argv.includes('--apply');

/** 경로 → [지금 문구에 들어 있어야 하는 말, 새 문구] */
const UPDATES = {
  'partnerHomepage.config.seo.description': [
    '1~1일 30,000원',
    '주차벅스 주차대행 — 인천공항 주차대행. 기본 1~2일 40,000원, 3일부터 1일 야외 5,000원 · 실내 10,000원 추가. 현대해상 책임보험 가입·24시간 CCTV. 에어픽 입점 파트너, T1·T2 온라인 예약.',
  ],
  'partnerHomepage.config.pricePreview.headline': ['1~1일 30,000원', '기본 1~2일 40,000원'],
  'partnerHomepage.config.pricePreview.perDayAfter': ['2일부터', '3일부터 1일 야외 5,000원 · 실내 10,000원 추가'],
  'partnerHomepage.config.pricePreview.notes.1': ['야간할증', '야간할증 19:00~04:55 직전 15,000원'],
  'partnerHomepage.config.homeBanner.sub': ['1~1일 30,000원', '인천공항 주차대행 · 기본 1~2일 40,000원'],
  'partnerHomepage.config.faqs.5.answer': [
    '기본 3일',
    '기본 1~2일 40,000원, 3일부터 1일 야외 5,000원 · 실내 10,000원 추가. 야간할증 19:00~04:55 직전 15,000원 (입·출고 각각). 제2터미널 이동 추가요금 10,000원.',
  ],
  'partnerHomepage.config.faqs.8.answer': [
    '19:00~05:00',
    '가능합니다. 다만 19:00~04:55 직전에는 야간할증 15,000원이 적용됩니다. 입고·출고 각각 적용되며, 늦은 시간 이용 예정일 때는 사전 연락을 부탁드립니다.',
  ],
};

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

function walk(node, path, done) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.stringValue === 'string') {
    const rule = UPDATES[path];
    if (!rule) return;
    const [mustContain, next] = rule;
    if (node.stringValue === next) {
      done.push([path, '이미 맞음']);
    } else if (node.stringValue.includes(mustContain)) {
      done.push([path, `${node.stringValue}\n    → ${next}`]);
      node.stringValue = next;
    } else {
      done.push([path, `건너뜀(예상과 다른 문구): ${node.stringValue}`]);
    }
    return;
  }
  if (node.mapValue) for (const [k, v] of Object.entries(node.mapValue.fields || {})) walk(v, `${path}.${k}`, done);
  if (node.arrayValue) (node.arrayValue.values || []).forEach((v, i) => walk(v, `${path}.${i}`, done));
}

const headers = { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' };
const res = await fetch(URL_DOC, { headers });
const doc = await res.json();
if (!res.ok) {
  console.error('문서를 읽지 못했습니다:', doc.error?.message || res.status);
  process.exit(1);
}
const ph = doc.fields.partnerHomepage;
const done = [];
walk(ph, 'partnerHomepage', done);
for (const [p, msg] of done) console.log(`■ ${p}\n    ${msg}`);
const missing = Object.keys(UPDATES).filter((p) => !done.some(([d]) => d === p));
if (missing.length) console.log(`(못 찾은 칸: ${missing.join(', ')})`);

if (!APPLY) {
  console.log('\n미리보기만 했습니다. 저장하려면 --apply 를 붙여 다시 실행하세요.');
  process.exit(0);
}
const put = await fetch(
  `${URL_DOC}?updateMask.fieldPaths=partnerHomepage&currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}`,
  { method: 'PATCH', headers, body: JSON.stringify({ fields: { partnerHomepage: ph } }) }
);
if (put.ok) console.log('\n✓ 저장했습니다');
else {
  const j = await put.json().catch(() => ({}));
  console.error(`\n✗ 저장 실패: ${j.error?.message || put.status} (다시 실행해 주세요)`);
  process.exit(1);
}
