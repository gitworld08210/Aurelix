// Unsigned Cloudinary uploads, straight from the browser via the REST API.
// Requires an *unsigned* upload preset configured in your Cloudinary dashboard.
import { getConfig } from "./config.js";

/**
 * Upload a File/Blob to Cloudinary.
 * @param {File|Blob} file
 * @param {object} opts { resourceType: 'image'|'video'|'auto', folder, onProgress }
 * @returns {Promise<{url:string, secureUrl:string, publicId:string, width:number, height:number, duration?:number, thumbnail?:string, resourceType:string}>}
 */
export function uploadToCloudinary(file, opts = {}) {
  const cfg = getConfig();
  const c = cfg && cfg.cloudinary;
  if (!c || !c.cloudName || !c.uploadPreset) {
    return Promise.reject(new Error("Cloudinary is not configured. Add it in Settings."));
  }
  const resourceType = opts.resourceType || (file.type?.startsWith("video") ? "video" : "image");
  const url = `https://api.cloudinary.com/v1_1/${c.cloudName}/${resourceType}/upload`;

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", c.uploadPreset);
  if (c.folder || opts.folder) form.append("folder", opts.folder || c.folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) opts.onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const r = JSON.parse(xhr.responseText);
          resolve({
            url: r.url,
            secureUrl: r.secure_url,
            publicId: r.public_id,
            width: r.width,
            height: r.height,
            duration: r.duration,
            resourceType: r.resource_type,
            thumbnail: r.resource_type === "video" ? videoThumb(c.cloudName, r.public_id) : r.secure_url,
            format: r.format,
            bytes: r.bytes,
          });
        } catch (e) { reject(e); }
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText).error?.message || msg; } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(form);
  });
}

/** Build a thumbnail (jpg frame) URL from a Cloudinary video public id. */
export function videoThumb(cloudName, publicId) {
  return `https://res.cloudinary.com/${cloudName}/video/upload/so_0,w_600,h_900,c_fill,q_auto/${publicId}.jpg`;
}

/** Build an optimized delivery URL (auto format/quality, optional resize). */
export function optimized(secureUrl, { w } = {}) {
  if (!secureUrl || !secureUrl.includes("/upload/")) return secureUrl;
  const parts = ["f_auto", "q_auto"];
  if (w) { parts.push(`w_${w}`, "c_limit"); }
  return secureUrl.replace("/upload/", `/upload/${parts.join(",")}/`);
}
