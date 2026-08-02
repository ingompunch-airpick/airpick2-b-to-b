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
  return { rating, reviews_count };
}
