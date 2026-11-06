import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { auth } from "@/server/auth/auth";
import { getUserFromHeaders } from "@/server/auth/session";
import { db } from "@/server/db/client";
import {
  accountClosures,
  cemetery,
  pushSubscriptions,
  reminders,
  sessions,
} from "@/server/db/schema";
import { pushTargetsFor } from "@/server/modules/push/service";
import { runSweep } from "@/server/modules/reminders/sweep";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import { reactivateAccount, scheduleAccountClosure } from "./service";
import { accountStatus } from "./status";

describe("account closure", () => {
  it("starts a 30-day window and can only be reactivated by its owner", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const original = await asUser(user.id);
    const unrelated = await asUser(other.id);
    const current = await auth.api.getSession({ headers: original.headers });
    const unrelatedSession = await auth.api.getSession({
      headers: unrelated.headers,
    });

    const start = Date.now();
    await scheduleAccountClosure(user.id, current!.session.id);
    const pending = await accountStatus(user.id);
    expect(pending.status).toBe("recoverable");
    if (pending.status !== "recoverable")
      throw new Error("Missing recovery window");
    const windowMs = 30 * 24 * 60 * 60 * 1000;
    expect(pending.recoverUntil.getTime()).toBeGreaterThanOrEqual(
      start + windowMs,
    );
    expect(pending.recoverUntil.getTime()).toBeLessThanOrEqual(
      Date.now() + windowMs,
    );
    expect(await auth.api.getSession({ headers: original.headers })).toBeNull();
    expect(await reactivateAccount(user.id, unrelatedSession!.session.id)).toBe(
      false,
    );

    const recovery = await asUser(user.id);
    expect(await getUserFromHeaders(recovery.headers)).toBeNull();
    const recoverySession = await auth.api.getSession({
      headers: recovery.headers,
    });
    expect(await reactivateAccount(user.id, recoverySession!.session.id)).toBe(
      true,
    );
    expect((await getUserFromHeaders(recovery.headers))?.id).toBe(user.id);
    expect((await getUserFromHeaders(unrelated.headers))?.id).toBe(other.id);
  });

  it("blocks expired recovery even before the sweep and keeps reminder and device rows after burial", async () => {
    const user = await createTestUser();
    const active = await createTestUser();
    const original = await asUser(user.id);
    const current = await auth.api.getSession({ headers: original.headers });
    await scheduleAccountClosure(user.id, current!.session.id);
    const recovery = await asUser(user.id);
    const recoverySession = await auth.api.getSession({
      headers: recovery.headers,
    });
    const [device] = await db
      .insert(pushSubscriptions)
      .values({
        userId: user.id,
        endpoint: "https://example.test/push/closed",
        p256dh: "a".repeat(87),
        auth: "b".repeat(22),
        userAgentLabel: "Closed account device",
      })
      .returning();
    const [reminder] = await db
      .insert(reminders)
      .values({
        userId: user.id,
        kind: "weekly_review",
        fireAt: new Date("2026-11-07T00:00:00Z"),
        targetAt: new Date("2026-11-07T00:10:00Z"),
      })
      .returning();
    await db.insert(pushSubscriptions).values({
      userId: active.id,
      endpoint: "https://example.test/push/active",
      p256dh: "a".repeat(87),
      auth: "b".repeat(22),
      userAgentLabel: "Active account device",
    });

    expect(await pushTargetsFor(user.id)).toEqual([]);
    expect(await pushTargetsFor(active.id)).toHaveLength(1);
    expect((await runSweep(new Date())).counts.claimed).toBe(0);
    const [expired] = await db
      .update(accountClosures)
      .set({ recoverUntil: sql`clock_timestamp() - interval '1 second'` })
      .where(eq(accountClosures.userId, user.id))
      .returning();
    expect(await accountStatus(user.id)).toEqual({ status: "closed" });
    expect(await getUserFromHeaders(recovery.headers)).toBeNull();
    expect(await reactivateAccount(user.id, recoverySession!.session.id)).toBe(
      false,
    );

    expect((await runSweep(new Date())).counts.claimed).toBe(0);
    expect((await runSweep(new Date())).counts.claimed).toBe(0);
    expect(await db.select().from(cemetery)).toEqual([
      { userId: user.id, closedAt: expired.recoverUntil },
    ]);
    expect(await db.select().from(accountClosures)).toEqual([]);
    expect(
      await db.select().from(sessions).where(eq(sessions.userId, user.id)),
    ).toEqual([]);
    expect(await pushTargetsFor(user.id)).toEqual([]);
    expect(
      await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.id, device.id)),
    ).toEqual([device]);
    expect(
      await db.select().from(reminders).where(eq(reminders.id, reminder.id)),
    ).toEqual([reminder]);
    expect(await accountStatus(active.id)).toEqual({ status: "active" });
  });
});
