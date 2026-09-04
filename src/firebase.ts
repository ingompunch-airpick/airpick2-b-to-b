import { Capacitor } from '@capacitor/core';
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
 * Capacitor WebView(및 IndexedDB가 차단된 브라우저)에서는 영구 캐시 잠금 획득이
 * 비동기로 실패하고, Firestore 쿼리가 영구히 대기해 스플래시(흰 화면+아이콘)에
 * 고착될 수 있다. try/catch 로는 잡히지 않으므로(동기 예외가 아님) 네이티브·
 * IndexedDB 미지원 환경은 처음부터 메모리 캐시로 초기화한다.
 */
function canUsePersistentCache(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function buildFirestoreSettings(): FirestoreSettings {
  const base: FirestoreSettings = { experimentalForceLongPolling: true };
  if (!canUsePersistentCache()) {
    return { ...base, localCache: memoryLocalCache() };
  }
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
  /** 진단용 최소 정보만 — 이메일 등 개인정보는 클라이언트 로그에 남기지 않는다. */
  authInfo: {
    signedIn: boolean;
    isAnonymous: boolean;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      signedIn: !!auth.currentUser,
      isAnonymous: !!auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Offline/Delayed Context: ', JSON.stringify(errInfo));
  // Note: We avoid throwing hard exceptions to prevent breaking the application's runtime.
  // The applet will gracefully fall back to local cached memory storage seamlessly.
}

