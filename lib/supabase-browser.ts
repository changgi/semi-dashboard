import { createBrowserClient } from "@supabase/ssr";

// ==================================================
// 브라우저용 클라이언트 (anon key)
// ==================================================
export function createBrowser() {
    return createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
}
