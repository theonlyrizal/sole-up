/** Live acceptance check. Creates two temporary users and removes its fixtures.
 * Run after `npm run build` and `npm start`:
 * node --env-file=.env.local scripts/neon-smoke.mts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { makeSignature } from "better-auth/crypto";
import pg from "pg";

const origin = process.env.BETTER_AUTH_URL!;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 30_000,
  max: 1,
});
const storage = new S3Client({ forcePathStyle: true });
const users: string[] = [];
let uploaded: string | undefined;

async function fixture() {
  const id = randomUUID();
  await pool.query(
    "insert into users (id, name, email, email_verified) values ($1, $2, $3, true)",
    [id, "Neon smoke test", `neon-smoke-${id}@example.test`],
  );
  users.push(id);
  const token = randomUUID();
  await pool.query(
    "insert into sessions (id, user_id, token, expires_at) values ($1, $2, $3, now() + interval '10 minutes')",
    [randomUUID(), id, token],
  );
  const signature = await makeSignature(token, process.env.BETTER_AUTH_SECRET!);
  const prefix = origin.startsWith("https:") ? "__Secure-" : "";
  return `${prefix}soleup.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

async function request(path: string, init: RequestInit = {}) {
  return fetch(new URL(path, origin), {
    ...init,
    signal: AbortSignal.timeout(30_000),
    redirect: "manual",
  });
}

try {
  const health = await request("/api/health");
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.deepEqual(healthBody, { status: "ok", database: "ok" });
  console.log(`PASS GET /api/health -> 200 ${JSON.stringify(healthBody)}`);

  const owner = await fixture();
  const other = await fixture();
  const headers = { cookie: owner, origin };
  const body = Buffer.from(`Neon storage round trip ${randomUUID()}\n`);

  assert.equal((await request("/api/files")).status, 401);
  assert.equal(
    (
      await request("/api/files", {
        method: "POST",
        headers: { cookie: owner, origin: "https://invalid.example" },
        body,
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/files?id=invalid", { headers })).status,
    400,
  );
  assert.equal(
    (
      await request("/api/files", {
        method: "POST",
        headers,
        body: Buffer.alloc(4 * 1024 * 1024 + 1),
      })
    ).status,
    413,
  );
  console.log(
    "PASS unauthenticated=401, foreign origin=403, invalid ID=400, oversized file=413",
  );

  const upload = await request("/api/files", { method: "POST", headers, body });
  assert.equal(upload.status, 201);
  const file = (await upload.json()) as { id: string; url: string };
  uploaded = file.id;
  const download = await request(file.url, { headers });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), body);
  assert.equal(download.headers.get("cache-control"), "private, no-store");
  console.log(
    "PASS upload=201, download=200, bytes match (Neon S3 round trip)",
  );

  const foreign = { cookie: other, origin };
  assert.equal((await request(file.url, { headers: foreign })).status, 404);
  assert.equal(
    (await request(file.url, { method: "DELETE", headers: foreign })).status,
    204,
  );
  const stillOwned = await request(file.url, { headers });
  assert.equal(stillOwned.status, 200);
  await stillOwned.arrayBuffer();
  console.log("PASS second user cannot read or delete owner's file");

  assert.equal(
    (await request(file.url, { method: "DELETE", headers })).status,
    204,
  );
  assert.equal((await request(file.url, { headers })).status, 404);
  uploaded = undefined;
  console.log("PASS owner delete=204, subsequent download=404");

  const exported = await request("/api/export", { headers });
  assert.equal(exported.status, 200);
  const archive = await exported.text();
  JSON.parse(archive);
  assert.ok(archive.includes(users[0]));
  console.log(
    "PASS authenticated /api/export=200 with database-backed user data",
  );
} finally {
  try {
    if (uploaded) {
      await storage.send(
        new DeleteObjectCommand({
          Bucket: "assets",
          Key: `users/${users[0]}/${uploaded}`,
        }),
      );
    }
  } finally {
    try {
      if (users.length)
        await pool.query("delete from users where id = any($1::uuid[])", [
          users,
        ]);
      console.log(
        "CLEANUP temporary users, sessions and storage objects removed",
      );
    } finally {
      await pool.end();
      storage.destroy();
    }
  }
}
