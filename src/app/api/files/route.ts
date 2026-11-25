import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getUserFromHeaders } from "@/server/auth/session";
import { env } from "@/server/env";
import { loggerFor, requestIdFrom } from "@/server/logging/request";
import { deleteFile, downloadFile, uploadFile } from "@/server/storage/files";

const privateHeaders = { "Cache-Control": "private, no-store" };
const fileId = z.uuid();
const MAX_BYTES = 4 * 1024 * 1024;

function error(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: privateHeaders });
}

function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(env.BETTER_AUTH_URL).origin;
}

function unavailable(request: Request, cause: unknown) {
  loggerFor(requestIdFrom(request.headers)).error(
    { err: cause, source: "storage" },
    "File storage request failed",
  );
  return error("File storage is temporarily unavailable.", 503);
}

/** Upload raw bytes (up to 4 MiB); returns a private download URL. */
export async function POST(request: Request): Promise<Response> {
  const user = await getUserFromHeaders(request.headers);
  if (!user) return error("Sign in to upload files.", 401);
  if (!sameOrigin(request)) return error("Invalid origin.", 403);
  if (!request.body) return error("A file body is required.", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return error("Files must be at most 4 MiB.", 413);
      }
      chunks.push(value);
    }
  } catch {
    return error("Could not read the file body.", 400);
  } finally {
    reader.releaseLock();
  }
  if (size === 0) return error("A file body is required.", 400);

  const id = randomUUID();
  try {
    await uploadFile(user.id, id, Buffer.concat(chunks));
    return Response.json(
      { id, url: `/api/files?id=${id}` },
      { status: 201, headers: privateHeaders },
    );
  } catch (cause) {
    return unavailable(request, cause);
  }
}

export async function GET(request: Request): Promise<Response> {
  const user = await getUserFromHeaders(request.headers);
  if (!user) return error("Sign in to download files.", 401);
  const parsed = fileId.safeParse(new URL(request.url).searchParams.get("id"));
  if (!parsed.success) return error("Invalid file ID.", 400);
  try {
    const body = await downloadFile(user.id, parsed.data);
    if (!body) return error("File not found.", 404);
    return new Response(body, {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${parsed.data}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (cause) {
    return unavailable(request, cause);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const user = await getUserFromHeaders(request.headers);
  if (!user) return error("Sign in to delete files.", 401);
  if (!sameOrigin(request)) return error("Invalid origin.", 403);
  const parsed = fileId.safeParse(new URL(request.url).searchParams.get("id"));
  if (!parsed.success) return error("Invalid file ID.", 400);
  try {
    await deleteFile(user.id, parsed.data);
    return new Response(null, { status: 204, headers: privateHeaders });
  } catch (cause) {
    return unavailable(request, cause);
  }
}
