import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import sharp from 'sharp';
import { kstToday } from '../ops/insuranceExpiry';
import { GEMINI_LOCATION, GEMINI_MODEL, googlePost, projectId } from './analyzeDocuments';
import { parseItineraryResponse, pickTrip } from './itineraryParse';

/**
 * 손님 예약 화면 「항공권·일정표 사진으로 채우기」
 * 사진·PDF 한 장, 또는 카톡으로 받은 일정표 글자를 받아 항공편만 읽고 돌려준다.
 *  - 파일은 어디에도 저장하지 않는다 (메모리에서 읽고 버림)
 *  - 이름·예약번호·여권번호는 읽지 않는다 (AI 에게 항공편 칸만 요청)
 *  - 비용 보호: 손님 1명 하루 10번, 전체 하루 500번
 */

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_TEXT = 6000;
const MAX_EDGE = 2000;
const PER_USER_DAILY = 10;
const TOTAL_DAILY = 500;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const PROMPT = `이 자료는 손님이 올린 항공권(e-티켓), 여행사 일정표, 예약 확인 화면 캡처, 또는 카톡으로 받은 일정표 글자일 수 있다.
항공편 구간만 모두 찾아 JSON 으로 적어라.

규칙:
- 사람 이름, 예약번호, 여권번호, 연락처, 금액은 절대 적지 않는다.
- 구간마다: 항공사 코드(IATA 2글자), 항공사 이름(적힌 그대로), 편명(예: KE701), 출발 공항 코드(3글자), 도착 공항 코드(3글자),
  출발 날짜·시간, 도착 날짜·시간, 출발·도착 터미널(적혀 있을 때만, "1" 또는 "2").
- 날짜는 YYYY-MM-DD, 시간은 24시간 HH:MM. 모두 그 공항의 현지 시간으로, 적힌 그대로.
- 연도가 없으면 오늘(${'{TODAY}'}) 이후 가장 가까운 날짜로 정한다.
- 도착이 다음 날(+1)이면 도착 날짜를 하루 뒤로 적는다.
- 공항 이름만 있으면 코드로 바꾼다 (인천=ICN, 김포=GMP, 나리타=NRT 등). 모르면 그 구간은 적지 않는다.
- 공동운항이면 항공권에 크게 적힌 편명을 쓴다.
- 글자로 붙여넣은 일정은 여러 구간이 한 줄에 「/」「,」「→」 등으로 이어져 있을 수 있다. 구간마다 빠짐없이 따로 적는다.
  왕복이면 보통 가는 편(인천 출발)과 오는 편(인천 도착)이 모두 있다.
- 항공편이 하나도 없는 자료면 isItinerary=false, legs=[].`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    isItinerary: { type: 'BOOLEAN' },
    legs: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          airlineCode: { type: 'STRING' },
          airlineName: { type: 'STRING' },
          flightNumber: { type: 'STRING' },
          fromAirport: { type: 'STRING' },
          toAirport: { type: 'STRING' },
          departDate: { type: 'STRING' },
          departTime: { type: 'STRING' },
          arriveDate: { type: 'STRING' },
          arriveTime: { type: 'STRING' },
          departTerminal: { type: 'STRING' },
          arriveTerminal: { type: 'STRING' },
        },
        required: ['flightNumber', 'fromAirport', 'toAirport', 'departDate', 'departTime'],
      },
    },
  },
  required: ['isItinerary', 'legs'],
};

/** 하루 사용량 — 넘으면 resource-exhausted */
async function countUse(uid: string, today: string): Promise<void> {
  const ref = admin.firestore().doc(`itineraryUsage/${today}`);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const total = Number(snap.get('total') || 0);
    const mine = Number(snap.get(`users.${uid}`) || 0);
    if (total >= TOTAL_DAILY) {
      throw new HttpsError('resource-exhausted', '지금은 사진 읽기를 쓸 수 없어요. 항공편을 직접 넣어 주세요.');
    }
    if (mine >= PER_USER_DAILY) {
      throw new HttpsError('resource-exhausted', '오늘은 사진 읽기를 너무 많이 썼어요. 항공편을 직접 넣어 주세요.');
    }
    tx.set(
      ref,
      {
        total: admin.firestore.FieldValue.increment(1),
        users: { [uid]: admin.firestore.FieldValue.increment(1) },
      },
      { merge: true }
    );
  });
}

