// Tiny global state store with subscribe/emit. Holds the auth user + profile.
const listeners = new Map(); // event -> Set<fn>

export const state = {
  authUser: null,     // firebase auth user
  profile: null,      // users/{uid} document data (+ id)
  ready: false,       // first auth check complete
  unreadNotifs: 0,
  unreadChats: 0,
};

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function emit(event, payload) {
  listeners.get(event)?.forEach((fn) => {
    try { fn(payload); } catch (e) { console.error(e); }
  });
}

export function setAuthUser(user) {
  state.authUser = user;
  emit("auth", user);
}

export function setProfile(profile) {
  state.profile = profile;
  emit("profile", profile);
}

export function setReady(v) {
  state.ready = v;
  emit("ready", v);
}

export function setUnreadNotifs(n) {
  state.unreadNotifs = n;
  emit("badges", { notifs: n, chats: state.unreadChats });
}

export function setUnreadChats(n) {
  state.unreadChats = n;
  emit("badges", { notifs: state.unreadNotifs, chats: n });
}

export const uid = () => state.authUser?.uid || null;
export const me = () => state.profile;
export const isPremium = () => !!state.profile?.premium;
export const isVerified = () => !!state.profile?.verified;
export const isAdmin = () => !!state.profile?.isAdmin;
