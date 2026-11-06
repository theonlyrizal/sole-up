import { getUserFromHeaders } from "@/server/auth/session";
import { loggerFor, requestIdFrom } from "@/server/logging/request";
import { archiveChunks } from "@/server/modules/export/archive";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request): Promise<Response> {
  const user = await getUserFromHeaders(request.headers);
  if (!user) {
    return Response.json(
      { error: "Sign in to export your data." },
      { status: 401, headers: privateHeaders },
    );
  }

  const exportedAt = new Date();
  const chunks = archiveChunks(user.id, exportedAt);
  const encoder = new TextEncoder();
  const log = loggerFor(requestIdFrom(request.headers));
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch {
        log.error({ source: "export" }, "Data export failed");
        controller.error(new Error("Data export failed"));
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      ...privateHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="soleup-export-${exportedAt.toISOString().slice(0, 10)}.json"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
