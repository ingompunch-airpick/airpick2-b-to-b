#!/usr/bin/env node
/**
 * 입점업체 보험기간을 증권에 적힌 대로 넣는다. (2026-11-27 증권 이미지 확인)
 *
 *   아시아  2026-07-03 ~ 2027-02-01  보험기간은 2027-07-03까지지만 담보 유효기간이 2027-02-01까지(분납)
 *   벅스    2026-09-29 ~ 2027-05-30  DB 취급업자보험(탁송운전위험)
 *   가유    2026-07-01 ~ 2027-07-01  현대해상 영업배상 F-2026-0393205
 *   안녕    2026-07-01 ~ 2027-07-01  가유와 같은 증권
 *   시즌    2026-07-01 ~ 2027-07-01  가유와 같은 증권
 *
 * 와와(--wawa): 올라와 있는 파일이 증권이 아니라 계약변경신청서이고, 보험기간이
 * 2025-10-01 ~ 2026-10-01 이라 이미 지났다. 주민등록번호로 보이는 13자리가 가려지지 않은 채
 * 손님 앱 「보험증권 보기」로 누구나 열 수 있어서, 파일을 지우고 링크를 뺀다.
 * 보험기간을 그 문서대로 넣어 손님 앱에는 「보험 갱신 확인 중」이 뜬다. 새 증권을 받으면 다시 올린다.
 *
 * 실행 (firebase login 된 상태, B2B 폴더에서):
 *   node scripts/set-insurance-periods.mjs                 ← 바뀔 내용만 보여 줌
 *   node scripts/set-insurance-periods.mjs --apply         ← 5곳 보험기간 저장
 *   node scripts/set-insurance-periods.mjs --apply --wawa  ← 와와 파일 삭제·링크 제거까지
 */
import fs from 'node:fs';
import os from 'node:os';

const PROJECT = 'airpick-reservation';
const BUCKET = 'airpick-reservation.firebasestorage.app';
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/companies`;
const APPLY = process.argv.includes('--apply');
const WAWA = process.argv.includes('--wawa');

const PERIODS = {
  asia: ['2026-07-03', '2027-02-01'],
  bucks: ['2026-09-29', '2027-05-30'],
  gayu: ['2026-07-01', '2027-07-01'],
  hi: ['2026-07-01', '2027-07-01'],
  season: ['2026-07-01', '2027-07-01'],
};
const WAWA_PERIOD = ['2025-10-01', '2026-10-01'];
const WAWA_OBJECT = 'companies/wawa/insurance/certificate_1786524373246.jpg';

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
  if (!json.access_token) throw new Error('firebase login 이 필요합니다: npx firebase login');
  return json.access_token;
}

const headers = { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' };

async function readCompany(id) {
  const res = await fetch(`${DOCS}/${id}`, { headers });
  const doc = await res.json();
  if (!res.ok) throw new Error(`${id} 읽기 실패: ${doc.error?.message || res.status}`);
  return doc;
}

/** insurance 맵 안의 필드만 바꾼다. 다른 사람이 그사이 고쳤으면(updateTime 다름) 실패한다. */
async function patchInsurance(id, doc, set, remove = []) {
  const fields = {};
  for (const [k, v] of Object.entries(set)) fields[k] = { stringValue: v };
  const masks = [...Object.keys(set), ...remove].map(
    (k) => `updateMask.fieldPaths=${encodeURIComponent(`insurance.${k}`)}`
  );
  const url =
    `${DOCS}/${id}?${masks.join('&')}` +
    `&currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { insurance: { mapValue: { fields } } } }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`${id} 저장 실패: ${err.error?.message || res.status}`);
  }
}

function insuranceOf(doc) {
  return doc.fields?.insurance?.mapValue?.fields || {};
}

for (const [id, [start, end]] of Object.entries(PERIODS)) {
  const doc = await readCompany(id);
  const ins = insuranceOf(doc);
  const now = `${ins.periodStart?.stringValue || '없음'} ~ ${ins.periodEnd?.stringValue || '없음'}`;
  if (ins.periodStart?.stringValue === start && ins.periodEnd?.stringValue === end) {
    console.log(`✓ ${id}: 이미 ${start} ~ ${end}`);
    continue;
  }
  console.log(`■ ${id}: ${now}  →  ${start} ~ ${end}`);
  if (APPLY) {
    await patchInsurance(id, doc, { periodStart: start, periodEnd: end });
    console.log('  저장했습니다');
  }
}

if (WAWA) {
  const doc = await readCompany('wawa');
  const ins = insuranceOf(doc);
  const url = ins.certificateUrl?.stringValue || '';
  console.log(`■ wawa: 보험증권 링크 ${url ? '있음 → 뺌' : '이미 없음'}, 보험기간 → ${WAWA_PERIOD.join(' ~ ')}`);
  console.log(`  파일 ${WAWA_OBJECT} 삭제`);
  if (APPLY) {
    if (url && !url.includes(encodeURIComponent(WAWA_OBJECT))) {
      throw new Error('와와 링크가 예상한 파일과 달라요. 멈춥니다.');
    }
    await patchInsurance(
      'wawa',
      doc,
      { periodStart: WAWA_PERIOD[0], periodEnd: WAWA_PERIOD[1] },
      url ? ['certificateUrl'] : []
    );
    const del = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(WAWA_OBJECT)}`,
      { method: 'DELETE', headers }
    );
    if (del.ok || del.status === 404) console.log('  링크 제거·파일 삭제했습니다');
    else console.log(`  링크는 뺐지만 파일 삭제 실패(${del.status}) — 콘솔 Storage에서 지워 주세요`);
  }
}

if (!APPLY) console.log('\n바뀔 내용만 보여 줬어요. 저장하려면 --apply 를 붙여 주세요.');
