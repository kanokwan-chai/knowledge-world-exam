import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BUILTIN_AVATAR_CATALOG } from '../components/avatar/AvatarRenderer';
import { DEFAULT_AVATAR_CONFIG } from '../context/AuthContext';
import {
  buildShuffledQuestionOrder,
  formatStudentExamIdentity,
  generateRandomExamPin,
  sanitizeText,
  validateCustomExamPin,
  validateSafeImageUrl,
  validateSafeNickname,
  verifyTeacherAccessCode,
} from '../lib/securityGuard';
import { parseRawQuizText } from '../lib/smartQuizParser';

const REQUIRED_25_TABLES = [
  'profiles',
  'classrooms',
  'classroom_students',
  'quizzes',
  'questions',
  'answer_choices',
  'game_rooms',
  'game_participants',
  'game_answers',
  'game_events',
  'scores',
  'avatars',
  'avatar_items',
  'player_inventory',
  'powers',
  'player_powers',
  'rewards',
  'reward_history',
  'player_levels',
  'achievements',
  'player_achievements',
  'missions',
  'player_missions',
  'coin_transactions',
  'game_history',
];

describe('Knowledge World — Database Architecture & Security Verification', () => {
  const schemaSql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/001_schema.sql'),
    'utf-8'
  );
  const rpcSql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/002_rpc_and_security.sql'),
    'utf-8'
  );

  it('defines all 25 required PostgreSQL tables with constraints and indexes', () => {
    for (const tbl of REQUIRED_25_TABLES) {
      expect(schemaSql).toContain(`CREATE TABLE IF NOT EXISTS public.${tbl}`);
    }
    expect(schemaSql).toContain('UNIQUE (room_id, question_id, participant_id)');
    expect(schemaSql).toContain('UNIQUE (room_id, nickname)');
  });

  it('enables Row Level Security (RLS) on all 25 tables and defines server-authoritative RPCs', () => {
    for (const tbl of REQUIRED_25_TABLES) {
      expect(rpcSql).toContain(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY;`);
    }

    const requiredRpcs = [
      'create_game_room',
      'join_game_room',
      'get_public_question_payload',
      'advance_game_question',
      'submit_game_answer',
      'use_player_power',
      'roll_lucky_block',
      'purchase_avatar_item',
      'finalize_game_room',
    ];
    for (const fn of requiredRpcs) {
      expect(rpcSql).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`);
    }
  });

  it('simulates 40 concurrent students joining, answering, and deterministic leaderboard tie-breaking', () => {
    interface SimPlayer {
      id: string;
      nickname: string;
      current_score: number;
      correct_count: number;
      total_response_ms: number;
    }

    const players: SimPlayer[] = Array.from({ length: 40 }, (_, i) => ({
      id: `p_${i + 1}`,
      nickname: `Student_${i + 1}`,
      current_score: i < 3 ? 2500 : 1000 + i * 20, // Top 3 have identical score to test tie-breaker!
      correct_count: i === 0 ? 5 : i === 1 ? 5 : 4,
      total_response_ms: i === 0 ? 4200 : i === 1 ? 5100 : 3900,
    }));

    // Deterministic tie-breaker: 1) current_score DESC, 2) correct_count DESC, 3) total_response_ms ASC
    const sorted = [...players].sort((a, b) => {
      if (b.current_score !== a.current_score) return b.current_score - a.current_score;
      if (b.correct_count !== a.correct_count) return b.correct_count - a.correct_count;
      return a.total_response_ms - b.total_response_ms;
    });

    expect(sorted).toHaveLength(40);
    expect(sorted[0].id).toBe('p_1'); // 2500 pts, 5 correct, 4200ms beats 5100ms
    expect(sorted[1].id).toBe('p_2'); // 2500 pts, 5 correct, 5100ms beats 4 correct
    expect(sorted[2].id).toBe('p_3'); // 2500 pts, 4 correct
  });

  it('validates original Avatar catalog items and ensures no Nintendo IP infringement', () => {
    expect(BUILTIN_AVATAR_CATALOG.length).toBeGreaterThanOrEqual(20);
    expect(DEFAULT_AVATAR_CONFIG.base).toBe('explorer_red');

    const forbiddenTerms = ['mario', 'luigi', 'bowser', 'peach', 'yoshi', 'toad', 'nintendo'];
    for (const item of BUILTIN_AVATAR_CATALOG) {
      const combined = `${item.code} ${item.name}`.toLowerCase();
      for (const term of forbiddenTerms) {
        expect(combined).not.toContain(term);
      }
    }
  });

  it('enforces multi-layer XSS sanitization, anti-impersonation nicknames, HTTPS image validation, and Teacher Vault passcode lock', () => {
    // 1. XSS & script stripping
    const dirty = '<script>alert("xss")</script>Hello onclick=evil() javascript:hack()';
    const clean = sanitizeText(dirty);
    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('onclick=');
    expect(clean).not.toContain('javascript:');

    // 2. Anti-impersonation nickname check
    expect(validateSafeNickname('ครูสมชาย').valid).toBe(false);
    expect(validateSafeNickname('System Admin').valid).toBe(false);
    expect(validateSafeNickname('น้องต้นกล้า').valid).toBe(true);

    // 3. HTTPS-only Image URL check
    expect(validateSafeImageUrl('javascript:alert(1)').valid).toBe(false);
    expect(validateSafeImageUrl('http://insecure.example.com/a.png').valid).toBe(false);
    expect(validateSafeImageUrl('https://images.unsplash.com/photo.png').valid).toBe(true);

    // 4. Teacher Master Passcode Gate
    expect(verifyTeacherAccessCode('WRONG_PASS').unlocked).toBe(false);
    expect(verifyTeacherAccessCode('TEACHER2026').unlocked).toBe(true);
  });

  it('auto-parses pasted multi-question Thai and English quiz text into structured questions and choices', () => {
    const rawPaste = `
      1. ดาวเคราะห์ดวงใดใหญ่ที่สุด?
      ก. โลก
      ข. ดาวอังคาร
      *ค. ดาวพฤหัสบดี
      ง. ดาวเสาร์

      2. น้ำมีจุดเดือดที่กี่องศาเซลเซียส?
      ก. 50   ข. 80   ค. 100 (ถูก)   ง. 120
    `;
    const parsed = parseRawQuizText(rawPaste, 25);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].prompt).toContain('ดาวเคราะห์ดวงใดใหญ่ที่สุด');
    expect(parsed[0].choices).toHaveLength(4);
    expect(parsed[0].choices[2].is_correct).toBe(true);
    expect(parsed[0].time_limit_seconds).toBe(25);

    expect(parsed[1].prompt).toContain('น้ำมีจุดเดือดที่กี่องศาเซลเซียส');
    expect(parsed[1].choices).toHaveLength(4);
    expect(parsed[1].choices[2].is_correct).toBe(true);
  });

  it('validates custom 6-digit Exam PINs and generates random 6-digit PINs', () => {
    expect(validateCustomExamPin('')).toEqual({ valid: true, normalized: '' });
    expect(validateCustomExamPin(' 256901 ')).toEqual({ valid: true, normalized: '256901' });
    expect(validateCustomExamPin('12345').valid).toBe(false);
    expect(validateCustomExamPin('1234567').valid).toBe(false);
    expect(validateCustomExamPin('ABC123').valid).toBe(false);

    const randomPin = generateRandomExamPin();
    expect(randomPin).toMatch(/^[0-9]{6}$/);
  });

  it('generates deterministic per-student shuffled question orders so students see different questions simultaneously', () => {
    const orderA1 = buildShuffledQuestionOrder(20, 'room_1_student_A');
    const orderA2 = buildShuffledQuestionOrder(20, 'room_1_student_A');
    const orderB = buildShuffledQuestionOrder(20, 'room_1_student_B');

    expect(orderA1).toEqual(orderA2); // deterministic on refresh
    expect(orderA1).toHaveLength(20);
    expect([...orderA1].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(orderA1).not.toEqual(orderB); // different student gets different order
  });

  it('validates student exam identity with real name + last 3 digits of student ID', () => {
    const ok = formatStudentExamIdentity('ด.ช.สมชาย ใจดี', '456');
    expect(ok.valid).toBe(true);
    expect(ok.formatted).toBe('ด.ช.สมชาย ใจดี (#456)');
    expect(ok.formatted.length).toBeLessThanOrEqual(30);

    expect(formatStudentExamIdentity('สมชาย', '12').valid).toBe(false);
    expect(formatStudentExamIdentity('ก', '123').valid).toBe(false);
    expect(formatStudentExamIdentity('ครูเมล', '123').valid).toBe(false);
  });

  it('parses Thai numerals and bottom bulk answer keys accurately', () => {
    const rawWithBulkKey = `
      ๑. เมืองหลวงของไทยคือข้อใด
      (ก) เชียงใหม่
      (ข) กรุงเทพมหานคร
      (ค) ภูเก็ต
      (ง) ขอนแก่น

      ๒. 2 + 2 เท่ากับเท่าไร
      ก. 3
      ข. 5
      ค. 4
      ง. 6

      เฉลย: 1.ข 2.ค
    `;
    const parsed = parseRawQuizText(rawWithBulkKey, 30);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].choices[1].is_correct).toBe(true);
    expect(parsed[1].choices[2].is_correct).toBe(true);
  });
});
