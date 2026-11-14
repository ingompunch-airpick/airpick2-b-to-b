import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

/** 에어픽.kr/join 입점 상담 신청 — 서버(submitPartnerApplication)가 만들고 본사가 상태만 바꾼다 */
export const PARTNER_APPLICATIONS = 'partnerApplications';

export type PartnerApplicationStatus = 'new' | 'contacted' | 'joined' | 'hold';

export const PARTNER_APPLICATION_STATUS_LABEL: Record<PartnerApplicationStatus, string> = {
  new: '새 신청',
  contacted: '연락함',
  joined: '입점 완료',
  hold: '보류',
};

export interface PartnerApplication {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  memo: string;
  status: PartnerApplicationStatus;
  hqNote: string;
  createdAtMs: number;
}

function toMs(v: unknown): number {
  const t = v as Timestamp | undefined;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
}

function normalizeStatus(v: unknown): PartnerApplicationStatus {
  return v === 'contacted' || v === 'joined' || v === 'hold' ? v : 'new';
}

/** 최근 200건 실시간 (신청은 하루 몇 건 수준이라 읽기 부담 작음) */
export function subscribePartnerApplications(
  onData: (rows: PartnerApplication[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(collection(db, PARTNER_APPLICATIONS), orderBy('createdAt', 'desc'), limit(200));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            companyName: String(x.companyName || ''),
            contactName: String(x.contactName || ''),
            phone: String(x.phone || ''),
            memo: String(x.memo || ''),
            status: normalizeStatus(x.status),
            hqNote: String(x.hqNote || ''),
            createdAtMs: toMs(x.createdAt),
          };
        })
      );
    },
    (err) => onError?.(err)
  );
}

/** 사이드 메뉴 빨간 숫자 — 새 신청 수 */
export function subscribeNewPartnerApplicationCount(onCount: (n: number) => void): () => void {
  const q = query(collection(db, PARTNER_APPLICATIONS), where('status', '==', 'new'), limit(50));
  return onSnapshot(
    q,
    (snap) => onCount(snap.size),
    () => onCount(0)
  );
}

export async function updatePartnerApplication(
  id: string,
  patch: { status?: PartnerApplicationStatus; hqNote?: string },
  updatedBy: string
): Promise<void> {
  await updateDoc(doc(db, PARTNER_APPLICATIONS, id), {
    ...patch,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}
