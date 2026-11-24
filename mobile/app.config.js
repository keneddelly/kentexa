/**
 * KenteXa native app (#422). One code for Android and iOS (React Native, Expo prebuild, no paid
 * Expo service). APP_VARIANT=test builds a separate test app ("KenteXa Test") that installs next to
 * the Play Store app; production keeps com.app.bishoo, so the release is an update for the same users.
 *
 * The original Kentexa notification chime is generated deterministically at config time so Expo
 * can bundle it as a native Android/iOS notification sound without keeping a binary asset in Git.
 */
const fs = require('fs');
const path = require('path');

function ensureKentexaSignatureSound() {
  const sampleRate = 22050;
  const duration = 1.45;
  const sampleCount = Math.ceil(sampleRate * duration);
  const samples = new Float32Array(sampleCount);
  const notes = [
    { start: 0.00, length: 0.38, frequency: 659.25 },
    { start: 0.22, length: 0.42, frequency: 830.61 },
    { start: 0.48, length: 0.78, frequency: 987.77 },
  ];

  for (const note of notes) {
    const first = Math.floor(note.start * sampleRate);
    const last = Math.min(sampleCount, Math.ceil((note.start + note.length) * sampleRate));
    for (let i = first; i < last; i += 1) {
      const elapsed = i / sampleRate - note.start;
      const attack = Math.min(elapsed / 0.018, 1);
      const decay = Math.exp(-3.2 * elapsed / note.length);
      const envelope = attack * decay;
      const fundamental = Math.sin(2 * Math.PI * note.frequency * elapsed);
      const overtone = 0.18 * Math.sin(2 * Math.PI * note.frequency * 2 * elapsed);
      samples[i] += envelope * (fundamental + overtone);
    }
  }

  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const pcm = Buffer.alloc(44 + sampleCount * 2);
  pcm.write('RIFF', 0);
  pcm.writeUInt32LE(36 + sampleCount * 2, 4);
  pcm.write('WAVE', 8);
  pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(sampleRate, 24);
  pcm.writeUInt32LE(sampleRate * 2, 28);
  pcm.writeUInt16LE(2, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36);
  pcm.writeUInt32LE(sampleCount * 2, 40);
  for (let i = 0; i < sampleCount; i += 1) {
    const normalized = peak ? (samples[i] / peak) * 0.72 : 0;
    pcm.writeInt16LE(Math.max(-1, Math.min(1, normalized)) * 32767, 44 + i * 2);
  }

  const relativePath = './assets/sounds/kentexa_signature_tone.wav';
  const absolutePath = path.join(__dirname, 'assets', 'sounds', 'kentexa_signature_tone.wav');
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, pcm);
  return relativePath;
}

const signatureSound = ensureKentexaSignatureSound();
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
      // Resize (not pan) when the keyboard opens, so the chat composer stays above it.
      softwareKeyboardLayoutMode: 'resize',
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
    plugins: [
      'expo-secure-store',
      ['expo-notifications', { sounds: [signatureSound] }],
    ],
  },
};
