import { withAdmin, json } from "@/lib/http";
import { queueCounts } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sync/jobs — contadores da fila (waiting/active/completed/failed/delayed).
export const GET = withAdmin(async () => json({ queue: await queueCounts() }));
