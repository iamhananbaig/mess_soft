# Mess POS — Android app for the Sunmi V2

Native Kotlin cashier app (Android 7.1+, minSdk 24) for the canteen's Sunmi V2 handheld.
It talks to the same `/api/v1` as the web app (no backend changes) and prints on the
V2's built-in 58mm printer through Sunmi's printer service, using raw ESC/POS from
`EscPos.kt` — a port of the 58mm path of `frontend/src/lib/escpos.ts`. **Change both
when the receipt layout changes.**

Scope: sign in, menu, cart, checkout (all enabled payment methods), printing (accounts
copy first, then the customer copy on request), today's sales with reprint and void
requests, day-end summary slip, test print. Everything else (approving voids, cash closing, reports, admin)
stays on the web app.

## Build & install

Needs Android Studio (for its JDK and SDK). From this folder:

```bash
export JAVA_HOME=/opt/android-studio/jbr
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Or open this folder in Android Studio and press Run with the V2 plugged in.

## Release APK (for the canteen)

```bash
export JAVA_HOME=/opt/android-studio/jbr
./gradlew assembleRelease     # → app/build/outputs/apk/release/app-release.apk
```

Signed with the key in `~/.android-keys/mess-pos.jks`, whose passwords are in
`~/.android-keys/mess-pos.properties` (override the path with `MESS_POS_SIGNING`). Neither is
in git. **Back both up somewhere safe**: an update must be signed with the same key, or
Android refuses to install it over the old app and the cashier has to uninstall first.
Without the properties file, `assembleRelease` produces an unsigned APK.

Bump `versionCode` (and `versionName`) in `app/build.gradle.kts` for every release you
install over an older one.

Install on the V2: `adb install -r mess-pos-1.0.apk`, or copy the APK to the device and
open it (allow "unknown sources" once). A debug build must be uninstalled first.

## Testing against a local backend

```bash
cd ../api && php artisan serve          # :8000
adb reverse tcp:8000 tcp:8000           # V2's localhost:8000 → this PC
```

Then sign in with server address `http://localhost:8000`. Plain HTTP is allowed only for
`localhost`; real servers must be HTTPS.

## Files

| File | What |
|---|---|
| `LoginActivity.kt` | Sign-in + server address; requires `sales:create` |
| `BaseActivity.kt` | Shared session handling and the receipt print flow |
| `PosActivity.kt` | Menu grid, cart, checkout, ⋮ menu |
| `SalesActivity.kt` | Today's sales for the signed-in cashier: reprint, request void, day-end summary |
| `Api.kt` / `Session.kt` | JSON client with bearer token; saved session |
| `EscPos.kt` | Receipt + test page encoder (58mm, 384 dots) |
| `SunmiPrinter.kt` | Built-in printer via `com.sunmi:printerlibrary` |
