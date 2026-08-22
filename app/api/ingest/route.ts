import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { normalize } from "@/lib/normalize";
import { analyze } from "@/lib/analyze";
import { buildRunPayload, contentHash, DEDUP_WINDOW_MS } from "@/lib/persist";

export const runtime = "nodejs";

/**
 * POST /api/ingest
 *   Authorization: Bearer axr_...
 *   body: any supported trace export (OTLP, Langfuse, LangSmith, native)
 *
 * Analyses server-side and stores the run against the key's org. Text is
 * redacted unless the caller opts in with ?redact=false.
 */
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    return NextResponse.json({ error: "Ingest not configured on this deployment." }, { status: 501 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token.startsWith("axr_")) {
    return NextResponse.json({ error: "Missing or malformed API key." }, { status: 401 });
  }

  // keys are stored as sha256; the plaintext exists only in the caller's config
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");

  // service role bypasses RLS, so every query here is scoped by hand
  const admin = createClient(url, service, { auth: { persistSession: false } });

  const { data: key } = await admin
    .from("api_keys")
    .select("id, org_id")
    .eq("key_hash", hash)
    .maybeSingle();

  if (!key) return NextResponse.json({ error: "Unknown API key." }, { status: 401 });

  let trace, analysis;
  try {
    const body = await req.text();
    trace = normalize(body);
    analysis = analyze(trace);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // Redelivered webhooks and double-fired hooks push byte-identical payloads.
  // Collapse those; allow a real re-run through, and let ?force=true override.
  const traceHash = await contentHash(trace);
  const force = req.nextUrl.searchParams.get("force") === "true";

  if (!force) {
    const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
    const { data: dupe } = await admin
      .from("runs")
      .select("id, created_at")
      .eq("org_id", key.org_id)
      .eq("analysis->>contentHash", traceHash)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dupe) {
      await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
      return NextResponse.json({
        id: dupe.id,
        deduplicated: true,
        firstSeenAt: dupe.created_at,
        message:
          "An identical trace was ingested within the last 10 minutes, so this push was " +
          "collapsed into it. Append ?force=true to store it as a separate run.",
      });
    }
  }

  const redact = req.nextUrl.searchParams.get("redact") !== "false";
  const payload = buildRunPayload(trace, analysis, key.org_id, "", redact, traceHash);
  const { created_by, ...row } = payload; // ingest has no acting user
  void created_by;

  const { data: inserted, error } = await admin.from("runs").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);

  return NextResponse.json({
    id: inserted.id,
    spans: analysis.totals.spanCount,
    costUsd: Number(analysis.totals.costUsd.toFixed(6)),
    recoverableUsd: Number(analysis.waste.usd.toFixed(6)),
    wasteShare: Number(analysis.waste.shareUsd.toFixed(4)),
    findings: analysis.findings.map((f) => ({ severity: f.severity, title: f.title })),
  });
}
