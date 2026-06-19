// Settings: account, creator mode, premium, verification, config, logout.
import { el, mount, toast, confirmDialog } from "../utils.js";
import { icon } from "../icons.js";
import { header, avatar, nameWithBadges } from "../components.js";
import { ensureShell } from "../shell.js";
import { navigate } from "../router.js";
import { me, uid, isPremium, isVerified } from "../state.js";
import { auth, fb } from "../firebase.js";
import { updateUser } from "../services/users.js";
import { clearConfig } from "../config.js";

function item(label, sub, iconName, onClick, trailing) {
  return el("div", { class: "sheet-item", onClick }, [
    el("span", { class: "ic", html: icon(iconName) }),
    el("div", { class: "grow" }, [
      el("div", { text: label, style: { fontWeight: "600" } }),
      sub ? el("div", { class: "muted", style: { fontSize: ".82rem" }, text: sub }) : null,
    ]),
    trailing || el("span", { class: "muted", html: icon("back"), style: { transform: "rotate(180deg)" } }),
  ]);
}

export function renderSettings() {
  const main = ensureShell();
  const user = me();

  const creatorToggle = el("button", { class: "btn sm" });
  const renderToggle = () => {
    creatorToggle.textContent = user.creatorMode ? "On" : "Off";
    creatorToggle.className = "btn sm " + (user.creatorMode ? "primary" : "");
  };
  renderToggle();
  creatorToggle.addEventListener("click", async (e) => {
    e.stopPropagation();
    try { await updateUser(uid(), { creatorMode: !user.creatorMode }); user.creatorMode = !user.creatorMode; renderToggle();
      toast(user.creatorMode ? "Creator mode on" : "Creator mode off", "success"); }
    catch { toast("Could not update", "error"); }
  });

  const logout = async () => {
    if (await confirmDialog({ title: "Log out?", confirmText: "Log out", danger: true })) {
      try { await fb.signOut(auth); } catch (e) { toast("Could not log out", "error"); }
    }
  };

  const reconfigure = async () => {
    if (await confirmDialog({ title: "Re-run setup?", message: "This clears your saved Firebase/Cloudinary config in this browser and reloads.", confirmText: "Re-run setup", danger: true })) {
      clearConfig(); location.hash = "#/setup"; location.reload();
    }
  };

  mount(main,
    header("Settings", { back: true }),
    el("div", { class: "row", style: { padding: "16px", gap: "12px" }, onClick: () => navigate("/u/" + user.username) }, [
      avatar(user, "lg"),
      el("div", { class: "grow" }, [nameWithBadges(user), el("div", { class: "muted", text: "@" + user.username })]),
    ]),
    el("div", { class: "sheet-list", style: { padding: "0 8px" } }, [
      item("Edit profile", "Name, username, photo, bio", "edit", () => navigate("/settings/edit")),
      item("Creator dashboard", "Your analytics", "chart", () => navigate("/dashboard")),
      item("Creator mode", "Show creator tools on your profile", "user", null, creatorToggle),
      item("Lifeframe Premium", isPremium() ? "Active" : "Upgrade for premium perks", "crown", () => navigate("/premium")),
      item("Verification", isVerified() ? "Verified" : "Request a verified badge", "verified", () => navigate("/verify")),
      item("App setup", "Firebase & Cloudinary config", "settings", reconfigure),
      el("div", { class: "sheet-item danger", onClick: logout }, [el("span", { class: "ic", html: icon("logout") }), el("span", { text: "Log out" })]),
    ]),
    el("div", { class: "faint center", style: { padding: "20px" }, text: "Aurelix · v1.0" }),
  );
}
