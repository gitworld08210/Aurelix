// Reusable UI building blocks.
import { el, initials, formatCount } from "./utils.js";
import { icon } from "./icons.js";
import { navigate } from "./router.js";

/** Avatar element. user: {photoURL, displayName, username, premium}. size: '', 'sm','lg','xl' */
export function avatar(user = {}, size = "", { ring = true, link = false } = {}) {
  const cls = "avatar" + (size ? " " + size : "");
  const inner = user.photoURL
    ? el("img", { class: cls, src: user.photoURL, alt: user.displayName || user.username || "avatar", loading: "lazy" })
    : el("div", { class: cls, text: initials(user.displayName || user.username || "?") });

  let node = inner;
  if (ring && user.premium) {
    node = el("span", { class: "avatar-ring premium" }, [inner]);
  }
  if (link && user.username) {
    node.style.cursor = "pointer";
    node.addEventListener("click", (e) => { e.stopPropagation(); navigate("/u/" + user.username); });
  }
  return node;
}

/** Inline name + verified/premium badges. */
export function nameWithBadges(user = {}, { bold = true } = {}) {
  const wrap = el("span", { class: "row", style: { gap: "2px", display: "inline-flex", alignItems: "center" } }, [
    el("span", { style: { fontWeight: bold ? "700" : "400" }, text: user.displayName || user.username || "User" }),
  ]);
  if (user.verified) wrap.appendChild(el("span", { class: "badge-verified", title: "Verified", html: icon("verified") }));
  if (user.premium) wrap.appendChild(el("span", { class: "badge-premium", title: "Lifeframe Premium", html: icon("crown") }));
  return wrap;
}

/** A row showing a user with follow context. onClick navigates to profile. */
export function userRow(user, { trailing = null } = {}) {
  const row = el("div", { class: "user-row", onClick: () => navigate("/u/" + user.username) }, [
    avatar(user, "", { link: true }),
    el("div", { class: "grow col" }, [
      nameWithBadges(user),
      el("div", { class: "muted ellipsis", text: "@" + (user.username || "") }),
      user.bio ? el("div", { class: "faint ellipsis", text: user.bio }) : null,
    ]),
    trailing,
  ]);
  return row;
}

/** Sticky column header with optional back button + right-side actions. */
export function header(title, { back = false, actions = [], subtitle = null } = {}) {
  const left = back
    ? el("button", { class: "back-btn", "aria-label": "Back", html: icon("back"), onClick: () => history.length > 1 ? history.back() : navigate("/") })
    : null;
  return el("div", { class: "col-header" }, [
    left,
    el("div", { class: "col" }, [
      el("h1", { text: title }),
      subtitle ? el("div", { class: "muted", style: { fontSize: ".82rem" }, text: subtitle }) : null,
    ]),
    el("div", { class: "spacer" }),
    ...actions,
  ]);
}

export function emptyState(big, small, action) {
  return el("div", { class: "empty" }, [
    el("div", { class: "big", text: big }),
    small ? el("div", { text: small }) : null,
    action ? el("div", { class: "mt" }, [action]) : null,
  ]);
}

export function spinnerRow() {
  return el("div", { class: "loading-row" }, [el("div", { class: "spinner" })]);
}

export function statInline(count, label, onClick) {
  return el("div", { class: "stat", onClick }, [
    el("b", { text: formatCount(count) }),
    el("span", { text: " " + label }),
  ]);
}

/** File picker helper. accept e.g. 'image/*'. Returns Promise<File|null>. */
export function pickFile(accept = "image/*") {
  return new Promise((resolve) => {
    const input = el("input", { type: "file", accept, style: { display: "none" } });
    input.addEventListener("change", () => resolve(input.files[0] || null), { once: true });
    document.body.appendChild(input);
    input.click();
    setTimeout(() => input.remove(), 60000);
  });
}
