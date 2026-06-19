# Aurelix

A full social media app — feed, reels, profiles, follows, comments, search, notifications, direct + group messaging, a creator dashboard, verification, premium, and **1:1 voice & video calling** — built as a **no-build, CDN-powered web app**.

There is **no bundler and no `npm install`**. Every dependency (the Firebase SDK) is loaded from the official CDN at runtime, directly in the browser, using native ES modules. You can host the folder on any static host.

> Why no build step? It keeps the app dependency-free, instantly deployable, and easy to read. The Firebase Web SDK ships ESM builds on `gstatic`, so the browser imports them on demand.

---

## What's inside

**Phase A — core social**
- Email signup / login / forgot-password, persistent session, logout, full loading + error handling
- Profiles: avatar, username, display name, bio, edit profile, followers / following / posts / reels counts
- Follow / unfollow with realtime follower updates + followers/following lists
- Feed: text + image posts, home feed, infinite scroll, pull-to-refresh, post cards, likes
- Reels: upload to Cloudinary, vertical autoplay feed, like / comment / save, view counts
- Comments with realtime updates and delete-your-own
- User search (username + display name)
- Notifications: new follower / like / comment, with unread badges

**Phase B — advanced**
- Direct messaging: conversation list, realtime chat, text + image, read receipts, typing indicator
- Group chats (Telegram/WhatsApp-style creation)
- Creator dashboard: real analytics aggregated from your posts & reels
- Verification: request form + admin-approval structure + verified badge
- Lifeframe Premium: premium badge, premium profile ring, feature gating, premium settings

**Calling**
- 1:1 **voice and video** calls over **WebRTC**, signaled through Firestore (offer/answer + ICE candidates), with an incoming-call banner, mute, camera toggle, and hang-up.
- Group calling is architected on top of the same building block but needs a media server (SFU) + TURN for production — see `js/call.js`.

**Design:** iOS "liquid glass" surfaces over a Twitter-like 3-column layout that collapses to an Instagram-style bottom tab bar on mobile.

---

## Getting started

### 1. Create your backend (free tiers are fine)

**Firebase**
1. Create a Firebase project → add a **Web app** → copy the `firebaseConfig`.
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Create a **Cloud Firestore** database.
4. Deploy the security rules in [`firestore.rules`](./firestore.rules) and indexes in [`firestore.indexes.json`](./firestore.indexes.json):
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

**Cloudinary** (for images & reels)
1. Create a Cloudinary account → note your **cloud name**.
2. Settings → **Upload** → add an **unsigned** upload preset → note the preset name.

### 2. Run it

It's a static site — serve the folder with anything:

```bash
# from the repo root
python3 -m http.server 8080
# then open http://localhost:8080
```

(or `npx serve`, the VS Code Live Server extension, Firebase Hosting, Netlify, GitHub Pages, …)

### 3. First-run setup

On first load, Aurelix shows a **Setup screen**. Paste your `firebaseConfig` (click *Parse*) and your Cloudinary cloud name + unsigned preset, then **Save & Connect**. The config is stored in your browser's `localStorage` only.

**Prefer committing config for a deploy?** Create `js/config.local.js` (git-ignored):

```js
window.AURELIX_CONFIG = {
  firebase: {
    apiKey: "…", authDomain: "…", projectId: "…",
    storageBucket: "…", messagingSenderId: "…", appId: "…",
  },
  cloudinary: { cloudName: "…", uploadPreset: "…", folder: "aurelix" },
};
```

and add `<script src="./js/config.local.js"></script>` just before `main.js` in `index.html`.

---

## Notes & limitations

- **Calls across networks:** WebRTC here uses public **STUN** only. On restrictive networks you'll also need a **TURN** server — add it to `RTC_CONFIG` in `js/call.js`.
- **Group voice/video calls** need an SFU (e.g. LiveKit/mediasoup) and are not wired to media; 1:1 calling is fully functional.
- **Verification approval** is done by setting a user's `verified` field to `true` (admins are users with `isAdmin: true`). You can build an admin panel on top of `verificationRequests`.
- **Premium** activates instantly in this MVP (no payment processor); swap in Stripe/RevenueCat at the `renderPremium` activation point.
- No demo/placeholder data ships anywhere — every screen reads/writes your real Firestore.

## Project layout

```
index.html            app shell (boot splash, #app, #call-layer, #toast-host)
css/styles.css        design system (glass UI + responsive layout)
js/
  main.js             bootstrap: config check, Firebase init, auth, routing
  config.js           runtime config (localStorage or config.local.js)
  firebase.js         loads Firebase SDK from CDN, exports auth/db + fn bag
  cloudinary.js       unsigned browser uploads
  router.js           hash router    state.js  global store    shell.js  layout
  components.js icons.js postCard.js utils.js  UI building blocks
  call.js             WebRTC 1:1 voice/video controller + call UI
  services/           users, follows, posts, reels, comments, notifications, messages, calls
  views/              one module per screen
firestore.rules       security rules    firestore.indexes.json  composite indexes
tools/                syntax + import + module-load checks (node tools/…)
```

## Dev checks

```bash
node tools/check.js            # syntax-check every JS file
node tools/validate-imports.js # verify every import resolves to a real export
node tools/runtime-load.js     # load the module graph under DOM stubs
```
