#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> 1/5 환경 확인"

if ! command -v java >/dev/null 2>&1; then
  AS_JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java"
  if [[ -x "$AS_JBR" ]]; then
    export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
    export PATH="$JAVA_HOME/bin:$PATH"
  else
    echo "❌ Java(JDK)가 없습니다. Android Studio 설치 후 다시 시도하세요."
    exit 1
  fi
fi

if [[ -z "${ANDROID_HOME:-}" && ! -d "$HOME/Library/Android/sdk" ]]; then
  echo "❌ Android SDK 가 없습니다."
  echo "   Android Studio → Settings → Android SDK 설치"
  exit 1
fi

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"

KEYSTORE_FILE="$ROOT_DIR/android/airpick-b2b-release.keystore"
KEYSTORE_PROPS="$ROOT_DIR/android/keystore.properties"

if [[ ! -f "$KEYSTORE_PROPS" ]]; then
  echo "==> 2/5 업로드용 키스토어 생성 (최초 1회)"
  if [[ ! -f "$KEYSTORE_FILE" ]]; then
    read -r -p "키스토어 비밀번호 (6자 이상): " STORE_PASS
    read -r -p "키 별칭 [airpick-b2b]: " KEY_ALIAS
    KEY_ALIAS="${KEY_ALIAS:-airpick-b2b}"
    keytool -genkeypair -v \
      -keystore "$KEYSTORE_FILE" \
      -alias "$KEY_ALIAS" \
      -keyalg RSA -keysize 2048 -validity 10000 \
      -storepass "$STORE_PASS" -keypass "$STORE_PASS" \
      -dname "CN=AirPick B2B, OU=Mobile, O=AirPick, L=Seoul, ST=Seoul, C=KR"
  fi
  cat > "$KEYSTORE_PROPS" <<EOF
storeFile=../airpick-b2b-release.keystore
storePassword=${STORE_PASS}
keyAlias=${KEY_ALIAS}
keyPassword=${STORE_PASS}
EOF
  echo "✔ keystore.properties 생성됨"
else
  echo "==> 2/5 기존 keystore.properties 사용"
fi

echo "==> 3/5 웹 빌드 + Capacitor 동기화"
npm run cap:sync

echo "==> 4/5 Release AAB 빌드"
cd android
chmod +x gradlew
./gradlew bundleRelease

AAB_PATH="app/build/outputs/bundle/release/app-release.aab"
if [[ -f "$AAB_PATH" ]]; then
  echo "==> 5/5 완료"
  echo "✔ AAB: $ROOT_DIR/android/$AAB_PATH"
  echo "  Google Play 콘솔 → 내부 테스트 → App Bundle 업로드"
else
  echo "❌ AAB 파일을 찾지 못했습니다."
  exit 1
fi
