import * as admin from 'firebase-admin';

type HandoffType = 'curb' | 'meet_greet' | 'drop';

const ITCHA_COMPANY_IDS = new Set(['gayu', 'season', 'hi', 'annyeong']);

const METHOD_LABEL: Record<HandoffType, string> = {
  drop: '단기주차장에 세우고 내리기',
  curb: '출국장에서 기사에게 맡기기',
  meet_greet: '출국장에서 안내 후 맡기기',
};

const PLACE_LABEL: Record<'drop' | 'curb', Record<'T1' | 'T2', string>> = {
  drop: {
    T1: 'T1 지하2층 H26',
    T2: 'T2 2층 서편 146',
  },
  curb: {
    T1: '출국장 3층',
    T2: '출국장 3층',
  },
};

function normalizeTerminal(raw?: string | null): 'T1' | 'T2' | null {
  const t = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (t === 'T1' || t === '1' || t.includes('제1') || t.includes('1터미널')) return 'T1';
  if (t === 'T2' || t === '2' || t.includes('제2') || t.includes('2터미널')) return 'T2';
  return null;
}

function productOffers(
  p: { hidden?: boolean; curb?: boolean; meet?: boolean; meetGreet?: boolean; drop?: boolean },
  handoff: HandoffType
): boolean {
  if (p.hidden) return false;
  if (handoff === 'curb') return Boolean(p.curb || p.meet);
  if (handoff === 'meet_greet') return Boolean(p.meetGreet);
  return Boolean(p.drop);
}

function resolveHandoffType(
  companyId: string | undefined,
  products: Array<Record<string, unknown>>
): HandoffType | null {
  if (ITCHA_COMPANY_IDS.has(String(companyId || '').trim().toLowerCase())) return 'drop';

  const visible = products.filter((p) => p.hidden !== true);
  if (visible.length === 0) return null;

  const hasCurb = visible.some((p) => productOffers(p, 'curb'));
  const hasDrop = visible.some((p) => productOffers(p, 'drop'));
  const hasGreet = visible.some((p) => productOffers(p, 'meet_greet'));

  if (hasDrop && !hasCurb && !hasGreet) return 'drop';
  if (hasCurb && !hasDrop && !hasGreet) return 'curb';
  if (hasGreet && !hasDrop && !hasCurb) return 'meet_greet';
  if (hasDrop) return 'drop';
  if (hasCurb) return 'curb';
  if (hasGreet) return 'meet_greet';
  return null;
}

export type AlimtalkHandoffLabels = {
  companyName: string;
  handoffMethod: string;
  pickupGuide: string;
};

/**
 * 알림톡 #{입고방식}·#{픽업안내} — 접수증/가는길과 같은 규칙으로 채운다.
 * 상품이 여러 개면 드랍 우선. 밋앤그릿은 장소 좌표가 없어 안내 문구만.
 */
export async function resolveAlimtalkHandoffLabels(
  companyId: string | undefined,
  departureTerminal?: string,
  fallbackCompanyName?: string
): Promise<AlimtalkHandoffLabels> {
  let companyName = (fallbackCompanyName || '').trim();
  let products: Array<Record<string, unknown>> = [];

  if (companyId) {
    try {
      const snap = await admin.firestore().doc(`companies/${companyId}`).get();
      const data = snap.data() || {};
      if (!companyName) {
        companyName = String(data.name || data.companyName || '').trim();
      }
      if (Array.isArray(data.parkingProducts)) {
        products = data.parkingProducts as Array<Record<string, unknown>>;
      }
    } catch (err) {
      console.warn('[alimtalk] handoff company read failed', {
        companyId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const handoff = resolveHandoffType(companyId, products);
  const terminal = normalizeTerminal(departureTerminal);
  const handoffMethod = handoff ? METHOD_LABEL[handoff] : '예약 업체 안내 참고';
  let pickupGuide = '가는 길 보기에서 확인';
  if (handoff === 'drop' || handoff === 'curb') {
    if (terminal) pickupGuide = PLACE_LABEL[handoff][terminal];
  } else if (handoff === 'meet_greet') {
    pickupGuide = '업체 안내 장소';
  }

  return {
    companyName: companyName || '에어픽 제휴 주차',
    handoffMethod,
    pickupGuide,
  };
}
