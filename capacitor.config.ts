import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wealthiq.app',
  appName: 'wealthiq',
  webDir: 'out',
  server: {
    url: 'http://192.168.1.30:3000',
    cleartext: true
  }
};

export default config;
