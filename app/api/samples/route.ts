import { NextResponse } from "next/server";
import { SAMPLES } from "@/lib/samples";

export const runtime = "nodejs";

/** Demo runs are served, not bundled. The client fetches them over the same
 *  path a real trace arrives on, so there is one code path, not two. */
export async function GET() {
  return NextResponse.json(
    SAMPLES.map(({ id, label, sub }) => ({ id, label, sub })),
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
