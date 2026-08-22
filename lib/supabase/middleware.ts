import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/analyze", "/runs"];
const AUTH_PAGES = ["/login"];

/**
 * Refreshes the Supabase session on every request and enforces routing.
 *
 * Access tokens are short-lived. Without a server-side refresh the cookie
 * silently goes stale, and the first thing the user notices is a save
 * failing. This runs before every page, rotates the token when needed, and
 * writes the new cookies onto the response.
 */
export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // no project configured: local-only mode stays fully open
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser() revalidates against the auth server and triggers the refresh.
  // Nothing may run between createServerClient and this call, or the cookie
  // rotation races the response.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));
  const isAuthPage = AUTH_PAGES.some((p) => path === p || path.startsWith(`${p}/`));

  // signed out, asking for the product → the door, remembering where they meant to go
  if (!user && isProtected) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.searchParams.set("next", path);
    return copyCookies(response, NextResponse.redirect(to));
  }

  // already signed in, landing on the door → straight through
  if (user && isAuthPage) {
    const to = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get("next");
    to.pathname = next && next.startsWith("/") ? next : "/runs";
    to.search = "";
    return copyCookies(response, NextResponse.redirect(to));
  }

  return response;
}

/** A redirect is a fresh response, so refreshed cookies must be carried over
 *  or the rotation is lost and the user bounces on the next request. */
function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => to.cookies.set(c));
  return to;
}
