import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ok = (b: boolean) => (b ? "PASS" : "FAIL");

async function main() {
  const admin = createClient(URL, SVC, { auth: { persistSession: false } });
  const email = `crudtest+${Date.now()}@example.com`;
  const password = "test-passw0rd-123";

  const { data: created, error: ce } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (ce) { console.log("could not create test user:", ce.message); return; }
  const uid = created.user!.id;
  console.log("test user:", email);

  // sign in as a normal client — this is exactly what the browser does
  const user = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: se } = await user.auth.signInWithPassword({ email, password });
  if (se) { console.log("sign-in failed:", se.message); return; }

  // C — the signup trigger should have made an org
  const { data: mem } = await user.from("memberships").select("org_id, role").maybeSingle();
  console.log(`  ${ok(!!mem)}  CREATE org via auth trigger  ${mem ? `(role=${mem.role})` : ""}`);
  if (!mem) return;
  const orgId = mem.org_id as string;

  // C — insert a run
  const { data: run, error: ie } = await user.from("runs").insert({
    org_id: orgId, created_by: uid, name: "original title", source: "test",
    span_count: 1, total_ms: 100, cost_usd: 0.01, waste_usd: 0, waste_share: 0,
    cp_share: 1, finding_count: 0, redacted: true, spans: [], analysis: {},
  }).select("id,name").single();
  console.log(`  ${ok(!ie)}  CREATE run  ${ie ? ie.message : ""}`);
  if (!run) return;

  // R
  const { data: read } = await user.from("runs").select("name").eq("id", run.id).maybeSingle();
  console.log(`  ${ok(read?.name === "original title")}  READ run back`);

  // U — the one under suspicion
  const { data: upd, error: ue } = await user
    .from("runs").update({ name: "renamed title" }).eq("id", run.id).select("id,name");
  const rows = upd?.length ?? 0;
  console.log(`  ${ok(rows === 1)}  UPDATE returns a row      (rows=${rows}${ue ? ", err=" + ue.message : ""})`);

  const { data: after } = await user.from("runs").select("name").eq("id", run.id).maybeSingle();
  console.log(`  ${ok(after?.name === "renamed title")}  UPDATE persisted          (name now "${after?.name}")`);

  // D
  const { error: de } = await user.from("runs").delete().eq("id", run.id);
  const { data: gone } = await user.from("runs").select("id").eq("id", run.id).maybeSingle();
  console.log(`  ${ok(!de && !gone)}  DELETE run`);

  // isolation: another tenant must not see this org's rows
  const { data: all } = await user.from("runs").select("org_id");
  const leak = (all ?? []).some((r) => r.org_id !== orgId);
  console.log(`  ${ok(!leak)}  RLS isolation (no cross-tenant rows)`);

  await admin.auth.admin.deleteUser(uid);
  console.log("cleaned up test user");
}
main();
