import * as admin from 'firebase-admin';

/** published 후기만으로 companies.rating / reviews_count 재계산 */
export async function recomputeCompanyRating(
  db: admin.firestore.Firestore,
  companyId: string
): Promise<{ rating: number; reviews_count: number }> {
  const snap = await db
    .collection('reviews')
    .where('companyId', '==', companyId)
    .where('status', '==', 'published')
    .get();

  const ratings: number[] = [];
  for (const doc of snap.docs) {
    const rating = Number(doc.data().rating);
    if (Number.isInteger(rating) && rating >= 1 && rating <= 5) {
      ratings.push(rating);
    }
  }

  const reviews_count = ratings.length;
  const rating =
    reviews_count > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / reviews_count) * 10) / 10
      : 0;

  const companyRef = db.doc(`companies/${companyId}`);
  const companySnap = await companyRef.get();
  if (companySnap.exists) {
    await companyRef.update({ rating, reviews_count });
  }

  const recent = snap.docs
    .map((docSnap) => {
      const row = docSnap.data();
      const score = Number(row.rating);
      if (!Number.isInteger(score) || score < 1 || score > 5) return null;
      const photoUrls = Array.isArray(row.photoUrls)
        ? row.photoUrls.map((url) => String(url || '').trim()).filter(Boolean).slice(0, 3)
        : [];
      const body = String(row.body || '').trim().slice(0, 200);
      const carMask = String(row.carMask || '').trim();
      return {
        id: docSnap.id,
        rating: score,
        createdAt: String(row.createdAt || ''),
        authorMask: String(row.authorMask || '익명').trim() || '익명',
        ...(body ? { body } : {}),
        ...(photoUrls.length ? { photoUrls } : {}),
        ...(carMask ? { carMask } : {}),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  await db.collection('reviewSummaries').doc(companyId).set({
    count: reviews_count,
    averageRating: reviews_count > 0 ? rating : null,
    recent,
    updatedAt: new Date().toISOString(),
  });

  return { rating, reviews_count };
}
