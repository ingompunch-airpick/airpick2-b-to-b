import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { ensurePlatformAdminAuth } from './firebaseAuth';
import {
  countFromUnknown,
  homepageVisitFetchWindow,
  HOMEPAGE_STATS_COMPANY_IDS,
  sourcesFromUnknown,
  type HomepageDayStat,
} from '../utils/partnerHomepageStats';

export async function fetchPartnerHomepageDays(today: string): Promise<HomepageDayStat[]> {
  await ensurePlatformAdminAuth();
  const { start, end } = homepageVisitFetchWindow(today);
  const groups = await Promise.all(
    HOMEPAGE_STATS_COMPANY_IDS.map(async (companyId) => {
      const snap = await getDocs(
        query(
          collection(db, 'partnerHomepageStats', companyId, 'days'),
          where(documentId(), '>=', start),
          where(documentId(), '<=', end)
        )
      );
      return snap.docs.map((item) => {
        const data = item.data() as { pageViews?: unknown; sources?: unknown };
        return {
          companyId,
          date: item.id,
          pageViews: countFromUnknown(data.pageViews),
          sources: sourcesFromUnknown(data.sources),
        };
      });
    })
  );
  return groups.flat();
}
