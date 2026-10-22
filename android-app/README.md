# Job Agent Android APK

This Android project provides an installable Android shell for the existing Job Agent application. It loads the deployed Next.js application over HTTPS; it does not replace the Next.js server or Supabase backend.

## Build an APK in GitHub Actions

1. Deploy the service defined by the repository's Render Blueprint and confirm its HTTPS URL is working.
2. Open **Actions → Build Job Agent Android APK → Run workflow**.
3. Enter the deployed HTTPS URL in `app_base_url` (for example, the real URL shown by Render). Do not guess the URL.
4. Download the `job-agent-android-debug-apk` artifact from the completed run, extract the ZIP, and install `app-debug.apk` on your Android device.

You may instead add a repository variable named `ANDROID_APP_BASE_URL` with the deployed HTTPS origin. Do not put secrets in this variable.

## Important status

- The APK is built by GitHub Actions; Android Studio is not required on your phone.
- An APK can be built before the backend is live, but the app will show a connection error until the URL is deployed and reachable.
- Supabase credentials, redirect URLs, migrations, and authentication must be configured separately. This Android shell does not make a missing backend available.
- The current app uses email magic-link authentication. The end-to-end sign-in flow must be tested on-device before treating the APK as production-ready.
