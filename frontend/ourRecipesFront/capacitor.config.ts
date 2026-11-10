import type { CapacitorConfig } from '@capacitor/cli';

// Next.js includes server routes and cannot be shipped as a static export as-is.
// Ship the offline timer verification client by default. Remote live reload is
// an explicit development-only option, never a silent production wrapper.
const devServer = process.env.MOBILE_DEV_SERVER_URL;
if (devServer) {
  const url = new URL(devServer);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('MOBILE_DEV_SERVER_URL must be an HTTPS URL without credentials, query, or fragment');
  }
  if (process.env.MOBILE_RELEASE === '1') throw new Error('Remote live reload must not be included in a release build');
}

const config: CapacitorConfig = {
  appId: 'com.nehoraihadad.ourrecipes',
  appName: 'המתכונים שלנו',
  webDir: 'mobile/dist',
  loggingBehavior: 'debug',
  includePlugins: ['@capacitor/app', '@capacitor/local-notifications'],
  server: devServer ? { url: devServer, cleartext: false, errorPath: 'offline.html' } : undefined,
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_timer', iconColor: '#22c7a0',
      presentationOptions: ['sound', 'banner', 'list']
    }
  }
};
export default config;
