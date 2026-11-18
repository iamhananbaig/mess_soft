# Mess POS — Android app for the Sunmi V2

Native Kotlin cashier app (Android 7.1+, minSdk 24) for the canteen's Sunmi V2 handheld.
It talks to the same `/api/v1` as the web app (no backend changes) and prints on the
V2's built-in 58mm printer through Sunmi's printer service, using raw ESC/POS from
`EscPos.kt` — a port of the 58mm path of `frontend/src/lib/escpos.ts`. **Change both
when the receipt layout changes.**

Scope: sign in, menu, cart, checkout (all enabled payment methods), printing (accounts
copy first, then the customer copy on request), today's sales with reprint and void
requests, day-end summary slip, test print. Managers/admins also get all cashiers' sales for
any date, void approval, menu and category editing, and a dashboard. Everything else (cash
closing, inventory, recipes, reports, staff) stays on the web app.

## Build & install

Needs Android Studio (for its JDK and SDK). From this folder:

```bash
export JAVA_HOME=/opt/android-studio/jbr
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Or open this folder in Android Studio and press Run with the V2 plugged in.

## Releases and updates

Releases are published by GitHub Actions (`.github/workflows/android-release.yml`) when an
`android-vX.Y[.Z]` tag is pushed. The tag message becomes the "what's new" text:

```bash
git tag -a android-v1.2 -m "Dashboard: show this week; fix X"
git push origin android-v1.2
```

The workflow builds with `-PappVersionName=1.2` (versionCode is derived: 1.2 → 10200, so it
only ever goes up), checks the APK is signed with the Mess POS key, and attaches it to a
GitHub Release.

The app updates itself from those releases (`Updater.kt`): it checks on startup (at most
every 6 hours) and from ⋮ → Check for updates, downloads the APK, verifies its size and
SHA-256, and opens Android's installer. On Android 8+ the first update asks once to allow
Mess POS to install apps; on the V2 (Android 7) "Unknown sources" must be on.

**Signing key.** `~/.android-keys/mess-pos.jks`, password in `mess-pos.properties` (override
the path with `MESS_POS_SIGNING`). Neither is in git. The workflow reads the same key from
the `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` repository secrets. **Back the
key up**: an update signed with any other key can't be installed over the app.

Local build: `./gradlew assembleRelease` (→ `app/build/outputs/apk/release/app-release.apk`).
To test the updater against the latest release, install an older-looking build:
`./gradlew assembleRelease -PappVersionName=0.9 -PappVersionCode=1`.

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
| `DashboardActivity.kt` / `BarChartView.kt` | Dashboard (GET /dashboard) and its bar chart |
| `VoidsActivity.kt` | Pending void requests (approve / reject) |
| `MenuAdminActivity.kt` | Add / edit menu items and categories |
| `Updater.kt` | Self-update from GitHub Releases |
| `SalesActivity.kt` | Sales for any date (own, or all for managers): reprint, voids, day-end summary |
| `Api.kt` / `Session.kt` | JSON client with bearer token; saved session |
| `EscPos.kt` | Receipt + test page encoder (58mm, 384 dots) |
| `SunmiPrinter.kt` | Built-in printer via `com.sunmi:printerlibrary` |
