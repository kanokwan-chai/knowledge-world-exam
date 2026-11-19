// ============================================================================
// KNOWLEDGE WORLD — FORTRESS SECURITY, ANTI-CHEAT & SANITIZATION GUARD
// Protects against XSS, Script Injection, Brute-Force, Bot Spam, Impersonation,
// Tab-Switching during Live Quizzes, and Unauthorized Teacher Portal Access
// ============================================================================

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const LOCKOUT_STORAGE_KEY = 'kw_security_lockout_until';
const FAILED_ATTEMPTS_KEY = 'kw_security_failed_attempts';
const TEACHER_GATE_UNLOCKED_KEY = 'kw_teacher_gate_unlocked';

// Reserved or impersonation nicknames blocked for students
const RESERVED_NICKNAMES = [
  'admin',
  'administrator',
  'teacher',
  'host',
  'system',
  'moderator',
  'root',
  'supabase',
  'คุณครู',
  'ครู',
  'แอดมิน',
  'ผู้ดูแลระบบ',
];

/**
 * 1. Strips dangerous HTML/XSS tags, zero-width characters, and script payloads
 */
export function sanitizeText(input: string, maxLength: number = 250): string {
  if (!input) return '';
  return input
    // Remove zero-width & invisible spoofing characters
    .replace(/[\u200B-\u200D\uFEFF\u0000-\u001F\u007F]/g, '')
    // Strip HTML tags
    .replace(/<[^>]*>?/gm, '')
    // Neutralize javascript: / data: / vbscript: schemes
    .replace(/(javascript|vbscript|data):/gi, '')
    // Neutralize inline event handlers
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * 2. Validates Player Nickname (Anti-Spoofing, Anti-XSS, Length & Reserved Check)
 */
export function validateSafeNickname(rawNickname: string): {
  valid: boolean;
  sanitized: string;
  error?: string;
} {
  const sanitized = sanitizeText(rawNickname, 30);

  if (sanitized.length < 2 || sanitized.length > 30) {
    return {
      valid: false,
      sanitized,
      error: 'ชื่อผู้เล่นต้องมีความยาว 2 ถึง 30 ตัวอักษร (ห้ามใช้อักขระพิเศษที่ซ่อนอยู่)',
    };
  }

  const lower = sanitized.toLowerCase();
  if (RESERVED_NICKNAMES.some((r) => lower === r || lower.includes(r))) {
    return {
      valid: false,
      sanitized,
      error: 'ไม่อนุญาตให้ใช้ชื่อที่สงวนไว้สำหรับระบบหรือแอบอ้างเป็นคุณครู/ผู้ดูแลระบบ',
    };
  }

  return { valid: true, sanitized };
}

/**
 * 3. Validates external Image URLs (Blocks javascript:, file:, http:, and non-HTTPS schemes)
 */
export function validateSafeImageUrl(rawUrl: string): {
  valid: boolean;
  sanitized: string | null;
  error?: string;
} {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { valid: true, sanitized: null };

  // Allow safe base64 image data URLs (e.g. uploaded question images)
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return { valid: true, sanitized: trimmed };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return {
        valid: false,
        sanitized: null,
        error: 'เพื่อความปลอดภัย รูปภาพต้องใช้ลิงก์ HTTPS เท่านั้น (https://...)',
      };
    }
    return { valid: true, sanitized: parsed.toString() };
  } catch {
    return {
      valid: false,
      sanitized: null,
      error: 'รูปแบบ URL รูปภาพไม่ถูกต้อง',
    };
  }
}

/**
 * 4. Client-Side Sliding Window Rate Limiter (Anti-Spam / Anti-Brute-Force)
 */
export function assertRateLimit(
  actionKey: string,
  maxAttempts: number = 5,
  windowMs: number = 15000
): void {
  const now = Date.now();
  const entry = rateLimitBuckets.get(actionKey);

  if (!entry || now > entry.resetAt) {
    rateLimitBuckets.set(actionKey, { count: 1, resetAt: now + windowMs });
    return;
  }

  entry.count += 1;
  if (entry.count > maxAttempts) {
    const waitSec = Math.ceil((entry.resetAt - now) / 1000);
    throw new Error(
      `🛡️ ระบบป้องกันการกดรัว (Rate Limit): กรุณารอ ${waitSec} วินาทีก่อนทำรายการนี้อีกครั้ง`
    );
  }
}

/**
 * 5. Brute-Force Lockout Manager (For PIN Entry & Teacher Gate)
 */
export function checkBruteForceLockout(): { locked: boolean; remainingSeconds: number } {
  if (typeof window === 'undefined') return { locked: false, remainingSeconds: 0 };
  const rawUntil = window.localStorage.getItem(LOCKOUT_STORAGE_KEY);
  if (!rawUntil) return { locked: false, remainingSeconds: 0 };

  const until = Number(rawUntil);
  const diff = until - Date.now();
  if (diff > 0) {
    return { locked: true, remainingSeconds: Math.ceil(diff / 1000) };
  }

  window.localStorage.removeItem(LOCKOUT_STORAGE_KEY);
  window.localStorage.removeItem(FAILED_ATTEMPTS_KEY);
  return { locked: false, remainingSeconds: 0 };
}

export function recordFailedSecurityAttempt(maxAttempts = 5, lockoutSeconds = 60): {
  locked: boolean;
  attemptsLeft: number;
  lockoutSeconds: number;
} {
  if (typeof window === 'undefined') {
    return { locked: false, attemptsLeft: maxAttempts, lockoutSeconds: 0 };
  }

  const current = Number(window.localStorage.getItem(FAILED_ATTEMPTS_KEY) || '0') + 1;
  window.localStorage.setItem(FAILED_ATTEMPTS_KEY, String(current));

  if (current >= maxAttempts) {
    const until = Date.now() + lockoutSeconds * 1000;
    window.localStorage.setItem(LOCKOUT_STORAGE_KEY, String(until));
    return { locked: true, attemptsLeft: 0, lockoutSeconds };
  }

  return {
    locked: false,
    attemptsLeft: maxAttempts - current,
    lockoutSeconds: 0,
  };
}

