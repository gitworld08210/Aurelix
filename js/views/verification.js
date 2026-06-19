// Verification request form + status. Admin approval handled out-of-band.
import { el, mount, toast } from "../utils.js";
import { icon } from "../icons.js";
import { header } from "../components.js";
import { ensureShell } from "../shell.js";
import { me, uid, isVerified } from "../state.js";
import { db, fb } from "../firebase.js";

export function renderVerification() {
  const main = ensureShell();
  const user = me();
  const body = el("div", { class: "container" });
  mount(main, header("Verification", { back: true }), body);

  if (isVerified()) {
    mount(body,
      el("div", { class: "center", style: { padding: "30px 0" } }, [
        el("span", { class: "badge-verified", style: { width: "60px", height: "60px" }, html: icon("verified") }),
        el("h2", { text: "You're verified" }),
        el("div", { class: "muted", text: "Your account has a verified badge." }),
      ]),
    );
    return;
  }

  const category = el("select", { class: "input" }, [
    el("option", { value: "creator", text: "Creator" }),
    el("option", { value: "public_figure", text: "Public figure" }),
    el("option", { value: "business", text: "Business / Brand" }),
    el("option", { value: "other", text: "Other" }),
  ]);
  const realName = el("input", { class: "input", value: user.displayName || "", placeholder: "Full name" });
  const reason = el("textarea", { class: "textarea", placeholder: "Why should your account be verified? Add links to press, official sites, etc." });
  const links = el("input", { class: "input", placeholder: "Links (comma separated)" });
  const status = el("div", { class: "error-text" });
  const submit = el("button", { class: "btn primary full mt", text: "Submit request" });

  // load existing request
  fb.getDoc(fb.doc(db, "verificationRequests", uid())).then((snap) => {
    if (snap.exists()) {
      const d = snap.data();
      status.style.color = "var(--accent-3)";
      status.textContent = d.status === "pending" ? "Your request is pending review." : `Request status: ${d.status}`;
    }
  }).catch(() => {});

  submit.addEventListener("click", async () => {
    status.style.color = "";
    status.textContent = "";
    if (!realName.value.trim() || !reason.value.trim()) { status.textContent = "Please fill in your name and reason."; return; }
    submit.disabled = true; submit.textContent = "Submitting…";
    try {
      await fb.setDoc(fb.doc(db, "verificationRequests", uid()), {
        uid: uid(),
        username: user.username,
        displayName: user.displayName,
        realName: realName.value.trim(),
        category: category.value,
        reason: reason.value.trim(),
        links: links.value.trim(),
        status: "pending",
        createdAt: fb.serverTimestamp(),
      });
      status.style.color = "var(--accent-3)";
      status.textContent = "Request submitted! An admin will review it.";
      toast("Verification request submitted", "success");
    } catch (e) {
      status.textContent = e.message || "Could not submit.";
    }
    submit.disabled = false; submit.textContent = "Submit request";
  });

  mount(body,
    el("div", { class: "row", style: { gap: "10px", marginBottom: "10px" } }, [
      el("span", { class: "badge-verified", html: icon("verified") }),
      el("div", { class: "muted", text: "Get a verified badge to confirm your identity." }),
    ]),
    el("div", { class: "field" }, [el("label", { text: "Category" }), category]),
    el("div", { class: "field" }, [el("label", { text: "Full name" }), realName]),
    el("div", { class: "field" }, [el("label", { text: "Reason" }), reason]),
    el("div", { class: "field" }, [el("label", { text: "Reference links" }), links]),
    status,
    submit,
    el("div", { class: "hint mt", text: "Admin approval: set the user's `verified` field to true in Firestore (or build an admin panel). Admins are users with isAdmin = true." }),
  );
}
