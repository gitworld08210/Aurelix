// Lifeframe Premium: perks, premium badge + profile ring, feature gating.
import { el, mount, toast, confirmDialog } from "../utils.js";
import { icon } from "../icons.js";
import { header, avatar } from "../components.js";
import { ensureShell } from "../shell.js";
import { me, uid, isPremium } from "../state.js";
import { updateUser } from "../services/users.js";

const PERKS = [
  ["Premium profile ring", "A glowing gradient ring around your avatar everywhere."],
  ["Premium badge", "A gold crown next to your name."],
  ["Longer reels & posts", "Higher upload limits for your content."],
  ["Priority in search", "Appear higher in people search."],
  ["Creator analytics+", "Deeper insights in your dashboard."],
];

export function renderPremium() {
  const main = ensureShell();
  const user = me();

  const active = isPremium();
  const toggleBtn = el("button", { class: "btn primary full mt", text: active ? "Manage subscription" : "Activate Lifeframe Premium" });

  toggleBtn.addEventListener("click", async () => {
    if (active) {
      if (await confirmDialog({ title: "Cancel Premium?", message: "You'll lose premium perks immediately.", confirmText: "Cancel Premium", danger: true })) {
        try { await updateUser(uid(), { premium: false }); toast("Premium cancelled"); }
        catch { toast("Could not update", "error"); }
      }
      return;
    }
    // In production this is where you'd open Stripe/RevenueCat checkout.
    // For this MVP we activate directly so the gated features are usable.
    if (await confirmDialog({ title: "Activate Premium", message: "This enables all premium features on your account.", confirmText: "Activate" })) {
      try {
        await updateUser(uid(), { premium: true, premiumSince: Date.now() });
        toast("Welcome to Lifeframe Premium ✨", "success");
      } catch { toast("Could not activate", "error"); }
    }
  });

  mount(main,
    header("Lifeframe Premium", { back: true }),
    el("div", { class: "container center" }, [
      el("span", { class: "avatar-ring premium", style: { margin: "0 auto" } }, [avatar(user, "xl", { ring: false })]),
      el("div", { style: { fontSize: "1.5rem", fontWeight: "800", marginTop: "14px" } }, [
        el("span", { html: icon("crown"), style: { color: "var(--premium)" } }),
        el("span", { text: " Lifeframe Premium" }),
      ]),
      el("div", { class: "muted", text: active ? "Your account is Premium." : "Stand out and unlock more." }),
    ]),
    el("div", { class: "sheet-list", style: { padding: "0 12px" } },
      PERKS.map(([t, d]) => el("div", { class: "sheet-item", style: { cursor: "default" } }, [
        el("span", { class: "ic", style: { color: "var(--premium)" }, html: icon("check") }),
        el("div", {}, [el("div", { style: { fontWeight: "700" }, text: t }), el("div", { class: "muted", style: { fontSize: ".84rem" }, text: d })]),
      ]))
    ),
    el("div", { class: "container" }, [
      active ? el("div", { class: "chip", style: { width: "fit-content", borderColor: "rgba(255,209,102,.5)" } }, [el("span", { html: icon("crown") }), el("span", { text: "Premium active" })]) : null,
      toggleBtn,
    ]),
  );
}

/** Reusable gate: returns true if allowed, otherwise toasts + routes to premium. */
export function requirePremium(featureName = "This feature") {
  if (isPremium()) return true;
  toast(`${featureName} is a Premium feature.`, "");
  location.hash = "#/premium";
  return false;
}
