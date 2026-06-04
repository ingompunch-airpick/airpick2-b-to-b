<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/38340e4e-f8e7-4c6a-bc23-67a684103302

## 배포 (현장 앱 URL)

| 용도 | 방식 | URL |
|------|------|-----|
| **B2B 웹 화면** | GitHub Pages (`main` push 시 자동) | https://ingompunch-airpick.github.io/airpick2-b-to-b/ |
| **DB·사진·로그인** | Firebase 프로젝트 `airpick-reservation` | Console / Firestore / Storage |

- 화면 수정 후 배포: `main`에 push → Actions **Deploy to GitHub Pages** 완료 후 폰에서 새로고침
- (선택) Firebase Hosting: 터미널에서 `firebase login` 후 `npm run deploy:hosting` → `https://airpick-reservation.web.app`

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Firebase (공식: airpick-reservation)

B2B 앱은 루트 [`firebase-applet-config.json`](firebase-applet-config.json) → 프로젝트 **`airpick-reservation`** (기본 Firestore DB) 를 사용합니다.

**홈페이지(wawavalet.com)** 는 동일 설정으로 `reservations` 에 쓰고, 앱은 로그인 시 실시간으로 읽습니다.

| 용도 | 파일 |
|------|------|
| 앱 설정 | `firebase-applet-config.json` |
| 홈 복사용 | `firebase-config.homepage.json` |
| 연동 가이드 | [`docs/HOMEPAGE_FIREBASE_SYNC.md`](docs/HOMEPAGE_FIREBASE_SYNC.md) |
| 홈 예제 코드 | [`integrations/wawavalet-firebase.example.js`](integrations/wawavalet-firebase.example.js) |

Console → **Authentication** → Anonymous 사용 + Authorized domains 에 `wawavalet.com` 추가.
