// In-memory Firebase (Firestore + Auth) mock that implements the exact surface
// the app's services use, so we can run the REAL service code end-to-end offline.

let clock = 1_700_000_000_000; // monotonic ms so createdAt ordering is deterministic
function nextTs() { clock += 1; return makeTs(clock); }
function makeTs(ms) { return { __ts: ms, toMillis: () => ms, toDate: () => new Date(ms) }; }

// ---- sentinels ----
const SENTINEL = Symbol("sentinel");
const serverTimestamp = () => ({ [SENTINEL]: "serverTimestamp" });
const increment = (n) => ({ [SENTINEL]: "increment", n });
const arrayUnion = (...vals) => ({ [SENTINEL]: "arrayUnion", vals });
const arrayRemove = (...vals) => ({ [SENTINEL]: "arrayRemove", vals });

function isSentinel(v) { return v && typeof v === "object" && v[SENTINEL]; }

export function createMockFirestore() {
  const store = new Map(); // fullPath -> data object

  const clone = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v && v.__ts ? { __ts: v.__ts } : v)));
  function rehydrate(o) {
    // turn {__ts} back into Timestamp-like
    if (Array.isArray(o)) return o.map(rehydrate);
    if (o && typeof o === "object") {
      if (o.__ts) return makeTs(o.__ts);
      const r = {}; for (const k of Object.keys(o)) r[k] = rehydrate(o[k]); return r;
    }
    return o;
  }
  const read = (path) => (store.has(path) ? rehydrate(clone(store.get(path))) : undefined);

  function applyValue(target, key, value) {
    if (isSentinel(value)) {
      const kind = value[SENTINEL];
      if (kind === "serverTimestamp") target[key] = nextTs();
      else if (kind === "increment") target[key] = (Number(target[key]) || 0) + value.n;
      else if (kind === "arrayUnion") {
        const arr = Array.isArray(target[key]) ? target[key].slice() : [];
        for (const v of value.vals) if (!arr.some((x) => JSON.stringify(x) === JSON.stringify(v))) arr.push(v);
        target[key] = arr;
      } else if (kind === "arrayRemove") {
        const arr = Array.isArray(target[key]) ? target[key].slice() : [];
        target[key] = arr.filter((x) => !value.vals.some((v) => JSON.stringify(x) === JSON.stringify(v)));
      }
    } else {
      target[key] = value && value.__ts ? value : value;
    }
  }

  function writeDoc(path, data, { merge = false } = {}) {
    const existing = merge && store.has(path) ? store.get(path) : {};
    const out = merge ? { ...existing } : {};
    for (const [k, v] of Object.entries(data)) {
      if (k.includes(".")) { // dotted path (e.g. reads.uid)
        const parts = k.split(".");
        let cur = out;
        for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] = cur[parts[i]] || {}; cur = cur[parts[i]]; }
        applyValue(cur, parts[parts.length - 1], v);
      } else {
        applyValue(out, k, v);
      }
    }
    store.set(path, clone(out));
  }
  function updateDocData(path, data) {
    if (!store.has(path)) throw err("not-found", "No document to update: " + path);
    const out = { ...store.get(path) };
    for (const [k, v] of Object.entries(data)) {
      if (k.includes(".")) {
        const parts = k.split("."); let cur = out;
        for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] = { ...(cur[parts[i]] || {}) }; cur = cur[parts[i]]; }
        applyValue(cur, parts[parts.length - 1], v);
      } else applyValue(out, k, v);
    }
    store.set(path, clone(out));
  }

  function err(code, message) { const e = new Error(message); e.code = code; return e; }

  // ---- refs ----
  const docRef = (...segs) => ({ __type: "doc", path: segs.join("/"), id: segs[segs.length - 1] });
  const colRef = (...segs) => ({ __type: "collection", path: segs.join("/") });

  // Firestore's doc() has two forms: doc(db, ...segments) and doc(collectionRef)
  // (the latter generates a random id). Support both.
  function docFn(first, ...segs) {
    if (first && first.__type === "collection") {
      if (segs.length === 0) { const id = "id_" + (++clock); return docRef(...(first.path + "/" + id).split("/")); }
      return docRef(...(first.path + "/" + segs.join("/")).split("/"));
    }
    return docRef(...segs); // first is db
  }

  function snap(path) {
    const data = read(path);
    return { exists: () => data !== undefined, id: path.split("/").pop(), data: () => data, ref: docRef(...path.split("/")) };
  }

  // ---- query engine ----
  function runQuery(q) {
    const colPath = q.path;
    const depth = colPath.split("/").length;
    let docs = [];
    for (const [path, data] of store.entries()) {
      const parts = path.split("/");
      if (parts.length === depth + 1 && path.startsWith(colPath + "/")) {
        docs.push({ id: parts[parts.length - 1], data: rehydrate(clone(data)), path });
      }
    }
    const constraints = q.constraints || [];
    for (const c of constraints) {
      if (c.kind === "where") {
        docs = docs.filter((d) => {
          const val = d.data[c.field];
          if (c.op === "==") return JSON.stringify(val) === JSON.stringify(c.value);
          if (c.op === ">=") return val >= c.value;
          if (c.op === "<=") return val <= c.value;
          if (c.op === ">") return val > c.value;
          if (c.op === "<") return val < c.value;
          if (c.op === "array-contains") return Array.isArray(val) && val.includes(c.value);
          return true;
        });
      }
    }
    const orderBys = constraints.filter((c) => c.kind === "orderBy");
    if (orderBys.length) {
      docs.sort((a, b) => {
        for (const o of orderBys) {
          let av = a.data[o.field], bv = b.data[o.field];
          if (av && av.toMillis) av = av.toMillis();
          if (bv && bv.toMillis) bv = bv.toMillis();
          if (av < bv) return o.dir === "desc" ? 1 : -1;
          if (av > bv) return o.dir === "desc" ? -1 : 1;
        }
        return 0;
      });
    }
    const after = constraints.find((c) => c.kind === "startAfter");
    if (after && orderBys.length) {
      const o = orderBys[0];
      let cv = after.cursor?.data?.()?.[o.field];
      if (cv && cv.toMillis) cv = cv.toMillis();
      docs = docs.filter((d) => {
        let dv = d.data[o.field]; if (dv && dv.toMillis) dv = dv.toMillis();
        return o.dir === "desc" ? dv < cv : dv > cv;
      });
    }
    const lim = constraints.find((c) => c.kind === "limit");
    if (lim) docs = docs.slice(0, lim.n);
    return docs.map((d) => ({ id: d.id, data: () => d.data, ref: docRef(...d.path.split("/")) }));
  }

  // ---- fb bag (matches js/firebase.js exports) ----
  const fb = {
    doc: (...args) => docFn(...args),
    collection: (_db, ...segs) => colRef(...segs),
    collectionGroup: (_db, name) => ({ __type: "collectionGroup", name }),
    getDoc: async (ref) => snap(ref.path),
    getDocs: async (q) => {
      const arr = q.__type === "collection" ? runQuery({ path: q.path, constraints: [] }) : runQuery(q);
      return { docs: arr, empty: arr.length === 0, size: arr.length, forEach: (f) => arr.forEach(f) };
    },
    setDoc: async (ref, data, opts) => writeDoc(ref.path, data, opts || {}),
    addDoc: async (col, data) => { const id = "id_" + (++clock); writeDoc(col.path + "/" + id, data); return docRef(...(col.path + "/" + id).split("/")); },
    updateDoc: async (ref, data) => updateDocData(ref.path, data),
    deleteDoc: async (ref) => { store.delete(ref.path); },
    onSnapshot: (refOrQuery, cb) => {
      // emit current state once (good enough for logic tests)
      if (refOrQuery.__type === "doc") cb(snap(refOrQuery.path));
      else { const arr = refOrQuery.__type === "collection" ? runQuery({ path: refOrQuery.path, constraints: [] }) : runQuery(refOrQuery); cb({ docs: arr, size: arr.length, empty: arr.length === 0, forEach: (f) => arr.forEach(f), docChanges: () => arr.map((d) => ({ type: "added", doc: d })) }); }
      return () => {};
    },
    query: (col, ...constraints) => ({ __type: "query", path: col.path, constraints }),
    where: (field, op, value) => ({ kind: "where", field, op, value }),
    orderBy: (field, dir = "asc") => ({ kind: "orderBy", field, dir }),
    limit: (n) => ({ kind: "limit", n }),
    startAfter: (cursor) => ({ kind: "startAfter", cursor }),
    serverTimestamp,
    increment,
    arrayUnion,
    arrayRemove,
    Timestamp: { now: () => nextTs(), fromMillis: (ms) => makeTs(ms) },
    writeBatch: () => {
      const ops = [];
      return {
        set: (ref, data, opts) => ops.push(["set", ref, data, opts]),
        update: (ref, data) => ops.push(["update", ref, data]),
        delete: (ref) => ops.push(["delete", ref]),
        commit: async () => { for (const op of ops) {
          if (op[0] === "set") writeDoc(op[1].path, op[2], op[3] || {});
          else if (op[0] === "update") updateDocData(op[1].path, op[2]);
          else if (op[0] === "delete") store.delete(op[1].path);
        } },
      };
    },
    runTransaction: async (_db, fn) => {
      const tx = {
        get: async (ref) => snap(ref.path),
        set: (ref, data, opts) => writeDoc(ref.path, data, opts || {}),
        update: (ref, data) => updateDocData(ref.path, data),
        delete: (ref) => store.delete(ref.path),
      };
      return fn(tx);
    },
    // auth fns (minimal)
    createUserWithEmailAndPassword: async () => ({ user: { uid: "u_" + (++clock) } }),
    signInWithEmailAndPassword: async () => ({ user: { uid: "u_signin" } }),
    sendPasswordResetEmail: async () => {},
    signOut: async () => {},
    onAuthStateChanged: () => () => {},
    updateProfile: async () => {},
  };

  return { fb, db: { __mock: true }, store, dump: () => store };
}
