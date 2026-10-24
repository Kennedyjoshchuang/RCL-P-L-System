// node --test server/auth-server.test.js   (set SHEET_ID + GOOGLE_CREDS_FILE to also read the real sheet)
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");

const PORT = 3290 + Math.floor(Math.random() * 9);
const BASE = `http://127.0.0.1:${PORT}`;
const live = !!(process.env.SHEET_ID && process.env.GOOGLE_CREDS_FILE);

test("sheet endpoint needs a session; logout revokes the cookie", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rclpl-"));
  const srv = spawn(process.execPath, [path.join(__dirname, "auth-server.js")], {
    env: { ...process.env, PORT, DATA_DIR: dir, COOKIE_SECURE: "false", ADMIN_USER: "tester", ADMIN_PASSWORD: "test-pass-123" }, stdio: "ignore" });
  t.after(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }

  assert.equal((await fetch(BASE + "/api/sheet/PL")).status, 401);
  assert.equal((await fetch(BASE + "/api/sheet/open", { redirect: "manual" })).status, 401);

  const login = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "tester", password: "test-pass-123" }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const get = p => fetch(BASE + p, { headers: { cookie }, redirect: "manual" });

  assert.equal((await get("/api/sheet/XX")).status, 404);   // only PL/AR/AP
  assert.equal((await get("/api/sheet/open")).status, 302);
  if (live) for (const tab of ["PL", "AR", "AP"]) {
    const r = await get("/api/sheet/" + tab);
    assert.equal(r.status, 200, tab);
    const { rows } = await r.json();
    assert.ok(rows.length > 1 && rows.every(x => x.length === rows[0].length), tab + " rows padded");
    console.log(`  ${tab}: ${rows.length} rows x ${rows[0].length} cols`);
  }

  assert.equal((await fetch(BASE + "/api/auth/logout", { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: "{}" })).status, 200);
  assert.equal((await get("/api/sheet/PL")).status, 401, "old cookie must be dead after logout");
});