export const readItinerary = onCall(
  { region: 'asia-northeast3', memory: '512MiB', timeoutSeconds: 60, maxInstances: 5 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', '잠시 후 다시 시도해 주세요.');

    const data = (request.data || {}) as { fileBase64?: unknown; mimeType?: unknown; text?: unknown };
    const pastedText = typeof data.text === 'string' ? data.text.trim() : '';
    const mimeType = String(data.mimeType || '').toLowerCase();
    const isPdf = mimeType === 'application/pdf';

    /** Gemini 에 보낼 자료 — 사진·PDF 이거나 붙여넣은 글자 */
    let filePart: { inlineData: { mimeType: string; data: string } } | { text: string };
    if (pastedText) {
      if (pastedText.length > MAX_TEXT) {
        throw new HttpsError('invalid-argument', '글자가 너무 길어요. 항공편 부분만 붙여넣어 주세요.');
      }
      // 「… 도착 / 오는편 …」처럼 한 줄에 이어 붙인 일정은 구간마다 줄을 나눠 준다 (12/20 같은 날짜의 / 는 그대로)
      const lines = pastedText.replace(/\s+\/\s+/g, '\n');
      filePart = { text: `----- 손님이 붙여넣은 글자 -----\n${lines}\n----- 끝 -----` };
    } else {
      if (!isPdf && !IMAGE_TYPES.has(mimeType)) {
        throw new HttpsError('invalid-argument', '사진(JPG·PNG)이나 PDF만 올릴 수 있어요.');
      }
      const raw = Buffer.from(String(data.fileBase64 || ''), 'base64');
      if (!raw.length) throw new HttpsError('invalid-argument', '파일이 비어 있어요.');
      if (raw.length > MAX_BYTES) throw new HttpsError('invalid-argument', '파일이 너무 커요. 6MB 이하로 올려 주세요.');
      let body: Buffer = raw;
      let bodyType = mimeType;
      if (!isPdf) {
        try {
          body = await sharp(raw)
            .rotate()
            .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
          bodyType = 'image/jpeg';
        } catch {
          throw new HttpsError('invalid-argument', '사진을 열 수 없어요. 다른 사진으로 올려 주세요.');
        }
      }
      filePart = { inlineData: { mimeType: bodyType, data: body.toString('base64') } };
    }

    const today = kstToday();
    await countUse(uid, today);

    const url =
      `https://${GEMINI_LOCATION}-aiplatform.googleapis.com/v1/projects/${projectId()}` +
      `/locations/${GEMINI_LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;
    let text = '';
    try {
      const res = await googlePost<{
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      }>(url, {
        contents: [
          {
            role: 'user',
            parts: [
              filePart,
              { text: PROMPT.replace('{TODAY}', today) },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
      });
      text = (res.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    } catch (err) {
      logger.error('readItinerary: gemini failed', { message: (err as Error).message });
      throw new HttpsError('unavailable', '지금은 읽을 수 없어요. 항공편을 직접 넣어 주세요.');
    }

    const parsed = parseItineraryResponse(text);
    if (!parsed.isItinerary || !parsed.legs.length) {
      return { ok: false, message: '항공편을 찾지 못했어요. 항공편이 보이게 다시 찍거나 직접 넣어 주세요.' };
    }
    const pick = pickTrip(parsed.legs, today);
    // 내용은 남기지 않고 결과 개수만 기록
    logger.info('readItinerary', {
      legs: parsed.legs.length,
      outbound: !!pick.outbound,
      inbound: !!pick.inbound,
      kind: pastedText ? 'text' : isPdf ? 'pdf' : 'image',
    });
    return { ok: !!pick.outbound || !!pick.inbound, ...pick };
  }
);
