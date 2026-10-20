# Publishing DBoard Designer to Google Play and the App Store

The Android and iPhone apps are built by GitHub (Actions tab) from this repository. They use the same accounts, projects and community as the website. The website is unaffected.

Listing text, privacy answers and review notes: `STORE-LISTING.md`. Screenshots, Play icon and feature graphic: `store-assets/`.

GitHub secrets are added at: **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**.

---

## 0. Before both stores

1. **Database.** In the Supabase SQL editor, run `supabase/migrations/0006_safety.sql` (report and block, required by both stores). Safe to run again.
2. **Review account.** Register a new account on the website for the store reviewers (for example a new Gmail address), confirm the email, and save a sample board in it. Both stores need its email and password.
3. **Reports.** Your admin account gets a notification and an email for every report. Check Admin → Reports at least daily; both stores expect action within 24 hours.

---

## 1. Google Play (personal account)

Google requires new personal accounts to run a **closed test with at least 12 testers for 14 days in a row** before the app can go public. Start this as early as possible.

### 1.1 Create the app
Play Console → **Create app** → App name `DBoard Designer`, default language English (United Kingdom), **App**, **Free**, accept the declarations.

### 1.2 Signing key and first build
1. Add the four Android signing secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`). Claude can create the key and add these for you; keep the backup copy of the key and its password in a password manager.
2. GitHub → **Actions → Android app → Run workflow**. Track `alpha`, status `draft`, version `1.0.0`, and **untick "Upload to Google Play"** (Google needs the first upload done by hand).
3. When it finishes (about 3 minutes), open the run and download the **android-…** file under Artifacts. Unzip it; you need `app-release.aab`.

### 1.3 Closed test
1. Play Console → **Test and release → Testing → Closed testing → Alpha → Create release**.
2. Choose **Use Google-generated key** (Play App Signing) if asked, then upload `app-release.aab`. Release name `1.0.0`, notes "First release". Save, review, **Start rollout to Closed testing**.
3. **Testers** tab: create an email list with the Google account emails of at least 12 testers (your members are ideal). Copy the **opt-in link** and send it to them. Each must open it, accept, and install the app from Play. They should keep it installed for 14 days.

### 1.4 Store listing and app content (Play Console → Grow → Store presence → Main store listing; and Policy → App content)
- Main store listing: name, short and full description from `STORE-LISTING.md`; app icon `store-assets/play_icon_512.png`; feature graphic `store-assets/play_feature_1024x500.png`; phone screenshots `store-assets/android-phone_*.png`; tablet screenshots can use `ipad-13in_*.png`.
- App content: Privacy policy URL, **App access** (all functions need sign-in → add the review account), Ads (none), Content rating questionnaire, Target audience (18+), Data safety, and the other declarations, using the answers in `STORE-LISTING.md`.

### 1.5 Automatic uploads (do once, any time before your second release)
1. https://console.cloud.google.com → create a project (e.g. "DBoard Play uploads") → **APIs & Services → Enable APIs** → enable **Google Play Android Developer API**.
2. **IAM & Admin → Service accounts → Create service account** (name "github-play-upload"), no roles needed. Open it → **Keys → Add key → Create new key → JSON**. A .json file downloads.
3. Play Console → **Users and permissions → Invite new users** → paste the service account email → **App permissions** → add DBoard Designer → tick **Release to production, exclude devices, and use Play App Signing** and **Release apps to testing tracks** → Invite.
4. GitHub secret `PLAY_SERVICE_ACCOUNT_JSON` = the whole content of the .json file (open it in a text editor and copy all).

From then on: **Actions → Android app → Run workflow** (track `alpha`, status `completed`, a higher version such as `1.0.1`) builds and uploads in one go.

### 1.6 Going public
After 14 days with 12+ testers: Play Console **Dashboard → Apply for production**, answer the questions about your test, wait for approval (usually a few days), then promote the tested release to **Production** (or run the workflow with track `production`).

---

## 2. Apple App Store (no Mac needed)

### 2.1 Register the app ID
https://developer.apple.com/account → **Certificates, IDs & Profiles → Identifiers → +** → **App IDs → App** → Description `DBoard Designer`, Bundle ID **Explicit** `com.waveavi.dboarddesigner` → Continue → Register. No extra capabilities are needed.

### 2.2 Create the app record
https://appstoreconnect.apple.com → **Apps → + → New App** → Platform iOS, Name `DBoard Designer`, primary language English (U.K.), Bundle ID `com.waveavi.dboarddesigner`, SKU `dboard-designer-ios`, User Access Full Access.

### 2.3 API key for GitHub
1. App Store Connect → **Users and Access → Integrations → App Store Connect API → Team Keys**. (First time: click **Request Access**, accept.)
2. **Generate API Key** → name `GitHub builds`, access **Admin** → Generate → **Download** the `.p8` file (Apple lets you download it only once; keep it safe).
3. Note the **Key ID** (in the table) and the **Issuer ID** (above the table).
4. Your **Team ID**: developer.apple.com → Account → **Membership details**.
5. GitHub secrets:
   - `APPLE_TEAM_ID` = Team ID
   - `ASC_KEY_ID` = Key ID
   - `ASC_ISSUER_ID` = Issuer ID
   - `ASC_KEY_P8` = open the .p8 file in a text editor and paste everything, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines

### 2.4 Build and upload
GitHub → **Actions → iPhone app → Run workflow** (version `1.0.0`). It takes 10–20 minutes on GitHub's Mac. The build then appears in App Store Connect → your app → **TestFlight** after Apple processes it (10–30 minutes). The encryption question is already answered in the app (standard HTTPS only).

### 2.5 Test on your iPhone
TestFlight → **Internal Testing → +** → add yourself → install the **TestFlight** app on your iPhone and open the invitation.

### 2.6 Submit
App Store Connect → your app → **iOS App 1.0** page:
- Screenshots: iPhone 6.9" `store-assets/iphone-6.9in_*.png`; iPad 13" `store-assets/ipad-13in_*.png`
- Promotional text (optional), description, keywords, support URL, marketing URL from `STORE-LISTING.md`
- **Build**: select the uploaded build
- **App Review Information**: sign-in required → the review account; notes from `STORE-LISTING.md`
- **App Privacy** (left menu): privacy policy URL and the answers in `STORE-LISTING.md`
- **Age rating**, **Pricing and Availability** (Free), category Productivity
- **Add for Review → Submit**. Review usually takes 1–3 days.

---

## 3. Later updates

1. Make changes as usual; GitHub checks both apps still build on every push.
2. Run **Android app** and **iPhone app** workflows with a higher version (e.g. `1.0.1`). Build numbers increase automatically.
3. Android: the new release goes to the chosen track. iPhone: select the new build on a new version page in App Store Connect and submit.

Database changes must keep older app versions working (people update at different times): add new things alongside old ones, never remove what an older version uses.

## 4. Technical notes

- Capacitor 8 project in `mobile/`. `npm run sync` copies `../public` into the apps (`prepare-www.mjs`), adding the public site address used for API calls and email links (`DBD_SITE`, default `https://d-board-designer.adriankobsin.workers.dev`). If the site moves to a custom domain, set `DBD_SITE` in both workflows.
- The Worker allows cross-origin API calls only from the app origins (`capacitor://localhost`, `https://localhost`).
- Icons and splash screens come from `mobile/assets/` (`npm run assets`).
- Android signing uses Play App Signing: the key in GitHub is only the upload key; if it is ever lost, Google support can reset it.
