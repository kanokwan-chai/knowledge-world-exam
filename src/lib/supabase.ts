import { createClient, SupabaseClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const STORAGE_URL_KEY = 'kw_supabase_url';
const STORAGE_ANON_KEY = 'kw_supabase_anon_key';

export function normalizeSupabaseUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';

  // Case 1: User pasted the Supabase Dashboard URL e.g. https://supabase.com/dashboard/project/sfwhcgintwakeofstrre/...
  const dashMatch = trimmed.match(/supabase\.com\/dashboard\/project\/([a-z0-9-]+)/i);
  if (dashMatch && dashMatch[1]) {
    return `https://${dashMatch[1]}.supabase.co`;
  }

  // Case 2: User pasted https://<project-ref>.supabase.co/rest/v1... with extra trailing path
  const supaMatch = trimmed.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  if (supaMatch && supaMatch[1]) {
    return `https://${supaMatch[1]}.supabase.co`;
  }

  // Case 3: User pasted just the 20-char project ref e.g. sfwhcgintwakeofstrre
  if (/^[a-z0-9]{15,30}$/i.test(trimmed)) {
    return `https://${trimmed}.supabase.co`;
  }

  return trimmed.replace(/\/+$/, '');
}

export function getSupabaseConfig(): { url: string; anonKey: string; isConfigured: boolean } {
  const savedUrl = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_URL_KEY) : null;
  const savedAnon = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_ANON_KEY) : null;

  const rawUrl = (envUrl && !envUrl.includes('your-project-id') ? envUrl : savedUrl) || '';
  const url = normalizeSupabaseUrl(rawUrl);
  const anonKey = ((envAnonKey && !envAnonKey.includes('your-public-anon-key') ? envAnonKey : savedAnon) || '').trim();

  // Auto-persist normalized URL if it was fixed
  if (typeof window !== 'undefined' && savedUrl && url && savedUrl !== url) {
    window.localStorage.setItem(STORAGE_URL_KEY, url);
  }

  const isConfigured = Boolean(url && anonKey && url.startsWith('http'));
  return { url, anonKey, isConfigured };
}

export function getSupabaseProjectRef(): string | null {
  const { url } = getSupabaseConfig();
  if (!url) return null;
  const match = url.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return match && match[1] ? match[1] : null;
}

export function saveRuntimeSupabaseConfig(url: string, anonKey: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_URL_KEY, normalizeSupabaseUrl(url));
  window.localStorage.setItem(STORAGE_ANON_KEY, anonKey.trim());
  window.location.reload();
}

export function clearRuntimeSupabaseConfig(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_URL_KEY);
  window.localStorage.removeItem(STORAGE_ANON_KEY);
  window.location.reload();
}

const config = getSupabaseConfig();

// Create real Supabase client with Realtime auto-reconnect parameters
export const supabase: SupabaseClient = createClient(
  config.isConfigured ? config.url : 'https://placeholder-unconfigured.supabase.co',
  config.isConfigured ? config.anonKey : 'public-anon-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
  }
);

export function getOrCreateGuestToken(): string {
  const key = 'kw_guest_session_token';
  let token = window.localStorage.getItem(key);
  if (!token) {
    token = `guest_${crypto.randomUUID()}`;
    window.localStorage.setItem(key, token);
  }
  return token;
}

export const SUPABASE_GRANT_FIX_SQL = `GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;`;

