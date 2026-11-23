/**
 * KenteXa native app (#422). One code for Android and iOS (React Native, Expo prebuild, no paid
 * Expo service). APP_VARIANT=test builds a separate test app ("KenteXa Test") that installs next to
 * the Play Store app; production keeps com.app.bishoo, so the release is an update for the same users.
 */
const variant = process.env.APP_VARIANT || 'test';
const prod = variant === 'production';
const versionCode = 100 + (parseInt(process.env.VERSION_CODE || '0', 10) || 0);

module.exports = {
  expo: {
    name: prod ? 'KenteXa' : 'KenteXa Test',
    slug: 'kentexa',
    scheme: 'kentexa',
    version: `3.0.${versionCode}`,
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#ffffff' },
    android: {
      package: prod ? 'com.app.bishoo' : 'com.kentexa.app.test',
      // Firebase (push): one file holds both apps (com.app.bishoo and com.kentexa.app.test).
      googleServicesFile: './google-services.json',
      versionCode,
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#1d4ed8' },
      intentFilters: [{
        action: 'VIEW',
        autoVerify: prod,
        data: [{ scheme: 'https', host: 'kentexa.com' }, { scheme: 'https', host: 'www.kentexa.com' }],
        category: ['BROWSABLE', 'DEFAULT'],
      }],
    },
    ios: {
      bundleIdentifier: prod ? 'com.kentexa.app' : 'com.kentexa.app.test',
      buildNumber: String(versionCode),
      associatedDomains: ['applinks:kentexa.com'],
      supportsTablet: false,
    },
    extra: {
      apiUrl: process.env.KENTEXA_API_URL || 'https://bishoo-backend.onrender.com',
      webUrl: 'https://kentexa.com',
      variant,
    },
    plugins: ['expo-secure-store', 'expo-notifications'],
  },
};
