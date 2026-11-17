# KenteXa app (React Native)

One code for Android and iOS (issue #422). Built with Expo prebuild; no paid Expo service.

- `npm install`, then `npx expo run:android` on a computer with Android Studio.
- CI (`.github/workflows/mobile-app.yml`) builds a test APK ("KenteXa Test", `com.kentexa.app.test`) on every change to `mobile/`.
- `APP_VARIANT=production` builds `com.app.bishoo` (the Play Store app, same users). Signing keys are never in this repo.
