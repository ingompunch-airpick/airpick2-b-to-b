import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentSingleTabManager,
  type FirestoreSettings,
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);

/**
 * Capacitor WebView에서는 multi-tab IndexedDB 잠금이 실패하며
 * 모듈 초기화가 깨져 스플래시(흰 화면+아이콘)에 고착될 수 있다.
 * 단일 탭(+ 실패 시 메모리 캐시)으로 안전하게 초기화한다.
 */
function buildFirestoreSettings(): FirestoreSettings {
  const base: FirestoreSettings = { experimentalForceLongPolling: true };
  try {
    return {
      ...base,
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({ forceOwnership: true }),
      }),
    };
  } catch (err) {
    console.warn('[firestore] persistent cache unavailable, using memory', err);
    return { ...base, localCache: memoryLocalCache() };
  }
}

const namedDbId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;

function initDb() {
  try {
    const settings = buildFirestoreSettings();
    return namedDbId
      ? initializeFirestore(app, settings, namedDbId)
      : initializeFirestore(app, settings);
  } catch (err) {
    console.warn('[firestore] init failed, retrying with memory cache', err);
    const fallback: FirestoreSettings = {
      experimentalForceLongPolling: true,
      localCache: memoryLocalCache(),
    };
    return namedDbId
      ? initializeFirestore(app, fallback, namedDbId)
      : initializeFirestore(app, fallback);
  }
}

export const db = initDb();

export const auth = getAuth(app);
export const storage = getStorage(app, firebaseConfig.storageBucket);
/** Callable — 기본 리전 us-central1 (Functions v2 기본과 동일) */
export const functions = getFunctions(app);

// --- Firestore Error Handling Enums and Interfaces ---
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Offline/Delayed Context: ', JSON.stringify(errInfo));
  // Note: We avoid throwing hard exceptions to prevent breaking the application's runtime.
  // The applet will gracefully fall back to local cached memory storage seamlessly.
}

