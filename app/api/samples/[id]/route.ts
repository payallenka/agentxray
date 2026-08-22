import { NextRequest, NextResponse } from "next/server";
import { SAMPLES } from "@/lib/samples";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sample = SAMPLES.find((s) => s.id === id);
  if (!sample) return NextResponse.json({ error: "Unknown sample." }, { status: 404 });
  return new NextResponse(sample.body, {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
  });
}
