# Local timer alerts: Android and iOS

## Reassessment: keep the PWA when network delivery is acceptable

The user's requirement is a useful timer with the screen off; offline delivery
was not explicitly required. A full native conversion is therefore not the
default recommendation. For the existing web product, scheduled server-side Web
Push is simpler for users: they keep the PWA and grant notification permission.
On iOS 16.4+, Web Push requires a Home Screen web app. It can display lock-screen
notifications without distributing an APK or joining Apple's developer program.

Web Push needs connectivity and can be delayed by the network/OS. It must not be
described as an exact offline alarm. The native projects below remain an optional
proof of local scheduling, not a prerequisite for using the website.

The implemented PWA alternative includes:

1. Opt-in push subscription for this browser/device and authenticated ownership.
2. Persisted server-side deadline plus a generation/version for pause/resume/delete.
3. A durable scheduled job (not a browser timeout or a long-running serverless
   request), using Vercel Workflows. Review the deployment plan's current usage
   allowance and pricing before enabling it in production.
4. A final deadline/version check before sending; obsolete jobs must do nothing.
5. A `push` event handler in the existing service worker, expiry/TTL handling,
   invalid-subscription cleanup, and integration checks with real browser push.

The Web Push implementation and deployment instructions are in
[TIMER_PUSH.md](../docs/TIMER_PUSH.md). Production activation and physical-device
delivery remain to be verified. There is no standard
cross-platform PWA API for scheduling an offline local alarm: Google's experimental
Notification Triggers effort ended, and Service Workers can be stopped when idle.
Moving `setTimeout` into a Service Worker does not solve that limitation.

Primary references for this reassessment:

- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- https://developer.chrome.com/docs/web-platform/notification-triggers
- https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope
- https://workflow-sdk.dev/docs/api-reference/workflow/sleep

The recipe timer now has a native scheduling adapter. In an installed Capacitor
app, it schedules an OS notification at the persisted deadline. Pausing/deleting
cancels that notification; resuming updates it. Restoring the app reconciles its
timers without opening permission dialogs. Native delivery suppresses the page's
second sound/notification. The website/PWA can instead opt into server-scheduled
Web Push and retains the existing screen-wake-lock option.

## Work split and current milestone

1. **This chat: timer and native integration.** Implement the adapter, permissions,
   lifecycle/race handling, native projects, and an offline device-test client.
2. **Separate chat: voice cooking assistant.** Local ASR, recipe state and LLM,
   local TTS, downloads, support detection, and measurements. Keep changes out of
   the timer/native projects so the two branches can be combined.
3. **After device verification: full mobile client and distribution.** The current
   default native bundle is a timer verification client, not the complete recipe
   app. The recipe app is Next.js with server/API routes; copying `.next` into a
   native package or setting `output: 'export'` cannot preserve those routes.
   A release needs a bundled client that shares recipe UI and calls the hosted
   API, including an explicit native authentication design. The server stays on
   Vercel. App signing and store distribution are separate from scheduling.

No Push server, recurring job, or new account credentials are needed for local
alerts. Once scheduled, the OS alert does not depend on internet connectivity.

## Build the offline verification client

From `frontend/ourRecipesFront`:

```sh
npm ci
npm run mobile:sync
npm run mobile:android  # Android Studio, JDK 21 and Android SDK 36
npm run mobile:ios      # macOS with Xcode and device signing
```

The tracked projects support Android 8+ and iOS 15+. JavaScript dependencies and
native plugins are pinned in package-lock.json. iOS uses Swift Package Manager.
`mobile:sync` bundles the test client, copies it to both platforms, adds Android
permissions, and installs the notification icon and audible timer resource. The
same `src/lib/timers/nativeAlarms.ts` adapter runs in the recipe app and test client.

For an Android debug APK, after configuring the SDK:

```sh
cd android
./gradlew :app:assembleDebug
```

The APK is `android/app/build/outputs/apk/debug/app-debug.apk`.
Use Android Studio's Run action or `adb install -r` on a connected test device.
For iOS, open `ios/App/App.xcodeproj`, choose the signing team and connected device,
and run. This Linux workspace cannot run Xcode or sign an iOS application.

## Integrated recipe testing (development only)

