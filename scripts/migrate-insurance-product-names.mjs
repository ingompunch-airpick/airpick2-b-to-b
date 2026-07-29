/**
 * Firestore insurance.productName 레거시 명칭(발렛보험 등) → 배상책임보험 일괄 정리
 *
 * Usage:
 *   node scripts/migrate-insurance-product-names.mjs           # dry-run
 *   node scripts/migrate-insurance-product-names.mjs --apply   # write
 *
 * Auth: GOOGLE_APPLICATION_CREDENTIALS 또는 gcloud application-default login
 */
import admin from 'firebase-admin';

const PROJECT_ID = 'airpick-reservation';
const CANONICAL = '배상책임보험';

const ALIASES = new Set(['발렛보험', '발렛 보험', 'ValetInsurance', 'Valet Insurance']);

function normalizeProductName(name) {
  if (!name || typeof name !== 'string') return undefined;
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  if (ALIASES.has(trimmed) || ALIASES.has(trimmed.replace(/\s+/g, ''))) return CANONICAL;
  if (/발렛\s*보험/i.test(trimmed)) return CANONICAL;
  return trimmed;
}

function shouldMigrate(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  return normalizeProductName(trimmed) !== trimmed;
}

function patchInsuranceObject(insurance) {
  if (!insurance || typeof insurance !== 'object' || insurance.enrolled !== true) return null;

  const current = typeof insurance.productName === 'string' ? insurance.productName.trim() : '';
  const next = normalizeProductName(current) || (insurance.enrolled ? CANONICAL : undefined);

  if (current === next) return null;

  return {
    ...insurance,
    productName: next,
    updatedAt: new Date().toISOString(),
  };
}

async function scanCollection(db, collectionName) {
  const snap = await db.collection(collectionName).get();
  const updates = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const insurance = data.insurance;

    const patched = patchInsuranceObject(insurance);
    if (patched) {
      updates.push({
        collection: collectionName,
        id: doc.id,
        from: insurance?.productName ?? '(empty)',
        to: patched.productName,
      });
      continue;
    }

    if (insurance?.enrolled === true && !String(insurance.productName || '').trim()) {
      updates.push({
        collection: collectionName,
        id: doc.id,
        from: '(empty)',
        to: CANONICAL,
        fillEmpty: true,
      });
    }
  }

  return updates;
}

async function main() {
  const apply = process.argv.includes('--apply');

  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
  const db = admin.firestore();

  const companyUpdates = await scanCollection(db, 'companies');
  const reservationUpdates = await scanCollection(db, 'reservations');
  const updates = [...companyUpdates, ...reservationUpdates];

  if (updates.length === 0) {
    console.log('No insurance productName migrations needed.');
    return;
  }

  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — ${updates.length} document(s):`);
  for (const row of updates) {
    console.log(`  [${row.collection}/${row.id}] ${row.from} → ${row.to}`);
  }

  if (!apply) {
    console.log('\nRe-run with --apply to write changes.');
    return;
  }

  const batchSize = 400;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = db.batch();
    const chunk = updates.slice(i, i + batchSize);

    for (const row of chunk) {
      const ref = db.collection(row.collection).doc(row.id);
      batch.update(ref, {
        'insurance.productName': row.to,
        'insurance.updatedAt': new Date().toISOString(),
      });
    }

    await batch.commit();
    console.log(`Committed ${chunk.length} update(s).`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
