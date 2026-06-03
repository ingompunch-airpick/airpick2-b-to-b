# 홈페이지 ↔ B2B 앱 Firebase 연동

두 채널은 **같은 Firebase 프로젝트** `airpick-reservation` 의 **같은 컬렉션** `reservations` 를 사용합니다.

| 항목 | 값 |
|------|-----|
| 프로젝트 ID | `airpick-reservation` |
| 설정 파일(앱·복사용) | 루트 `firebase-applet-config.json`, `firebase-config.homepage.json` |
| 예약 컬렉션 | `reservations/{id}` |
| 와와 업체 문서 | `companies/wawa` (`isOpen`, `blockedDates`, 요금 필드) |

## 동작 요약

1. **홈페이지에서 예약** → `reservations` 에 문서 생성 → B2B 앱 로그인 시 `onSnapshot` 으로 **입고예정**에 표시
2. **앱 현장 접수** → 동일 컬렉션에 `setDoc` → 홈페이지도 같은 DB를 보면 동일 예약 조회 가능
3. **앱에서 상태·결제·사진 변경** → `updateDoc` → 실시간 반영

B2B 앱은 홈페이지 필드 별칭을 자동 매핑합니다 (`entryDate`→`departureDate`, `exitDate`→`arrivalDate` 등). 구현: `src/App.tsx` 의 `normalizeDocsArray`.

## Firebase Console 설정 (필수)

1. **Authentication → Sign-in method → Anonymous** → 사용 설정
2. **Authentication → Settings → Authorized domains** → `wawavalet.com` (및 로컬 테스트용 `localhost`) 추가
3. **Firestore** → 기본 DB 사용 (앱에 `firestoreDatabaseId` 없음)
4. 규칙: 개발용으로 `firestore.rules` 가 열려 있음. 운영 전에는 인증 기반 규칙으로 교체 권장

## 홈페이지에서 예약 저장 (필수 필드)

`companyId` 는 반드시 **`wawa`** (또는 비워두면 앱이 와와로 처리).

```javascript
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = { /* firebase-config.homepage.json 과 동일 */ };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function assertBookingAllowed(departureDate, arrivalDate) {
  const companySnap = await getDoc(doc(db, 'companies', 'wawa'));
  const data = companySnap.data() || {};
  if (data.isOpen === false) {
    throw new Error('현재 전체 예약이 마감되었습니다.');
  }
  const blocked = data.blockedDates || [];
  // YYYY-MM-DD 구간에 마감일이 있으면 거부 (앱과 동일 로직)
  // ...
}

export async function submitHomepageReservation(form) {
  await signInAnonymously(auth);
  await assertBookingAllowed(form.departureDate, form.arrivalDate);

  const id = `res_${Date.now()}`;
  await setDoc(doc(db, 'reservations', id), {
    userId: auth.currentUser.uid,
    companyId: 'wawa',
    companyName: '와와',
    userName: form.userName,
    carModel: form.carModel,
    carNumber: form.carNumber,
    phone: form.phone,
    departureDate: form.departureDate,      // YYYY-MM-DD
    departureTime: form.departureTime,      // HH:mm
    departureTerminal: form.departureTerminal, // 'T1' | 'T2'
    arrivalDate: form.arrivalDate,
    arrivalTime: form.arrivalTime,
    arrivalTerminal: form.arrivalTerminal,
    totalPrice: form.totalPrice,
    status: 'pending',
    createdAt: new Date().toISOString(),
    createdBy: 'homepage',
    paymentMethod: 'unpaid',
    isIndoor: form.isIndoor ?? true,
    scratchPhotos: { synced: false },
  });
  return id;
}
```

홈페이지가 **다른 필드명**을 써도 됩니다. 앱이 인식하는 별칭 예:

| 홈페이지(예) | 앱 표준 |
|-------------|---------|
| `entryDate`, `entryTime` | `departureDate`, `departureTime` |
| `exitDate`, `exitTime` | `arrivalDate`, `arrivalTime` |
| `name` | `userName` |
| `carNo`, `vehicleNo` | `carNumber` |

## 마감(블록아웃) 연동

앱 **예약 마감** 메뉴에서 저장하는 값:

- **전체 마감**: `companies/wawa.isOpen === false`
- **날짜별 마감**: `companies/wawa.blockedDates` → `["2026-06-01", ...]`

홈페이지 예약 폼 제출 **전**에 `companies/wawa` 를 읽어 동일하게 막아야 홈·앱이 일치합니다. 앱 현장 접수도 날짜별 마감을 검사합니다.

## 검증 체크리스트

- [ ] 홈 배포 사이트가 `firebase-applet-config.json` 과 **동일 projectId**
- [ ] 홈에서 예약 후 Firebase Console → `reservations` 에 문서 생성 확인
- [ ] B2B 앱 와와 로그인 → **입고예정** 탭에 동일 차량 표시
- [ ] 앱 현장 접수 후 Console·홈(조회 구현 시)에서 동일 ID 확인
- [ ] 앱에서 입고 처리 후 홈/Console에서 `status` 변경 확인

## 예제 파일

- `integrations/wawavalet-firebase.example.js` — 복사·붙여넣기용 ES 모듈 예제
