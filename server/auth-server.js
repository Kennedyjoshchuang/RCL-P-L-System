// RCL P/L — shared login server (accounts stored on the server, same on every device).
// Node >= 18, no dependencies. Listens on 127.0.0.1 only; nginx proxies /api/ to it.
"use strict";
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3218);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SECRET_FILE = path.join(DATA_DIR, "session.key");
const COOKIE = "rcl_sess";
const SECURE = process.env.COOKIE_SECURE !== "false";

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
const SECRET = Buffer.from(fs.readFileSync(SECRET_FILE, "utf8").trim(), "hex");

/* ---------- storage ---------- */
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); } catch { return []; }
}
function saveUsers(list) {
  const tmp = USERS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, USERS_FILE);
}
const pub = u => ({ u: u.u, name: u.name, role: u.role, created: u.created });

/* ---------- passwords (scrypt) ---------- */
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt$${salt}$${crypto.scryptSync(String(pw), salt, 64).toString("hex")}`;
}
function checkPw(pw, stored) {
  const [, salt, hex] = String(stored || "").split("$");
  if (!salt || !hex) { crypto.scryptSync("x", "dummy-salt", 64); return false; }
  const a = Buffer.from(hex, "hex"), b = crypto.scryptSync(String(pw), salt, a.length);
  return crypto.timingSafeEqual(a, b);
}

/* ---------- sessions: HMAC-signed cookie; ver bump revokes ---------- */
function sign(data) { return crypto.createHmac("sha256", SECRET).update(data).digest("base64url"); }
function makeToken(u, days) {
  const body = Buffer.from(JSON.stringify({ u: u.u, v: u.ver || 0, exp: Date.now() + days * 864e5 })).toString("base64url");
  return body + "." + sign(body);
}
function readToken(tok) {
  if (!tok || !tok.includes(".")) return null;
  const [body, sig] = tok.split(".");
  const want = sign(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (p.exp < Date.now()) return null;
    const u = loadUsers().find(x => x.u === p.u);
    return u && (u.ver || 0) === p.v ? u : null;
  } catch { return null; }
}
function cookieOf(req) {
  const m = (req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith(COOKIE + "="));
  return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : null;
}
function setCookie(res, val, days) {
  const parts = [`${COOKIE}=${val}`, "Path=/", "HttpOnly", "SameSite=Strict"];
  if (SECURE) parts.push("Secure");
  if (days === 0) parts.push("Max-Age=0"); else if (days) parts.push(`Max-Age=${Math.round(days * 86400)}`);
  res.setHeader("Set-Cookie", parts.join("; "));
}

/* ---------- login rate limit (per IP and per username) ---------- */
const fails = new Map();
// 5 wrong passwords per username, 30 per IP (a whole office can share one IP) -> 5 min pause
function limited(key) { const r = fails.get(key), max = key.startsWith("ip:") ? 30 : 5; return r && r.n >= max && Date.now() - r.t < 5 * 60e3; }
function fail(key) { const r = fails.get(key); if (!r || Date.now() - r.t > 5 * 60e3) fails.set(key, { n: 1, t: Date.now() }); else r.n++; }

/* ---------- validation (same rules as the UI) ---------- */
const normUser = s => String(s || "").trim().toLowerCase();
function validateNew(b, list) {
  if (!String(b.name || "").trim()) return "Nama wajib diisi.";
  if (!/^[a-z0-9._-]{3,30}$/.test(normUser(b.username))) return "Username 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau tanda minus.";
  if (list.some(x => x.u === normUser(b.username))) return "Username sudah dipakai.";
  return validatePw(b.password);
}
function validatePw(pw) { return String(pw || "").length < 8 ? "Password minimal 8 karakter." : null; }
const ROLES = new Set(["admin", "staff"]);

/* ---------- http ---------- */
function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ""; req.on("data", c => { d += c; if (d.length > 1e5) { reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new Error("bad json")); } });
  });
}

/* ---------- optional static serving (local dev: STATIC_DIR=..). In production nginx serves the files. ---------- */
const STATIC_DIR = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : null;
const MIME = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
function serveStatic(req, res, pathname) {
  if (!STATIC_DIR) return send(res, 404, { error: "not found" });
  let rel = decodeURIComponent(pathname); if (rel === "/") rel = "/dashboard-rcl.html";
  if (!(rel === "/dashboard-rcl.html" || /^\/assets\/[\w.-]+$/.test(rel))) return send(res, 404, { error: "not found" });
  const f = path.join(STATIC_DIR, path.normalize(rel));
  if (!f.startsWith(STATIC_DIR) || /[\\/](server|\.git)([\\/]|$)/.test(f.slice(STATIC_DIR.length))) return send(res, 404, { error: "not found" });
  fs.readFile(f, (err, buf) => {
    if (err) return send(res, 404, { error: "not found" });
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname.replace(/\/+$/, "");
  const ip = req.headers["x-real-ip"] || req.socket.remoteAddress;
  try {
    // CSRF guard: state-changing requests must be same-origin JSON
    if (req.method !== "GET" && p.startsWith("/api") && !(req.headers["content-type"] || "").startsWith("application/json"))
      return send(res, 415, { error: "JSON required" });
    const me = readToken(cookieOf(req));

    if (!p.startsWith("/api")) return serveStatic(req, res, url.pathname);
    if (p === "/api/health") return send(res, 200, { ok: true });

    if (p === "/api/auth/state" && req.method === "GET")
      return send(res, 200, { setup: loadUsers().length === 0, user: me ? pub(me) : null });

    if (p === "/api/auth/setup" && req.method === "POST") {
      const list = loadUsers();
      if (list.length) return send(res, 409, { error: "Admin sudah dibuat. Silakan masuk." });
      const b = await readBody(req), err = validateNew(b, []);
      if (err) return send(res, 400, { error: err });
      const u = { u: normUser(b.username), name: String(b.name).trim(), role: "admin", hash: hashPw(b.password), ver: 0, created: new Date().toISOString() };
      saveUsers([u]); setCookie(res, makeToken(u, 30), 30);
      return send(res, 201, { user: pub(u) });
    }

    if (p === "/api/auth/login" && req.method === "POST") {
      const b = await readBody(req), name = normUser(b.username);
      if (limited("ip:" + ip) || limited("u:" + name)) return send(res, 429, { error: "Terlalu banyak percobaan gagal. Tunggu 5 menit." });
      const u = loadUsers().find(x => x.u === name);
      const ok = checkPw(b.password, u && u.hash);
      if (!u || !ok) { fail("ip:" + ip); fail("u:" + name); return send(res, 401, { error: "Username atau password salah." }); }
      fails.delete("ip:" + ip); fails.delete("u:" + name);
      const days = b.remember ? 30 : 1;
      setCookie(res, makeToken(u, days), b.remember ? days : undefined);
      return send(res, 200, { user: pub(u) });
    }

    if (p === "/api/auth/logout" && req.method === "POST") { setCookie(res, "", 0); return send(res, 200, { ok: true }); }

    // ---- everything below needs a logged-in admin ----
    if (!p.startsWith("/api/users")) return send(res, 404, { error: "not found" });
    if (!me) return send(res, 401, { error: "Sesi berakhir. Silakan masuk lagi." });
    if (me.role !== "admin") return send(res, 403, { error: "Hanya admin." });
    const list = loadUsers();

    if (p === "/api/users" && req.method === "GET") return send(res, 200, { users: list.map(pub) });

    if (p === "/api/users" && req.method === "POST") {
      const b = await readBody(req), err = validateNew(b, list);
      if (err) return send(res, 400, { error: err });
      const role = ROLES.has(b.role) ? b.role : "staff";
      const u = { u: normUser(b.username), name: String(b.name).trim(), role, hash: hashPw(b.password), ver: 0, created: new Date().toISOString() };
      list.push(u); saveUsers(list);
      return send(res, 201, { user: pub(u) });
    }

    const m = p.match(/^\/api\/users\/([^/]+)(\/password)?$/);
    if (m) {
      const id = normUser(decodeURIComponent(m[1])), t = list.find(x => x.u === id);
      if (!t) return send(res, 404, { error: "Pengguna tidak ditemukan." });
      if (m[2] && req.method === "PUT") {
        const b = await readBody(req), err = validatePw(b.password);
        if (err) return send(res, 400, { error: err });
        t.hash = hashPw(b.password); t.ver = (t.ver || 0) + 1; saveUsers(list);
        if (t.u === me.u) setCookie(res, makeToken(t, 30), 30);   // keep own session alive
        return send(res, 200, { ok: true });
      }
      if (!m[2] && req.method === "DELETE") {
        if (t.u === me.u) return send(res, 400, { error: "Tidak bisa menghapus akun sendiri." });
        if (t.role === "admin" && list.filter(x => x.role === "admin").length <= 1) return send(res, 400, { error: "Harus ada minimal satu admin." });
        saveUsers(list.filter(x => x.u !== id));
        return send(res, 200, { ok: true });
      }
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: "Server error" });
  }
});

server.listen(PORT, HOST, () => console.log(`rcl-pl auth on ${HOST}:${PORT}, data ${DATA_DIR}`));
