import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { recomputeParkingOccupancyIfCapEnabled } from './parkingOccupancy';

/**
 * 업체가 동시주차 만차(parkingCapEnabled)를 켜는 순간 occupancy 를 바로 채운다.
 */
export const onCompanySync = onDocumentWritten(
  {
    document: 'companies/{companyId}',
    region: 'asia-northeast3',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async (event) => {
    const companyId = String(event.params.companyId || '').trim();
    if (!companyId) return;
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    try {
      const n = await recomputeParkingOccupancyIfCapEnabled(companyId, before, after);
      if (n > 0) {
        console.log('[parkingOccupancy] recompute on cap enable', { companyId, docs: n });
      }
    } catch (err) {
      console.error('[parkingOccupancy] cap-enable recompute failed', {
        companyId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
);
