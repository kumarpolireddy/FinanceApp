import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wealthiq.app',
  appName: 'wealthiq',
  webDir: 'out',
  // Bridge logs can include plugin arguments containing credentials.
  loggingBehavior: 'none',
  // Production loads bundled assets; live reload must be explicitly enabled.
  ...(process.env.CAPACITOR_DEV_SERVER_URL
    ? {
        server: {
          url: process.env.CAPACITOR_DEV_SERVER_URL,
          cleartext: process.env.CAPACITOR_DEV_SERVER_URL.startsWith('http://'),
        },
      }
    : {}),
};

export default config;
