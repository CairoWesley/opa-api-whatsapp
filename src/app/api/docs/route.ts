import { withAdmin, json } from "@/lib/http";
import { listDocs } from "@/lib/docs";

export const runtime = "nodejs";

// GET /api/docs — lista a documentação disponível (slug + título).
export const GET = withAdmin(async () => json({ docs: listDocs() }));
