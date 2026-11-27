/**
 * 서류 자동 분류 — 주민번호 찾기·가림, AI 응답 검사, 경고 계산. 실행: cd functions && npm test
 * 숫자는 모두 지어낸 값이다. 실제 서류의 번호를 여기에 쓰지 않는다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { findRrns, maskRects, maskSvg, symbolsFromVisionPage } = require('../lib/documents/rrn.js');
const { parseExtraction, reviewDocuments, normalizeDate } = require('../lib/documents/classify.js');

/** 글자마다 10px 칸을 주는 가짜 OCR 줄 */
function line(text, y = 100, x0 = 0) {
  const syms = [...text].map((ch, i) => ({ text: ch, box: { x: x0 + i * 10, y, w: 9, h: 14 } }));
  syms[syms.length - 1].breakAfter = 'line';
  return syms;
}

test('주민번호 뒤 7자리만 찾는다 (하이픈·붙여쓰기·이름 붙은 경우)', () => {
  const hits = findRrns([...line('9001011234567/홍길동'), ...line('850505-2345678', 200)]);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].birth, '900101');
  assert.equal(hits[0].boxes.length, 7);
  assert.equal(hits[0].boxes[0].x, 60); // 7번째 글자부터
  assert.equal(hits[1].boxes.length, 7);
});

test('이미 가린 번호·사업자번호·날짜 아닌 숫자는 건너뛴다', () => {
  const hits = findRrns([
    ...line('900101-1******'),
    ...line('123-45-67890', 140),
    ...line('9913991234567', 180), // 13월 99일 — 주민번호 아님
    ...line('2026.10.01~2027.10.01', 220),
  ]);
  assert.equal(hits.length, 0);
});

