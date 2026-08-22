import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Cloud features are strictly additive: with no project configured the app
 *  stays in local-only mode and every analysis still works. */
export const cloudEnabled = Boolean(url && key);

let cached: ReturnType<typeof createBrowserClient> | null = null;

export function supabase() {
  if (!cloudEnabled) return null;
  if (!cached) cached = createBrowserClient(url!, key!);
  return cached;
}
