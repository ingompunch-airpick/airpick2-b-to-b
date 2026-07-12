import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { assertPlatformAdmin } from './assertPlatformAdmin';
import {
  ALLOWED_COMPANY_CREATE_EXTRA_KEYS,
  ALLOWED_COMPANY_PATCH_KEYS,
  COMPANY_ID_RE,
  PROTECTED_COMPANY_IDS,
} from './constants';
import { omitUndefinedDeep } from './omitUndefined';
import {
  stripPasswordFromCompanyDoc,
  writeCompanyLoginPassword,
} from './companySecrets';

type UpsertMode = 'create' | 'update';

interface AdminUpsertCompanyRequest {
  mode?: UpsertMode;
  companyId?: unknown;
  patch?: unknown;
  document?: unknown;
}

function pickAllowedFields(
  raw: unknown,
  allowedKeys: readonly string[],
  label: string
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', `${label} 객체가 필요합니다.`);
  }
  const allowed = new Set<string>(allowedKeys);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  if (Object.keys(out).length === 0) {
    throw new HttpsError('invalid-argument', '저장할 필드가 없습니다.');
  }
  return out;
}

function extractPassword(fields: Record<string, unknown>): string | null {
  if (typeof fields.password !== 'string') return null;
  const trimmed = fields.password.trim();
  delete fields.password;
  return trimmed || null;
}

/**
 * 본사 companies 생성·수정.
 * password 는 companies/{id}/secrets/login 에만 저장 (공개 문서 비노출).
 */
export const adminUpsertCompany = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    const adminUser = assertPlatformAdmin(request);
    const data = (request.data ?? {}) as AdminUpsertCompanyRequest;
    const mode: UpsertMode = data.mode === 'create' ? 'create' : 'update';

    const companyId =
      typeof data.companyId === 'string' ? data.companyId.trim().toLowerCase() : '';
    if (!COMPANY_ID_RE.test(companyId)) {
      throw new HttpsError('invalid-argument', 'companyId 형식이 올바르지 않습니다.');
    }
    if ((PROTECTED_COMPANY_IDS as readonly string[]).includes(companyId) && mode === 'create') {
      throw new HttpsError('invalid-argument', '플랫폼 본사 ID는 생성할 수 없습니다.');
    }

    const actor = {
      uid: adminUser.uid,
      email: adminUser.email,
    };
    const now = new Date().toISOString();
    const ref = admin.firestore().collection('companies').doc(companyId);

    if (mode === 'update') {
      const patch = pickAllowedFields(data.patch, ALLOWED_COMPANY_PATCH_KEYS, 'patch');
      const password = extractPassword(patch);
      const snap = await ref.get();
      if (!snap.exists) {
        throw new HttpsError('not-found', `companies/${companyId} 문서가 없습니다.`);
      }

      if (password) {
        await writeCompanyLoginPassword(companyId, password);
      }

      // FieldValue.delete() 는 omitUndefinedDeep 에 넣으면 센티널이 깨짐
      const cleanPatch = omitUndefinedDeep(patch);
      await ref.set(
        {
          ...cleanPatch,
          password: admin.firestore.FieldValue.delete(),
          updatedAt: now,
          updatedBy: actor,
        },
        { merge: true }
      );
      return { ok: true as const, companyId, mode };
    }

    // create
    const createKeys = [
      ...ALLOWED_COMPANY_PATCH_KEYS,
      ...ALLOWED_COMPANY_CREATE_EXTRA_KEYS,
    ];
    const document = pickAllowedFields(
      data.document ?? data.patch,
      createKeys,
      'document'
    );

    const isPrimary = document.isOperatorPrimary !== false;
    const password = extractPassword(document);

    if (isPrimary) {
      if (!password) {
        throw new HttpsError('invalid-argument', '대표 업체는 password가 필요합니다.');
      }
    } else {
      const parentId =
        typeof document.parentCompanyId === 'string'
          ? document.parentCompanyId.trim().toLowerCase()
          : '';
      if (!COMPANY_ID_RE.test(parentId) || parentId === companyId) {
        throw new HttpsError('invalid-argument', '유효한 parentCompanyId가 필요합니다.');
      }
      const parentSnap = await admin.firestore().collection('companies').doc(parentId).get();
      if (!parentSnap.exists) {
        throw new HttpsError('failed-precondition', `대표 업체 ${parentId} 가 없습니다.`);
      }
      document.parentCompanyId = parentId;
      document.isOperatorPrimary = false;
    }

    const snap = await ref.get();
    if (snap.exists) {
      throw new HttpsError('already-exists', `companies/${companyId} 가 이미 있습니다.`);
    }

    if (password) {
      await writeCompanyLoginPassword(companyId, password);
    }

    const payload = omitUndefinedDeep({
      ...document,
      id: companyId,
      status: typeof document.status === 'string' ? document.status : 'active',
      blockedDates: Array.isArray(document.blockedDates) ? document.blockedDates : [],
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    });

    await ref.set(payload);
    await stripPasswordFromCompanyDoc(companyId);

    return { ok: true as const, companyId, mode };
  }
);
