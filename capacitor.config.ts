import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.airpick.manager',
  appName: '에어픽 B2B',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
