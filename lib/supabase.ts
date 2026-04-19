import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// ==================================================
// 브라우저용 클라이언트 (anon key)
// ==================================================
export function createBrowser() {
      return createBrowserClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );
}

// ==================================================
// 서버 컴포넌트/Route Handler용 (anon + 쿠키)
// ==================================================
export async function createServer() {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();

  return createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
                cookies: {
                            getAll() {
                                          return cookieStore.getAll();
                            },
                            setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
                                          try {
                                                          cookiesToSet.forEach(({ name, value, options }) =>
                                                                            cookieStore.set(name, value, options as never)
                                                                                           );
                                          } catch {
                                                          // Server Component에서 호출시 무시
                                          }
                            },
                },
      }
        );
}

// ==================================================
// 서버 전용: 관리자 권한 (service role)
// cron, 서버 전용 API에서만 사용
// ==================================================
export function createAdmin() {
      return createServiceClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
          {
                    auth: {
                                autoRefreshToken: false,
                                persistSession: false,
                    },
          }
            );
}