To test the *current recipe website code* with the native bridge, use its own HTTPS
development/preview URL. Do not use a production deployment that lacks these changes.

```sh
MOBILE_DEV_SERVER_URL=https://your-https-preview.example npm run mobile:sync
```

The URL is an explicit development live-reload option. It is not a release
architecture: Capacitor documents `server.url` as intended for live-reload servers,
not production. `MOBILE_RELEASE=1` rejects it. Only HTTPS is accepted; there are no
wildcard navigation exceptions or cleartext overrides. Remote pages at that origin
have the native bridge, so use only a development origin you control.

To restore the bundled offline test client, run `npm run mobile:sync` with
`MOBILE_DEV_SERVER_URL` unset. The resulting native config files are generated and
ignored by Git. A store-ready recipe app is not delivered by the live-reload option.

## Permissions, audio and OS behavior

- Android: notification permission on Android 13+, plus the user-granted
  `SCHEDULE_EXACT_ALARM` access. The UI only reports scheduling success after an
  exact schedule succeeds. It never quietly replaces it with an inexact alarm.
  The restricted automatic `USE_EXACT_ALARM` permission is not requested.
- iOS: notification authorization. Audio is bundled as `timer_end.wav` and explicitly
  attached to audible notifications. No Critical Alerts entitlement is claimed.
- Sound/mute changes reschedule current timers. Android uses separate audible and
  low-importance quiet channels; user changes to channels and OS volume still apply.
- These are local notifications, not an alarm-clock service that bypasses silent
  mode, Focus, disabled channels or every vendor power policy.
- Android Doze throttles `allowWhileIdle` alarms (the plugin documents one per nine
  minutes per app). Closely spaced cooking timers must be tested in Doze. If strict
  alarm-clock behavior for multiple timers is required, the next native step is an
  Android AlarmManager/AlarmClock implementation and evaluation of iOS AlarmKit,
  rather than claiming this notification plugin bypasses platform policy.
- Recheck after app force-stop, permission revocation and reboot on the actual
  device. A force-stop or disabled notification permission can prevent delivery.
- No web timer or downloaded speech model grants a PWA native alarm privileges.

## Acceptance checks on both real devices

Record the device/OS, permission settings, expected deadline, actual alert time and
whether the alert sounded. Do not mark these as verified from JS mocks:

- 60-second timer in foreground; one OS alert, without a duplicate page sound.
- Lock the screen; the OS alert arrives at the deadline.
- Schedule, enable airplane mode, lock the screen; the alert still arrives.
- Pause before expiry; the old deadline produces no alert. Resume; only the new
  deadline alerts. Delete; no alert remains.
- Close/reopen the app with a timer running and after its deadline; correct time,
  no resurrected timer or duplicate alert.
- Rename and mute while running; verify updated content and audio behavior.
- Deny/revoke notification or exact-alarm permission; no false success indicator.
- Multiple timers, low-power/Doze mode, silent/Focus mode, and device restart.

## References

Automated validation includes the recipe timer's deadline/reload tests, native
permission/scheduling/cancellation and race tests, and browser checks of the offline
client using the real Capacitor JavaScript bridge with simulated Android/iOS native
responses. These checks do not establish physical-device alarm delivery.

Validation in this workspace: all 584 Vitest tests passed, TypeScript and the
Next.js production build passed, both native projects synchronized, and Android
`:app:assembleDebug` succeeded. The debug APK is the bundled timer test client.
The recipe website was checked in Chromium, and the offline client's bridge was
checked with simulated Android/iOS responses. iOS compilation/signing and all
physical-device checks above remain unverified.

An additional Android 15 emulator attempt installed the official emulator and
Google APIs x86_64 system image. The executor has no `/dev/kvm`; `emulator
-accel-check` reported that VM acceleration was unavailable. The documented
software-emulation fallback was attempted. ADB connected and package/activity/
alarm services started, but the system did not finish booting within a six-minute
diagnostic window and the notification service was not ready. APK installation
was attempted; it did not complete in this environment. No locked-screen or
offline notification delivery result is claimed from that attempt. This does not
establish a defect in the app; the native functional check remains unverified.

- https://capacitorjs.com/docs/apis/local-notifications
- https://capacitorjs.com/docs/config
- https://capacitorjs.com/docs/android
- https://capacitorjs.com/docs/ios
