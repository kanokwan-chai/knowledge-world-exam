import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, getSupabaseConfig } from '../lib/supabase';
import { setCustomTeacherAccessCode } from '../lib/securityGuard';
import { AvatarConfig, Profile, UserRole } from '../types/database';
import { fetchPlayerAvatar, fetchUserProfile } from '../services/gameEngineService';

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  gender: 'female',
  face: 'face_hero',
  base: 'explorer_red',
  hair: 'wavy_crimson',
  outfit: 'dress_princess',
  hat: 'bow_ribbon',
  accessory: 'star_badge',
};

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  avatarConfig: AvatarConfig;
  avatarName: string;
  loading: boolean;
  isOnline: boolean;
  isSupabaseConfigured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setLocalAvatarConfig: (config: AvatarConfig, name?: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function translateAuthError(rawMessage: string): string {
  const lower = (rawMessage || '').toLowerCase();

  if (lower.includes('email not confirmed')) {
    return 'บัญชียังไม่ได้ยืนยันอีเมล — กรุณาไปที่ Supabase → Authentication → Providers → Email ปิดสวิตช์ Confirm email แล้วกด Save หรือกดปุ่ม "คัดลอก SQL แก้ปัญหาสมัครครู" ด้านล่างไปรันใน SQL Editor จากนั้นกดเข้าสู่ระบบครับ';
  }
  if (lower.includes('email rate limit exceeded') || lower.includes('over_email_send_rate_limit')) {
    return 'ส่งอีเมลยืนยันเกินโควต้าของ Supabase Free (จำกัด 2 ฉบับ/ชั่วโมง) — กรุณาไปที่ Supabase → Authentication → Providers → Email ปิดสวิตช์ Confirm email แล้วกด Save (หรือรัน SQL ยืนยันบัญชีด้านล่าง) จะสมัครและเข้าสู่ระบบได้ทันทีไม่ติดลิมิตครับ';
  }
  if (lower.includes('database error saving new user')) {
    return 'เกิดข้อผิดพลาดที่ Database Trigger (handle_new_user) ใน Supabase — กรุณากดปุ่ม "คัดลอก SQL แก้ปัญหาสมัครครู" ด้านล่าง แล้วนำไปวางกด RUN ใน Supabase SQL Editor จากนั้นลองสมัครใหม่อีกครั้งครับ';
  }
  if (lower.includes('user already registered')) {
    return 'อีเมลนี้เคยสมัครสมาชิกไว้แล้ว — กรุณากดปุ่ม "เข้าสู่ระบบครู (Sign In)" แล้วใช้อีเมลและรหัสผ่านนี้เข้าสู่ระบบได้เลยครับ';
  }
  if (lower.includes('invalid login credentials')) {
    return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง (หรือยังไม่ได้สมัครสมาชิกด้วยอีเมลนี้)';
  }
  if (lower.includes('unable to validate email address') || lower.includes('invalid format')) {
    return 'รูปแบบอีเมลไม่ถูกต้อง กรุณากรอกอีเมลให้ครบถ้วน เช่น name@gmail.com';
  }
  if (lower.includes('password should be at least')) {
    return 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร';
  }
  if (
    lower.includes('email logins are disabled') ||
    lower.includes('email signups are disabled') ||
    lower.includes('signups not allowed')
  ) {
    return 'ระบบ Email Login บน Supabase ถูกปิดอยู่ (Email logins are disabled) — กรุณาไปที่ Supabase → Authentication → Providers → Email แล้วเปิดสวิตช์บนสุด "Enable Email provider" ให้เป็นสีเขียว (ON) ส่วนสวิตช์ "Confirm email" ให้ปิด (OFF) จากนั้นกด Save ครับ';
  }

  return rawMessage;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(() => {
    const saved = window.localStorage.getItem('kw_local_avatar');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_AVATAR_CONFIG;
      }
    }
    return DEFAULT_AVATAR_CONFIG;
  });
  const [avatarName, setAvatarName] = useState<string>('Super Explorer');
  const [loading, setLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const { isConfigured: isSupabaseConfigured } = getSupabaseConfig();

  const loadUserProfileAndAvatar = useCallback(async (uid: string) => {
    try {
      const prof = await fetchUserProfile(uid);
      if (prof) {
        setProfile(prof);
      }
      const av = await fetchPlayerAvatar(uid);
      if (av) {
        setAvatarConfig(av.config);
        setAvatarName(av.avatar_name);
        window.localStorage.setItem('kw_local_avatar', JSON.stringify(av.config));
      }
    } catch (err) {
      console.error('Error loading user profile:', err);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      const savedVaultCode = currentSession?.user?.user_metadata?.teacher_vault_code;
      if (typeof savedVaultCode === 'string' && savedVaultCode.trim().length >= 4) {
        try {
          setCustomTeacherAccessCode(savedVaultCode);
        } catch {
          // Ignore invalid code
        }
      }
      if (currentSession?.user) {
        loadUserProfileAndAvatar(currentSession.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      const savedVaultCode = nextSession?.user?.user_metadata?.teacher_vault_code;
      if (typeof savedVaultCode === 'string' && savedVaultCode.trim().length >= 4) {
        try {
          setCustomTeacherAccessCode(savedVaultCode);
        } catch {
          // Ignore invalid code
        }
      }
      if (nextSession?.user) {
        loadUserProfileAndAvatar(nextSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [isSupabaseConfigured, loadUserProfileAndAvatar]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      throw new Error(translateAuthError(error.message));
    }
  };

  const signUp = async (email: string, password: string, displayName: string, role: UserRole) => {
    const safeDisplayName = displayName.trim().slice(0, 28);
    if (safeDisplayName.length < 2) {
      throw new Error('ชื่อต้องมีความยาวอย่างน้อย 2 ตัวอักษร (สูงสุด 28 ตัวอักษร)');
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          display_name: safeDisplayName,
          role,
        },
      },
    });
    if (error) throw new Error(translateAuthError(error.message));

    if (data.user && !data.session) {
      throw new Error(
        'สมัครบัญชีแล้ว แต่ Supabase ยังเปิดการยืนยันอีเมลอยู่ — กรุณาไปที่ Supabase → Authentication → Providers → Email ปิดสวิตช์ Confirm email แล้วกด Save หรือกดปุ่ม "คัดลอก SQL แก้ปัญหาสมัครครู" ด้านล่างไปรันใน SQL Editor จากนั้นกดเข้าสู่ระบบครับ'
      );
    }

    // Ensure profile row exists if trigger hasn't fired yet (insert only if missing; never upsert over existing row)
    if (data.user && data.session) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle();

      if (!existingProfile) {
        await supabase.from('profiles').insert({
          id: data.user.id,
          email: email.trim(),
          display_name: safeDisplayName,
          role,
          coins: 200,
          exp: 0,
          level: 1,
        });
      }
      await loadUserProfileAndAvatar(data.user.id);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    setUser(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await loadUserProfileAndAvatar(user.id);
    }
  };

  const setLocalAvatarConfig = (config: AvatarConfig, name?: string) => {
    setAvatarConfig(config);
    if (name) setAvatarName(name);
    window.localStorage.setItem('kw_local_avatar', JSON.stringify(config));
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        avatarConfig,
        avatarName,
        loading,
        isOnline,
        isSupabaseConfigured,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        setLocalAvatarConfig,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
