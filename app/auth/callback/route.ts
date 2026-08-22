import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const origin = req.nextUrl.origin;
  // magic links and confirmations carry the caller's intended destination
  const nextParam = req.nextUrl.searchParams.get("next");
  const dest = nextParam && nextParam.startsWith("/") ? nextParam : "/runs";
  if (!code) return NextResponse.redirect(`${origin}/login`);

  const store = await cookies();
  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, options)),
      },
    },
  );
  const { error } = await supa.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }
  return NextResponse.redirect(`${origin}${dest}`);
}