test('Vision 응답 모양 → 글자 목록 (정규화 좌표 포함)', () => {
  const v = (x, y) => ({ x, y });
  const page = {
    width: 1000,
    height: 2000,
    blocks: [
      {
        paragraphs: [
          {
            words: [
              {
                symbols: [
                  {
                    text: '9',
                    boundingBox: { normalizedVertices: [v(0.1, 0.1), v(0.11, 0.1), v(0.11, 0.11), v(0.1, 0.11)] },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const syms = symbolsFromVisionPage(page);
  assert.equal(syms.length, 1);
  assert.equal(Math.round(syms[0].box.x), 100);
  assert.equal(Math.round(syms[0].box.y), 200);
  assert.equal(Math.round(syms[0].box.w), 10);
  assert.equal(Math.round(syms[0].box.h), 20);
});

test('가림 상자는 이미지 안에서 검게 칠해진다', async () => {
  const width = 200;
  const height = 100;
  const base = await sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  const rects = maskRects([{ birth: '900101', boxes: [{ x: 50, y: 40, w: 20, h: 10 }] }], width, height);
  const out = await sharp(base)
    .composite([{ input: Buffer.from(maskSvg(rects, width, height)), top: 0, left: 0 }])
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = (x, y) => out.data[(y * out.info.width + x) * out.info.channels];
  assert.ok(px(60, 45) < 30, '가운데는 검정');
  assert.ok(px(10, 10) > 220, '바깥은 그대로');
});

test('AI 응답 검사 — 날짜·사업자번호 정리, 모르는 종류는 기타', () => {
  const doc = parseExtraction(
    '```json\n{"docType":"insurance_certificate","docTitle":"자동차보험 가입증명서","insurance":{"insurer":"한국손해보험","insuredName":"가나다 주차대행","insuredBusinessNumber":"1234567890","periodStart":"2026년 07월 03일","periodEnd":"2027.07.03","coverageEnd":"2027-02-01","limitSummary":"대인 무한 · 대물 2억"},"unmaskedRrnCount":0}\n```'
  );
  assert.equal(doc.docType, 'insurance_certificate');
  assert.equal(doc.insurance.periodStart, '2026-07-03');
  assert.equal(doc.insurance.periodEnd, '2027-07-03');
  assert.equal(doc.insurance.insuredBusinessNumber, '123-45-67890');
  assert.equal(parseExtraction('not json').docType, 'other');
  assert.equal(parseExtraction('{"docType":"passport","docTitle":"x","unmaskedRrnCount":0}').docType, 'other');
  assert.equal(normalizeDate('2026.02.30'), undefined);
});

test('경고 — 증권 아님·만기 지남·상호 다름·분납 만기·PDF 주민번호', () => {
  const reviews = reviewDocuments(
    [
      {
        extracted: {
          docType: 'business_registration',
          docTitle: '사업자등록증',
          business: { name: '라마바 주차대행', registrationNumber: '123-45-67890' },
          unmaskedRrnCount: 0,
        },
        rrnMasked: 0,
        isPdf: false,
      },
      {
        extracted: {
          docType: 'insurance_certificate',
          docTitle: '가입증명서',
          insurance: {
            insurer: '한국손해보험',
            insuredName: '가나다 주차대행',
            insuredBusinessNumber: '123-45-67890',
            periodStart: '2026-07-03',
            periodEnd: '2027-07-03',
            coverageEnd: '2027-02-01',
            limitSummary: '대인 무한',
          },
          unmaskedRrnCount: 0,
        },
        rrnMasked: 0,
        isPdf: false,
      },
      {
        extracted: {
          docType: 'insurance_other',
          docTitle: '계약변경신청서',
          insurance: { insurer: '한국손해보험', periodStart: '2025-10-01', periodEnd: '2026-10-01' },
          unmaskedRrnCount: 2,
        },
        rrnMasked: 2,
        isPdf: false,
      },
      {
        extracted: {
          docType: 'insurance_certificate',
          docTitle: '증권',
          insurance: { periodStart: '2026-01-01', periodEnd: '2026-12-31' },
          unmaskedRrnCount: 1,
        },
        rrnMasked: 0,
        isPdf: true,
      },
    ],
    '2026-11-27'
  );
  assert.equal(reviews[0].suggestion.businessRegistration.registrationNumber, '123-45-67890');
  assert.equal(reviews[1].suggestion.insurance.periodEnd, '2027-02-01');
  assert.ok(reviews[1].notes.some((n) => n.includes('담보 유효기간')));
  assert.ok(reviews[1].warnings.some((w) => w.includes('가나다')));
  assert.ok(reviews[2].warnings.some((w) => w.includes('계약변경신청서')));
  assert.ok(reviews[2].warnings.some((w) => w.includes('만기가 지났어요')));
  assert.ok(reviews[2].notes.some((n) => n.includes('2곳을 가렸어요')));
  assert.equal(reviews[2].publishable, true);
  assert.equal(reviews[2].suggestion.insurance, undefined); // 증권 아님 → 입력칸에 안 넣음
  assert.equal(reviews[3].publishable, false); // PDF에 주민번호
});

const { matchCompanies } = require('../lib/documents/match.js');

const COMPANIES = [
  { id: 'alpha', name: '알파 발렛', representative: '김하나' },
  { id: 'beta', name: '베타 주차대행', representative: '이두리', businessNumber: '123-45-67890' },
  { id: 'gamma', name: '감마 주차대행', representative: '박세찌' },
  { id: 'gamma_sub', name: '감마투 주차대행', representative: '박세찌', parentCompanyId: 'gamma' },
  { id: 'delta', name: '델타 주차대행', representative: '최네리', insuredName: '(주)델타모빌리티' },
];

const extracted = (over) => ({ docType: 'insurance_certificate', docTitle: '증권', unmaskedRrnCount: 0, relatedNames: [], ...over });

test('업체 찾기 — 사업자번호가 가장 확실', () => {
  const c = matchCompanies(
    extracted({ docType: 'business_registration', business: { name: '전혀다른상호', registrationNumber: '123-45-67890' } }),
    COMPANIES
  );
  assert.equal(c[0].companyId, 'beta');
  assert.equal(c[0].selected, true);
});

test('업체 찾기 — 대표자 이름 하나만 맞으면 그 업체', () => {
  const c = matchCompanies(extracted({ relatedNames: ['김하나', '홍길동'] }), COMPANIES);
  assert.deepEqual(c.filter((x) => x.selected).map((x) => x.companyId), ['alpha']);
});

test('업체 찾기 — 대표가 같은 업체가 여럿이면 고르지 않고 후보만', () => {
  const c = matchCompanies(extracted({ relatedNames: ['박세찌'] }), COMPANIES);
  assert.equal(c.filter((x) => x.selected).length, 0);
  assert.deepEqual(c.map((x) => x.companyId).sort(), ['gamma', 'gamma_sub']);
});

test('업체 찾기 — 상호가 맞으면 고르고, 같은 운영자 업체는 후보로', () => {
  const c = matchCompanies(extracted({ insurance: { insuredName: '감마 주차대행' } }), COMPANIES);
  const gamma = c.find((x) => x.companyId === 'gamma');
  const sub = c.find((x) => x.companyId === 'gamma_sub');
  assert.equal(gamma.selected, true);
  assert.equal(sub.selected, false);
  assert.ok(sub.reasons.includes('같은 운영자'));
});

test('업체 찾기 — 지난번 저장한 피보험자 상호로 갱신 서류를 붙인다', () => {
  const c = matchCompanies(extracted({ insurance: { insuredName: '㈜델타모빌리티' } }), COMPANIES);
  assert.deepEqual(c.filter((x) => x.selected).map((x) => x.companyId), ['delta']);
});

test('업체 찾기 — 아무것도 안 맞으면 빈 목록', () => {
  assert.equal(matchCompanies(extracted({ relatedNames: ['아무개'] }), COMPANIES).length, 0);
});
