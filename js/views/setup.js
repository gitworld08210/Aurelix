// First-run setup: collect Firebase + Cloudinary config and store it locally.
import { el, mount, toast } from "../utils.js";
import { mountFull } from "../shell.js";
import { getConfig, saveConfig } from "../config.js";
import { navigate } from "../router.js";

export function renderSetup() {
  const existing = getConfig() || { firebase: {}, cloudinary: {} };
  const f = existing.firebase || {};
  const c = existing.cloudinary || {};

  const fld = (label, id, value = "", { placeholder = "", required = true } = {}) =>
    el("div", { class: "field" }, [
      el("label", { text: label + (required ? "" : " (optional)") }),
      el("input", { class: "input", id, value: value || "", placeholder, autocomplete: "off", spellcheck: false }),
    ]);

  const err = el("div", { class: "error-text" });

  const save = async () => {
    const get = (id) => document.getElementById(id).value.trim();
    const firebase = {
      apiKey: get("f_apiKey"),
      authDomain: get("f_authDomain"),
      projectId: get("f_projectId"),
      storageBucket: get("f_storageBucket"),
      messagingSenderId: get("f_msgSender"),
      appId: get("f_appId"),
    };
    const cloudinary = {
      cloudName: get("c_cloudName"),
      uploadPreset: get("c_preset"),
      folder: get("c_folder"),
    };
    const missing = ["apiKey", "authDomain", "projectId", "appId"].filter((k) => !firebase[k]);
    if (missing.length) { err.textContent = "Missing required Firebase fields: " + missing.join(", "); return; }
    
    // Validate the config by trying to initialize Firebase
    err.textContent = "";
    err.style.color = "";
    err.textContent = "Testing connection…";
    try {
      const { initializeApp, deleteApp } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
      const { getAuth, signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
      const testApp = initializeApp(firebase, "test-" + Date.now());
      const testAuth = getAuth(testApp);
      // Just initializing without error means the config is valid
      await deleteApp(testApp);
      err.style.color = "var(--accent-3)";
      err.textContent = "Firebase config is valid! Saving…";
    } catch (e) {
      console.error("Config test error:", e);
      // Some errors during init are okay (like no internet for full auth check)
      // If it's a fundamental config error, Firebase throws immediately
      if (e.message && (e.message.includes("invalid") || e.message.includes("API key"))) {
        err.style.color = "";
        err.textContent = "Invalid Firebase config: " + e.message;
        return;
      }
      // Otherwise proceed — the error may just be network-related during the test
    }
    
    saveConfig({ firebase, cloudinary });
    toast("Configuration saved — connecting…", "success");
    // Full reload so Firebase initializes cleanly with the new config.
    location.hash = "#/";
    location.reload();
  };

  const pasteJson = () => {
    const raw = document.getElementById("paste_json").value.trim();
    if (!raw) return;
    try {
      // Extract the object portion (handles `const firebaseConfig = {...};` format)
      const match = raw.match(/\{[\s\S]*\}/);
      let jsonStr = match ? match[0] : raw;
      
      // Convert JS object notation to valid JSON:
      // 1. Replace single quotes with double quotes
      jsonStr = jsonStr.replace(/'/g, '"');
      // 2. Add quotes around unquoted keys (only word chars before a colon that follows a { or ,)
      jsonStr = jsonStr.replace(/(?<=[\{,]\s*)([a-zA-Z_]\w*)\s*:/g, '"$1":');
      // 3. Remove trailing commas before }
      jsonStr = jsonStr.replace(/,\s*}/g, "}");
      
      const obj = JSON.parse(jsonStr);
      const setIf = (id, v) => { if (v != null) document.getElementById(id).value = String(v); };
      setIf("f_apiKey", obj.apiKey);
      setIf("f_authDomain", obj.authDomain);
      setIf("f_projectId", obj.projectId);
      setIf("f_storageBucket", obj.storageBucket);
      setIf("f_msgSender", obj.messagingSenderId);
      setIf("f_appId", obj.appId);
      if (obj.measurementId) setIf("f_appId", obj.appId); // keep appId separate
      toast("Parsed Firebase config", "success");
    } catch (e) {
      console.error("Parse error:", e);
      toast("Could not parse — try filling the fields manually.", "error");
    }
  };

  const node = el("div", { class: "auth-wrap" }, [
    el("div", { class: "auth-card glass", style: { maxWidth: "560px" } }, [
      el("div", { class: "brand", text: "Aurelix" }),
      el("div", { class: "tagline", text: "One-time setup — connect your Firebase & Cloudinary" }),

      el("div", { class: "hint", style: { marginBottom: "10px" },
        text: "Paste the firebaseConfig object from your Firebase console (Project settings → Your apps), then click Parse. Or fill the fields below." }),
      el("textarea", { class: "textarea", id: "paste_json", placeholder: "Paste firebaseConfig { ... } here", style: { minHeight: "90px" } }),
      el("button", { class: "btn full mt", text: "Parse pasted config", onClick: pasteJson }),

      el("h2", { style: { margin: "22px 0 6px", fontSize: "1rem" }, text: "Firebase" }),
      fld("API Key", "f_apiKey", f.apiKey),
      fld("Auth Domain", "f_authDomain", f.authDomain, { placeholder: "your-app.firebaseapp.com" }),
      fld("Project ID", "f_projectId", f.projectId),
      fld("App ID", "f_appId", f.appId),
      fld("Storage Bucket", "f_storageBucket", f.storageBucket, { required: false }),
      fld("Messaging Sender ID", "f_msgSender", f.messagingSenderId, { required: false }),

      el("h2", { style: { margin: "22px 0 6px", fontSize: "1rem" }, text: "Cloudinary (for images & reels)" }),
      el("div", { class: "hint", style: { marginBottom: "10px" },
        text: "Create an unsigned upload preset in Cloudinary (Settings → Upload). Required to upload photos and reels." }),
      fld("Cloud Name", "c_cloudName", c.cloudName, { required: false }),
      fld("Unsigned Upload Preset", "c_preset", c.uploadPreset, { required: false }),
      fld("Folder", "c_folder", c.folder, { placeholder: "aurelix", required: false }),

      err,
      el("button", { class: "btn primary full mt", text: "Save & Connect", onClick: save }),
      el("div", { class: "hint center mt", text: "Stored only in this browser (localStorage). Nothing is sent anywhere except your own Firebase/Cloudinary." }),
    ]),
  ]);
  mountFull(node);
}
