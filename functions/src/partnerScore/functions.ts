import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { assertPlatformAdmin } from '../admin/assertPlatformAdmin';
import { kstYmd } from './compute';
import { SCORE_START_MONTH, computeAndStoreMonth, runDailyPartnerScores } from './run';

/**
 * 매일 13:07 KST — 이번 달 운영 점수 갱신. 매달 1일엔 지난달 순위를 확정하고
 * 손님 추천순 가중치(partnerExposure)를 낸다. 1일 정오 출고 마감이 지난 뒤라 13시.
 */
export const updatePartnerScoresDaily = onSchedule(
  {
    schedule: '7 13 * * *',
    timeZone: 'Asia/Seoul',
    region: 'asia-northeast3',
    memory: '512MiB',
    timeoutSeconds: 300,
    maxInstances: 1,
    retryCount: 1,
  },
  async () => {
    const result = await runDailyPartnerScores();
    console.log('[partnerScores]', JSON.stringify(result));
  }
);

/** 본사 「지금 다시 계산」 — 이번 달은 진행 중으로, 지난달은 확정으로 다시 계산한다. */
export const recomputePartnerScores = onCall(
  {
    region: 'asia-northeast3',
    memory: '512MiB',
    timeoutSeconds: 300,
    maxInstances: 2,
  },
  async (request) => {
    const admin = assertPlatformAdmin(request);
    const current = kstYmd(Date.now()).slice(0, 7);
    const raw = String((request.data as { month?: unknown } | null)?.month ?? '').trim();
    const month = raw || current;
    if (!/^\d{4}-\d{2}$/.test(month) || month < SCORE_START_MONTH || month > current) {
      throw new HttpsError('invalid-argument', `${SCORE_START_MONTH}부터 이번 달까지만 계산할 수 있습니다.`);
    }
    return computeAndStoreMonth(month, { final: month < current, by: admin.email });
  }
);