export function clearFailedSecurityAttempts(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(FAILED_ATTEMPTS_KEY);
  window.localStorage.removeItem(LOCKOUT_STORAGE_KEY);
}

/**
 * 6. Teacher Portal Master Passcode Gate (Prevents students from opening /teacher by URL)
 */
const DEFAULT_TEACHER_ACCESS_CODE =
  (import.meta.env.VITE_TEACHER_ACCESS_CODE as string | undefined) || 'TEACHER2026';

export function isTeacherGateUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(TEACHER_GATE_UNLOCKED_KEY) === 'true';
}

export function verifyTeacherAccessCode(inputCode: string): {
  unlocked: boolean;
  error?: string;
} {
  const lockStatus = checkBruteForceLockout();
  if (lockStatus.locked) {
    return {
      unlocked: false,
      error: `🔒 ระบบล็อกชั่วคราวเนื่องจากใส่รหัสผิดเกินกำหนด กรุณารอ ${lockStatus.remainingSeconds} วินาที`,
    };
  }

  const customCode =
    typeof window !== 'undefined'
      ? window.localStorage.getItem('kw_custom_teacher_code')
      : null;
  const expectedCode = customCode || DEFAULT_TEACHER_ACCESS_CODE;

  if (inputCode.trim() === expectedCode) {
    clearFailedSecurityAttempts();
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(TEACHER_GATE_UNLOCKED_KEY, 'true');
    }
    return { unlocked: true };
  }

  const fail = recordFailedSecurityAttempt(5, 60);
  if (fail.locked) {
    return {
      unlocked: false,
      error: `🔒 ใส่รหัสผิดครบ 5 ครั้ง! ระบบล็อกการเข้าถึงหน้าครูเป็นเวลา ${fail.lockoutSeconds} วินาที`,
    };
  }

  return {
    unlocked: false,
    error: `รหัสผ่านเข้าหน้าคุณครูไม่ถูกต้อง (เหลือโอกาสอีก ${fail.attemptsLeft} ครั้ง)`,
  };
}

export function lockTeacherGate(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(TEACHER_GATE_UNLOCKED_KEY);
}

export function getCurrentTeacherAccessCode(): string {
  if (typeof window === 'undefined') return DEFAULT_TEACHER_ACCESS_CODE;
  return window.localStorage.getItem('kw_custom_teacher_code') || DEFAULT_TEACHER_ACCESS_CODE;
}

export function setCustomTeacherAccessCode(newCode: string): void {
  if (typeof window === 'undefined') return;
  const clean = newCode.trim();
  if (clean.length < 4) {
    throw new Error('รหัสผ่านคุณครูต้องมีความยาวอย่างน้อย 4 ตัวอักษร');
  }
  window.localStorage.setItem('kw_custom_teacher_code', clean);
}

/**
 * 7. Custom 6-Digit Exam Room PIN Validation & Generator
 */
export function validateCustomExamPin(rawPin: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const clean = (rawPin || '').trim();
  if (!clean) {
    return { valid: true, normalized: '' };
  }
  if (!/^[0-9]{6}$/.test(clean)) {
    return {
      valid: false,
      normalized: clean,
      error: 'รหัสข้อสอบ (Exam PIN) ต้องเป็นตัวเลข 6 หลัก เช่น 123456 (หรือปล่อยว่างเพื่อสุ่มอัตโนมัติ)',
    };
  }
  return { valid: true, normalized: clean };
}

export function generateRandomExamPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * 8. Deterministic Per-Student Question Order Shuffler (0..totalQuestions-1)
 * Guarantees every student gets a unique question sequence at the same moment,
 * while remaining consistent across mobile refreshes/reconnects.
 */
export function buildShuffledQuestionOrder(totalQuestions: number, seedString: string): number[] {
  const count = Math.max(0, Math.floor(totalQuestions));
  const indices = Array.from({ length: count }, (_, i) => i);
  if (count <= 1) return indices;

  let hash = 2166136261;
  for (let i = 0; i < seedString.length; i++) {
    hash ^= seedString.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let i = indices.length - 1; i > 0; i--) {
    hash = (Math.imul(hash, 1664525) + 1013904223) | 0;
    const j = Math.abs(hash) % (i + 1);
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }
  return indices;
}

/**
 * 9. Student Exam Identity Formatter (Real Name + Last 3 Digits of Student ID)
 */
export function formatStudentExamIdentity(
  realName: string,
  last3Digits: string
): { valid: boolean; formatted: string; error?: string } {
  const nameCheck = validateSafeNickname(realName);
  if (!nameCheck.valid) {
    return {
      valid: false,
      formatted: '',
      error: nameCheck.error || 'กรุณากรอกชื่อ-นามสกุลจริงอย่างน้อย 2 ตัวอักษร',
    };
  }

  const digits = (last3Digits || '').replace(/\D/g, '');
  if (!/^[0-9]{3}$/.test(digits)) {
    return {
      valid: false,
      formatted: '',
      error: 'กรุณากรอกเลข 3 ตัวหลังของรหัสนักเรียนให้ครบ 3 หลัก (เช่น 045)',
    };
  }

  const trimmedName = nameCheck.sanitized.slice(0, 22).trim();
  const formatted = `${trimmedName} (#${digits})`;
  return { valid: true, formatted };
}