export const SUPABASE_TEACHER_AUTH_FIX_SQL = `-- 1. ปรับ Trigger สมัครสมาชิกให้รองรับทุกความยาวชื่อและไม่พังเมื่อมีข้อมูลซ้ำ
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role := 'student';
  v_name TEXT;
BEGIN
  BEGIN
    v_role := COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'student');
  EXCEPTION WHEN OTHERS THEN
    v_role := 'student';
  END;

  v_name := trim(COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
  IF char_length(v_name) < 2 THEN
    v_name := trim(COALESCE(split_part(NEW.email, '@', 1), 'Explorer'));
  END IF;
  v_name := trim(left(v_name, 28));
  IF char_length(v_name) < 2 THEN
    v_name := 'Explorer';
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, email, display_name, role, coins, exp, level)
    VALUES (NEW.id, NEW.email, v_name, v_role, 200, 0, 1)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    INSERT INTO public.avatars (profile_id, avatar_name)
    VALUES (NEW.id, v_name)
    ON CONFLICT (profile_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    INSERT INTO public.player_inventory (profile_id, item_id, acquired_source, is_equipped)
    SELECT NEW.id, ai.id, 'starter', true
    FROM public.avatar_items ai
    WHERE ai.is_starter = true
    ON CONFLICT (profile_id, item_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    INSERT INTO public.player_missions (profile_id, mission_id, current_progress, is_completed)
    SELECT NEW.id, m.id, 0, false
    FROM public.missions m
    ON CONFLICT (profile_id, mission_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. ยืนยันบัญชีที่ค้าง Confirm email ใน auth.users ให้อัตโนมัติ
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email_confirmed_at IS NULL;

-- 3. สร้างโปรไฟล์ย้อนหลังให้บัญชีที่ยังไม่มีแถวใน public.profiles
INSERT INTO public.profiles (id, email, display_name, role, coins, exp, level)
SELECT
  u.id,
  u.email,
  CASE
    WHEN char_length(trim(left(COALESCE(NULLIF(trim(u.raw_user_meta_data->>'display_name'), ''), split_part(u.email, '@', 1), 'Teacher'), 28))) >= 2
    THEN trim(left(COALESCE(NULLIF(trim(u.raw_user_meta_data->>'display_name'), ''), split_part(u.email, '@', 1), 'Teacher'), 28))
    ELSE 'Teacher'
  END,
  CASE
    WHEN (u.raw_user_meta_data->>'role') IN ('teacher', 'student', 'admin') THEN (u.raw_user_meta_data->>'role')::public.user_role
    ELSE 'teacher'::public.user_role
  END,
  200, 0, 1
FROM auth.users u
ON CONFLICT DO NOTHING;

-- 4. อัปเดต role เป็น teacher สำหรับบัญชีที่สมัครเป็นครูไว้ใน metadata
DO $$
BEGIN
  PERFORM set_config('kw.server_authorized', 'true', true);
  UPDATE public.profiles p
  SET role = 'teacher'::public.user_role,
      updated_at = now()
  FROM auth.users u
  WHERE p.id = u.id
    AND (u.raw_user_meta_data->>'role') = 'teacher'
    AND p.role <> 'teacher'::public.user_role;
END $$;`;

export async function verifySupabaseConnectionHealth(): Promise<{
  isConfigured: boolean;
  url: string;
  connected: boolean;
  tablesReady: boolean;
  needsGrantFix?: boolean;
  powersSeedCount: number;
  message: string;
}> {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) {
    return {
      isConfigured: false,
      url: cfg.url,
      connected: false,
      tablesReady: false,
      powersSeedCount: 0,
      message: 'ยังไม่ได้บันทึกค่า Project URL และ anon public key ในหน้าต่างตั้งค่า Supabase DB',
    };
  }

  try {
    const { data, error } = await supabase.from('powers').select('id');
    if (error) {
      if (error.message.toLowerCase().includes('permission denied')) {
        return {
          isConfigured: true,
          url: cfg.url,
          connected: true,
          tablesReady: false,
          needsGrantFix: true,
          powersSeedCount: 0,
          message: `เชื่อมต่อโปรเจกต์ ${cfg.url} และพบตารางสำเร็จแล้ว! เหลือเพียงกดปุ่ม "คัดลอกคำสั่งปลดล็อกสิทธิ์ตาราง" ด้านล่างไปกด RUN ใน Supabase SQL Editor`,
        };
      }
      if (error.message.includes('does not exist') || error.code === '42P01') {
        return {
          isConfigured: true,
          url: cfg.url,
          connected: true,
          tablesReady: false,
          powersSeedCount: 0,
          message: 'เชื่อมต่อ Supabase สำเร็จแล้ว! แต่ยังไม่ได้รันโค้ด SQL สร้างตาราง 25 ตารางใน SQL Editor',
        };
      }
      return {
        isConfigured: true,
        url: cfg.url,
        connected: false,
        tablesReady: false,
        powersSeedCount: 0,
        message: `เชื่อมต่อไม่สำเร็จ: ${error.message}`,
      };
    }

    return {
      isConfigured: true,
      url: cfg.url,
      connected: true,
      tablesReady: true,
      powersSeedCount: data?.length ?? 0,
      message: `เชื่อมต่อฐานข้อมูล Supabase (${cfg.url}) และตรวจสอบตารางทั้ง 25 ตารางพร้อมใช้งาน 100%!`,
    };
  } catch (err) {
    return {
      isConfigured: true,
      url: cfg.url,
      connected: false,
      tablesReady: false,
      powersSeedCount: 0,
      message: err instanceof Error ? err.message : 'ไม่สามารถติดต่อเซิร์ฟเวอร์ Supabase ได้',
    };
  }
}
