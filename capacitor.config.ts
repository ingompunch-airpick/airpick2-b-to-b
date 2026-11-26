import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.airpick.manager',
  appName: '에어픽 파트너',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    // 안드로이드 15+ 전체 화면(edge-to-edge)에서 하단 버튼이 시스템 내비게이션 바에 가리지 않게
    // WebView 바깥에 여백(margin)을 준다. WebView padding 은 화면 안 고정 버튼에 적용되지 않는다.
    adjustMarginsForEdgeToEdge: 'force',
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_airpick',
      iconColor: '#F59E0B',
    },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#09090B',
      androidScaleType: 'CENTER',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
