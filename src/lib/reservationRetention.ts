import {
  PHOTO_STORAGE_RETENTION_DAYS,
  RESERVATION_DATA_RETENTION_DAYS,
  addDaysToIso,
  parseKstDateTimeString,
} from '../constants/dataRetention';
import { getKSTDateTimeString } from '../utils/kstDate';

/** 출차 완료 시 Firestore에 기록할 보관 만료 시각 */
export function buildCheckoutRetentionFields(actualExitTimeKst?: string): {
  actualExitTime: string;
  completedOutAt: string;
  dataPurgeAt: string;
  storagePurgeAt: string;
} {
  const actualExitTime = actualExitTimeKst?.trim() || getKSTDateTimeString();
  const completedOutAt = parseKstDateTimeString(actualExitTime);
  return {
    actualExitTime,
    completedOutAt: completedOutAt.toISOString(),
    dataPurgeAt: addDaysToIso(completedOutAt, RESERVATION_DATA_RETENTION_DAYS),
    storagePurgeAt: addDaysToIso(completedOutAt, PHOTO_STORAGE_RETENTION_DAYS),
  };
}
