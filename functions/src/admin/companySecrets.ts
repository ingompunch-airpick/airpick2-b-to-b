import * as admin from 'firebase-admin';

export type SecretEmployee = {
  id: string;
  loginId: string;
  password: string;
  name: string;
  role: 'admin' | 'driver';
};

/** companies/{companyId}/secrets/login — 클라이언트 Rules 전부 차단 */
export function companyLoginSecretsRef(companyId: string) {
  return admin
    .firestore()
    .collection('companies')
    .doc(companyId)
    .collection('secrets')
    .doc('login');
}

export async function writeCompanyLoginPassword(
  companyId: string,
  password: string
): Promise<void> {
  const trimmed = password.trim();
  if (!trimmed) return;
  await companyLoginSecretsRef(companyId).set(
    {
      password: trimmed,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

/** 공개 companies 문서에서 password 필드 제거 */
export async function stripPasswordFromCompanyDoc(companyId: string): Promise<void> {
  await admin
    .firestore()
    .collection('companies')
    .doc(companyId)
    .set({ password: admin.firestore.FieldValue.delete() }, { merge: true });
}

/**
 * 로그인 검증용 마스터 비밀번호 조회.
 * secrets 우선, 없으면 레거시 companies.password 를 secrets로 이전 후 공개 문서에서 삭제.
 */
export async function resolveLoginPasswordForVerify(companyId: string): Promise<string | null> {
  const secretsSnap = await companyLoginSecretsRef(companyId).get();
  const fromSecrets =
    typeof secretsSnap.data()?.password === 'string'
      ? String(secretsSnap.data()?.password).trim()
      : '';
  if (fromSecrets) return fromSecrets;

  const companySnap = await admin.firestore().collection('companies').doc(companyId).get();
  const fromCompany =
    typeof companySnap.data()?.password === 'string'
      ? String(companySnap.data()?.password).trim()
      : '';
  if (!fromCompany) return null;

  await writeCompanyLoginPassword(companyId, fromCompany);
  await stripPasswordFromCompanyDoc(companyId);
  return fromCompany;
}

function normalizeSecretEmployees(raw: unknown): SecretEmployee[] {
  if (!Array.isArray(raw)) return [];
  const out: SecretEmployee[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const loginId = typeof r.loginId === 'string' ? r.loginId.trim().toLowerCase() : '';
    const password = typeof r.password === 'string' ? r.password.trim() : '';
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `emp_${loginId}`;
    const name = typeof r.name === 'string' ? r.name.trim() : loginId;
    const role = r.role === 'admin' ? 'admin' : 'driver';
    if (!loginId || !password) continue;
    out.push({ id, loginId, password, name, role });
  }
  return out;
}

export async function readSecretEmployees(companyId: string): Promise<SecretEmployee[]> {
  const snap = await companyLoginSecretsRef(companyId).get();
  return normalizeSecretEmployees(snap.data()?.employees);
}

/** secrets + 공개 employees(비밀번호 제외) 동시 반영 */
export async function writeCompanyEmployees(
  companyId: string,
  employees: SecretEmployee[]
): Promise<void> {
  const cleaned = normalizeSecretEmployees(employees);
  await companyLoginSecretsRef(companyId).set(
    {
      employees: cleaned,
      employeesUpdatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  const publicEmployees = cleaned.map((e) => ({
    id: e.id,
    name: e.name,
    loginId: e.loginId,
    role: e.role,
  }));

  await admin
    .firestore()
    .collection('companies')
    .doc(companyId)
    .set(
      {
        employees: publicEmployees,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
}

/**
 * 직원 비밀번호 조회. secrets 우선, 없으면 공개 employees[].password 에서 이전.
 */
export async function resolveEmployeeForVerify(
  companyId: string,
  loginId: string
): Promise<SecretEmployee | null> {
  const want = loginId.trim().toLowerCase();
  if (!want) return null;

  const fromSecrets = (await readSecretEmployees(companyId)).find((e) => e.loginId === want);
  if (fromSecrets) return fromSecrets;

  const companySnap = await admin.firestore().collection('companies').doc(companyId).get();
  const publicEmps = Array.isArray(companySnap.data()?.employees)
    ? (companySnap.data()?.employees as Record<string, unknown>[])
    : [];
  const pub = publicEmps.find(
    (e) => typeof e?.loginId === 'string' && e.loginId.trim().toLowerCase() === want
  );
  if (!pub) return null;

  const password = typeof pub.password === 'string' ? pub.password.trim() : '';
  if (!password) return null;

  const migrated: SecretEmployee = {
    id: typeof pub.id === 'string' && pub.id.trim() ? pub.id.trim() : `emp_${want}`,
    loginId: want,
    password,
    name: typeof pub.name === 'string' ? pub.name.trim() : want,
    role: pub.role === 'admin' ? 'admin' : 'driver',
  };

  const existing = await readSecretEmployees(companyId);
  const next = [...existing.filter((e) => e.loginId !== want), migrated];
  await writeCompanyEmployees(companyId, next);
  return migrated;
}
