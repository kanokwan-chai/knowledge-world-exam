import { AvatarConfig } from '../types/database';
import { DEFAULT_AVATAR_CONFIG } from '../context/AuthContext';
import { supabase } from './supabase';

export interface StudentVaultProfile {
  identityKey: string; // e.g. "สมชาย ใจดี#045"
  displayIdentity: string; // e.g. "สมชาย ใจดี (#045)"
  realName: string;
  last3Digits: string;
  avatarConfig: AvatarConfig;
  walletCoins: number;
  totalAccumulatedExp: number;
  level: number;
  luckyTickets: number;
  ownedItemCodes: string[];
  gamesPlayed: number;
  creditedKeys: string[]; // prevents duplicate crediting on refresh
  updatedAt: string;
}

const VAULT_STORAGE_PREFIX = 'kw_student_vault_v1::';
const ACTIVE_KEY_STORAGE = 'kw_active_student_identity_v1';

export function normalizeStudentIdentityKey(rawNameOrFormatted: string, last3Digits?: string): string {
  const cleaned = rawNameOrFormatted.trim().replace(/\s+/g, ' ');
  if (last3Digits && /^\d{3}$/.test(last3Digits.trim())) {
    return `${cleaned.toLowerCase()}#${last3Digits.trim()}`;
  }
  // Parse formatted identity like "สมชาย ใจดี (#045)"
  const match = cleaned.match(/^(.+?)\s*\(#(\d{3})\)$/);
  if (match) {
    return `${match[1].trim().toLowerCase()}#${match[2]}`;
  }
  return cleaned.toLowerCase();
}

export function parseFormattedIdentity(formatted: string): { realName: string; last3Digits: string } {
  const match = formatted.trim().match(/^(.+?)\s*\(#(\d{3})\)$/);
  if (match) {
    return { realName: match[1].trim(), last3Digits: match[2] };
  }
  return { realName: formatted.trim(), last3Digits: '000' };
}

export function calculateLevelFromExp(totalExp: number): number {
  return Math.max(1, Math.floor(Math.max(0, totalExp) / 400) + 1);
}

export function getActiveStudentIdentityKey(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACTIVE_KEY_STORAGE);
}

export function setActiveStudentIdentityKey(identityKey: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACTIVE_KEY_STORAGE, identityKey);
}

export function getStudentVaultProfile(
  rawNameOrKey: string,
  last3Digits?: string
): StudentVaultProfile | null {
  if (typeof window === 'undefined' || !rawNameOrKey.trim()) return null;
  const key = last3Digits
    ? normalizeStudentIdentityKey(rawNameOrKey, last3Digits)
    : rawNameOrKey.includes('#') && !rawNameOrKey.includes('(#')
      ? rawNameOrKey.toLowerCase()
      : normalizeStudentIdentityKey(rawNameOrKey);

  const raw = window.localStorage.getItem(`${VAULT_STORAGE_PREFIX}${key}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StudentVaultProfile;
  } catch {
    return null;
  }
}

export function getActiveStudentVaultProfile(): StudentVaultProfile | null {
  const activeKey = getActiveStudentIdentityKey();
  if (!activeKey) return null;
  return getStudentVaultProfile(activeKey);
}

function mapCloudRowToVault(row: Record<string, unknown>): StudentVaultProfile {
  return {
    identityKey: String(row.identity_key || ''),
    displayIdentity: String(row.display_identity || ''),
    realName: String(row.real_name || ''),
    last3Digits: String(row.last_3_digits || '000'),
    avatarConfig: (row.avatar_config as AvatarConfig) || DEFAULT_AVATAR_CONFIG,
    walletCoins: Number(row.wallet_coins ?? 100),
    totalAccumulatedExp: Number(row.total_accumulated_exp ?? 0),
    level: Number(row.level ?? 1),
    luckyTickets: Number(row.lucky_tickets ?? 1),
    ownedItemCodes: Array.isArray(row.owned_item_codes) ? (row.owned_item_codes as string[]) : [],
    gamesPlayed: Number(row.games_played ?? 0),
    creditedKeys: Array.isArray(row.credited_keys) ? (row.credited_keys as string[]) : [],
    updatedAt: String(row.last_seen_at || new Date().toISOString()),
  };
}

/**
 * Background fire-and-forget cloud sync to Supabase `student_identities`
 * so the student's avatar, coins, level & unlocked items follow them to ANY device!
 */
export async function pushStudentVaultToCloud(profile: StudentVaultProfile): Promise<void> {
  if (!/^\d{3}$/.test(profile.last3Digits)) return;
  try {
    await supabase.rpc('upsert_student_identity_cloud', {
      p_identity_key: profile.identityKey,
      p_display_identity: profile.displayIdentity,
      p_real_name: profile.realName,
      p_last_3_digits: profile.last3Digits,
      p_avatar_config: profile.avatarConfig,
      p_wallet_coins: profile.walletCoins,
      p_total_accumulated_exp: profile.totalAccumulatedExp,
      p_level: profile.level,
      p_lucky_tickets: profile.luckyTickets,
      p_owned_item_codes: profile.ownedItemCodes,
      p_games_played: profile.gamesPlayed,
      p_credited_keys: profile.creditedKeys.slice(-200),
    });
  } catch {
    // Gracefully ignore if migration 004 hasn't been executed yet or network is offline
  }
}

/**
 * Fetches student's cloud profile from Supabase by Real Name + Last 3 Digits (works on ANY new device!)
 * and caches it locally so UI updates immediately.
 */
export async function fetchStudentVaultFromCloud(
  realName: string,
  last3Digits: string
): Promise<StudentVaultProfile | null> {
  const key = normalizeStudentIdentityKey(realName, last3Digits);
  if (!key || !/^\d{3}$/.test(last3Digits.trim())) return null;

  try {
    const { data, error } = await supabase.rpc('get_student_identity_cloud', {
      p_identity_key: key,
    });
    if (error || !data) {
      return getStudentVaultProfile(key);
    }

    const cloudProfile = mapCloudRowToVault(data as Record<string, unknown>);
    const localProfile = getStudentVaultProfile(key);

    // Merge local & cloud safely (never lose unlocked items)
    const merged: StudentVaultProfile = localProfile
      ? {
          ...cloudProfile,
          ownedItemCodes: Array.from(
            new Set([...cloudProfile.ownedItemCodes, ...localProfile.ownedItemCodes])
          ),
          creditedKeys: Array.from(
            new Set([...cloudProfile.creditedKeys, ...localProfile.creditedKeys])
          ).slice(-300),
          totalAccumulatedExp: Math.max(
            cloudProfile.totalAccumulatedExp,
            localProfile.totalAccumulatedExp
          ),
          level: Math.max(cloudProfile.level, localProfile.level),
          gamesPlayed: Math.max(cloudProfile.gamesPlayed, localProfile.gamesPlayed),
        }
      : cloudProfile;

    setActiveStudentIdentityKey(merged.identityKey);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        `${VAULT_STORAGE_PREFIX}${merged.identityKey}`,
        JSON.stringify(merged)
      );
      window.localStorage.setItem('kw_local_avatar', JSON.stringify(merged.avatarConfig));
    }
    return merged;
  } catch {
    return getStudentVaultProfile(key);
  }
}

function persistVaultProfile(profile: StudentVaultProfile): StudentVaultProfile {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      `${VAULT_STORAGE_PREFIX}${profile.identityKey}`,
      JSON.stringify(profile)
    );
    window.localStorage.setItem('kw_local_avatar', JSON.stringify(profile.avatarConfig));
  }
  // Sync to Supabase cloud in the background for cross-device recall
  void pushStudentVaultToCloud(profile);
  return profile;
}

export function ensureStudentVaultProfile(
  realName: string,
  last3Digits: string,
  fallbackAvatar: AvatarConfig = DEFAULT_AVATAR_CONFIG
): StudentVaultProfile {
  const key = normalizeStudentIdentityKey(realName, last3Digits);
  const existing = getStudentVaultProfile(key);
  if (existing) {
    setActiveStudentIdentityKey(key);
    return existing;
  }

  const created: StudentVaultProfile = {
    identityKey: key,
    displayIdentity: `${realName.trim()} (#${last3Digits.trim()})`,
    realName: realName.trim(),
    last3Digits: last3Digits.trim(),
    avatarConfig: fallbackAvatar,
    walletCoins: 100, // Small welcome bonus so new students feel excited to save & buy
    totalAccumulatedExp: 0,
    level: 1,
    luckyTickets: 1, // 1 starter Lucky Block ticket
    ownedItemCodes: [],
    gamesPlayed: 0,
    creditedKeys: [],
    updatedAt: new Date().toISOString(),
  };

  setActiveStudentIdentityKey(key);
  return persistVaultProfile(created);
}

export function saveStudentVaultAvatar(
  identityKey: string,
  avatarConfig: AvatarConfig
): StudentVaultProfile | null {
  const existing = getStudentVaultProfile(identityKey);
  if (!existing) return null;
  const updated: StudentVaultProfile = {
    ...existing,
    avatarConfig,
    updatedAt: new Date().toISOString(),
  };
  return persistVaultProfile(updated);
}

export function creditStudentGameReward(
  identityKey: string,
  params: {
    dedupeKey: string;
    coins: number;
    exp: number;
    luckyTickets?: number;
    incrementGamesPlayed?: boolean;
  }
): { credited: boolean; profile: StudentVaultProfile | null } {
  const existing = getStudentVaultProfile(identityKey);
  if (!existing) return { credited: false, profile: null };

  if (existing.creditedKeys.includes(params.dedupeKey)) {
    return { credited: false, profile: existing };
  }

  const nextExp = existing.totalAccumulatedExp + Math.max(0, Math.round(params.exp));
  const nextCoins = existing.walletCoins + Math.max(0, Math.round(params.coins));
  const nextTickets = existing.luckyTickets + Math.max(0, params.luckyTickets || 0);

  // Keep creditedKeys bounded to last 300 entries
  const nextCredited = [...existing.creditedKeys, params.dedupeKey].slice(-300);

  const updated: StudentVaultProfile = {
    ...existing,
    walletCoins: nextCoins,
    totalAccumulatedExp: nextExp,
    level: calculateLevelFromExp(nextExp),
    luckyTickets: nextTickets,
    gamesPlayed: existing.gamesPlayed + (params.incrementGamesPlayed ? 1 : 0),
    creditedKeys: nextCredited,
    updatedAt: new Date().toISOString(),
  };

  return { credited: true, profile: persistVaultProfile(updated) };
}

export function purchaseStudentVaultItem(
  identityKey: string,
  itemCode: string,
  priceCoins: number
): { ok: boolean; profile: StudentVaultProfile | null; error?: string } {
  const existing = getStudentVaultProfile(identityKey);
  if (!existing) {
    return { ok: false, profile: null, error: 'กรุณาใส่ชื่อจริงและเลข 3 ตัวหลังที่หน้าแรกก่อนซื้อของแต่งตัวละคร' };
  }

  if (existing.ownedItemCodes.includes(itemCode)) {
    return { ok: true, profile: existing };
  }

  if (existing.walletCoins < priceCoins) {
    return {
      ok: false,
      profile: existing,
      error: `เหรียญสะสมไม่พอ! ต้องการ ${priceCoins.toLocaleString()} เหรียญ (ตอนนี้คุณมี ${existing.walletCoins.toLocaleString()} เหรียญ — ตอบข้อสอบถูกเพื่อสะสมเหรียญเพิ่มนะ!)`,
    };
  }

  const updated: StudentVaultProfile = {
    ...existing,
    walletCoins: existing.walletCoins - priceCoins,
    ownedItemCodes: [...existing.ownedItemCodes, itemCode],
    updatedAt: new Date().toISOString(),
  };

  return { ok: true, profile: persistVaultProfile(updated) };
}

export function unlockStudentVaultItemFree(
  identityKey: string,
  itemCode: string
): StudentVaultProfile | null {
  const existing = getStudentVaultProfile(identityKey);
  if (!existing) return null;
  if (existing.ownedItemCodes.includes(itemCode)) return existing;
  const updated: StudentVaultProfile = {
    ...existing,
    ownedItemCodes: [...existing.ownedItemCodes, itemCode],
    updatedAt: new Date().toISOString(),
  };
  return persistVaultProfile(updated);
}

export function spendForLuckyBlockSpin(
  identityKey: string,
  spinCostCoins: number = 120
): { ok: boolean; usedTicket: boolean; profile: StudentVaultProfile | null; error?: string } {
  const existing = getStudentVaultProfile(identityKey);
  if (!existing) {
    return {
      ok: false,
      usedTicket: false,
      profile: null,
      error: 'กรุณาใส่ชื่อจริงและเลข 3 ตัวหลังที่หน้าแรกก่อนเปิดกล่องสุ่ม',
    };
  }

  if (existing.luckyTickets > 0) {
    const updated: StudentVaultProfile = {
      ...existing,
      luckyTickets: existing.luckyTickets - 1,
      updatedAt: new Date().toISOString(),
    };
    return { ok: true, usedTicket: true, profile: persistVaultProfile(updated) };
  }

  if (existing.walletCoins >= spinCostCoins) {
    const updated: StudentVaultProfile = {
      ...existing,
      walletCoins: existing.walletCoins - spinCostCoins,
      updatedAt: new Date().toISOString(),
    };
    return { ok: true, usedTicket: false, profile: persistVaultProfile(updated) };
  }

  return {
    ok: false,
    usedTicket: false,
    profile: existing,
    error: `ต้องใช้ตั๋วสุ่ม 1 ใบ หรือ ${spinCostCoins} เหรียญ (ตอนนี้มี ${existing.walletCoins} เหรียญ — เล่นตอบคำถามเพื่อรับเหรียญและตั๋วสุ่มฟรี!)`,
  };
}
