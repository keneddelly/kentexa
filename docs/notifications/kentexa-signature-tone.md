# Kentexa signature notification sound

## Native Android

- The original three-note chime is generated as a PCM WAV by `mobile/app.config.js` before Expo config plugins run.
- Expo Notifications bundles it as a native custom notification sound.
- The app registers the dedicated `kentexa_updates` Android channel only after notification permission is already granted.
- FCM targets the same channel and names the bundled Android sound resource.
- The channel ID is intentionally new. Android preserves a user's settings for an existing channel, so reusing the old `default` channel would not reliably replace its sound.

## Web

- The service worker continues to show the same system notification banner.
- When a Kentexa tab is visible, the worker asks that tab to play the three-note chime through Web Audio after a user gesture. It silences the generic browser alert only after the page confirms playback; otherwise the browser's own sound remains enabled.
- Web Audio is unlocked only after a real user gesture. If the browser does not permit playback, the banner still appears.
- When Kentexa is closed or in the background, the browser/operating system controls notification sound. Web Push has no portable custom-sound option for system notifications.

## Validation before release

1. Run backend notification tests and the FCM payload test.
2. Run the frontend production build and tests.
3. Run Expo config/prebuild and the Android APK build.
4. Install the test APK and verify the new channel sound with the app backgrounded and foregrounded.
5. Verify web foreground playback after a user gesture, then verify background/closed-tab notification behavior in supported browsers.
6. Confirm the notification banner, routing, permission rules, and user-controlled channel settings remain intact.

No production deployment is implied by this document.
