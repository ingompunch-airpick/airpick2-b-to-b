/**
 * 후기 제출용 — checked_out·completed_out 인데 checkedOutAt·checkedOutBy 가 둘 다 없는 예약에
 * checkedOutAt 만 1회 채움. (클라이언트가 조작한 createdAt 은 쓰지 않음)
 *
 *   npx --yes tsx src/scripts/backfillCheckedOutAt.ts           # dry-run
 *   APPLY=1 npx --yes tsx src/scripts/backfillCheckedOutAt.ts   # 쓰기
 *
 * 값 우선순위: actualExitTime → endDate/arrival 시각(KST) → 서버 현재시각(ISO)
 */
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'airpick-reservation' });
}

const TARGET_STATUSES = new Set(['checked_out', 'completed_out']);

function ymd(v: unknown): string {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

function hm(v: unknown): string {
  const s = String(v || '').trim();
  return /^\d{2}:\d{2}/.test(s) ? s.slice(0, 5) : '12:00';
}

/** actualExitTime 또는 "YYYY-MM-DD HH:mm" / ISO → ISO 문자열 */
function toIsoCheckout(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  // KST wall clock "2026-11-01 14:30" or "2026-11-01T14:30"
  const m = t.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (m) {
    const d = new Date(`${m[1]}T${m[2]}:00+09:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function resolveCheckedOutAt(data: FirebaseFirestore.DocumentData): string {
  const actual = String(data.actualExitTime || '').trim();
  const fromActual = actual ? toIsoCheckout(actual) : null;
  if (fromActual) return fromActual;

  const end = String(data.endDate || '').trim();
  const fromEnd = end ? toIsoCheckout(end.includes('T') || end.includes(' ') ? end : `${end} 12:00`) : null;
  if (fromEnd) return fromEnd;

  const arrDate = ymd(data.arrivalDate) || ymd(data.exitDate);
  if (arrDate) {
    const fromArr = toIsoCheckout(`${arrDate} ${hm(data.arrivalTime)}`);
    if (fromArr) return fromArr;
  }

  return new Date().toISOString();
}

function needsBackfill(data: FirebaseFirestore.DocumentData): boolean {
  const status = String(data.status || '').trim();
  if (!TARGET_STATUSES.has(status)) return false;
  const at = String(data.checkedOutAt || '').trim();
  const by = String(data.checkedOutBy || '').trim();
  return !at && !by;
}

async function main(): Promise<void> {
  const apply = process.env.APPLY === '1';
  const db = admin.firestore();

  console.log(`# backfill checkedOutAt (APPLY=${apply ? '1' : '0'})`);

  const candidates: Array<{ id: string; status: string; source: string; value: string }> = [];

  for (const status of TARGET_STATUSES) {
    const snap = await db.collection('reservations').where('status', '==', status).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (!needsBackfill(data)) continue;
      const value = resolveCheckedOutAt(data);
      const source = String(data.actualExitTime || '').trim()
        ? 'actualExitTime'
        : String(data.endDate || '').trim()
          ? 'endDate'
          : ymd(data.arrivalDate) || ymd(data.exitDate)
            ? 'arrival'
            : 'now';
      candidates.push({ id: doc.id, status, source, value });
    }
  }

  console.log(`# need backfill: ${candidates.length}`);
  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const c of candidates) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    bySource[c.source] = (bySource[c.source] || 0) + 1;
  }
  console.log('# by status', byStatus);
  console.log('# by source', bySource);
  console.log('# sample (up to 15)');
  for (const c of candidates.slice(0, 15)) {
    console.log(`  ${c.id}\t${c.status}\t${c.source}\t${c.value}`);
  }

  if (!apply) {
    console.log('# dry-run only. APPLY=1 to write checkedOutAt');
    return;
  }

  let written = 0;
  const batchSize = 400;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const chunk = candidates.slice(i, i + batchSize);
    const batch = db.batch();
    for (const c of chunk) {
      batch.update(db.doc(`reservations/${c.id}`), {
        checkedOutAt: c.value,
        checkedOutAtBackfilledAt: new Date().toISOString(),
      });
    }
    await batch.commit();
    written += chunk.length;
    console.log(`# wrote ${written}/${candidates.length}`);
  }
  console.log('# done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
