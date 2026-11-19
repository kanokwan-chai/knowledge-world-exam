import {
  Classroom,
  GameHistoryRecord,
  GameParticipant,
  Quiz,
} from '../types/database';

export interface QuestionByQuestionStudentRow {
  participant_id: string;
  student_number: string;
  nickname: string;
  avatar_config: GameParticipant['avatar_config'];
  is_disqualified: boolean;
  disqualified_reason?: string | null;
  // Per-question real exam score: 1 = correct (1 pt), 0 = wrong (0 pt), null = not answered yet
  question_results: Array<1 | 0 | null>;
  real_exam_score: number; // Sum of 1s (0 if disqualified)
  total_questions: number;
  game_exp_score: number; // Game points (affected by 3D PvP attacks/steals/buffs, NEVER affects real_exam_score!)
  damage_dealt: number;
  damage_taken: number;
  avg_response_ms: number;
}

export interface BattleLogEntry {
  id: string;
  timestamp: string;
  attacker_name: string;
  target_name: string;
  action_type: 'attack_slash' | 'fireball' | 'steal_exp' | 'self_heal' | 'shield_block';
  exp_delta: number;
  message: string;
}

const DEMO_ENABLED_KEY = 'kw_demo_data_enabled';
const DEMO_STUDENTS_KEY = 'kw_demo_q_by_q_students';
const DEMO_BATTLE_LOGS_KEY = 'kw_demo_battle_logs';

export function isDemoDataEnabled(): boolean {
  return false;
}

export function setDemoDataEnabled(_enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DEMO_ENABLED_KEY);
  window.localStorage.removeItem(DEMO_STUDENTS_KEY);
  window.localStorage.removeItem(DEMO_BATTLE_LOGS_KEY);
}

// All mock data removed — system uses 100% real Supabase PostgreSQL data
export const DEMO_CLASSROOMS: Classroom[] = [];
export const DEMO_QUIZZES: Quiz[] = [];
export const INITIAL_DEMO_STUDENTS: QuestionByQuestionStudentRow[] = [];
export const INITIAL_DEMO_BATTLE_LOGS: BattleLogEntry[] = [];
export const DEMO_GAME_HISTORY: GameHistoryRecord[] = [];

export function getDemoStudents(): QuestionByQuestionStudentRow[] {
  return [];
}

export function saveDemoStudents(_rows: QuestionByQuestionStudentRow[]): void {
  // No-op: real data is stored in Supabase PostgreSQL
}

export function getDemoBattleLogs(): BattleLogEntry[] {
  return [];
}

export function saveDemoBattleLogs(_logs: BattleLogEntry[]): void {
  // No-op: real events are stored in Supabase game_events
}

/**
 * Exports Question-by-Question Real Exam Score + Game EXP Report as Excel (.xls XML Spreadsheet)
 */
export function exportQuestionByQuestionExcel(
  rows: QuestionByQuestionStudentRow[],
  quizTitle: string,
  totalQuestions: number
): void {
  const qHeaders = Array.from({ length: totalQuestions }, (_, i) => `ข้อที่ ${i + 1} (1 คะแนน)`);

  const headers = [
    'เลขที่',
    'ชื่อ-นามสกุลนักเรียน',
    'สถานะห้องสอบ (Anti-Cheat)',
    ...qHeaders,
    `รวมคะแนนสอบจริง (เต็ม ${totalQuestions})`,
    'คิดเป็นร้อยละ (%)',
    'แต้มเกมสะสมเพื่ออัปเลเวล (Game EXP)',
    'ดาเมจที่ทำในเกม (EXP)',
    'เวลาตอบเฉลี่ย (วินาที)',
  ];

  const tableRowsHtml = rows
    .map((r) => {
      const statusText = r.is_disqualified
        ? `ปรับทุจริต 0 คะแนน (${r.disqualified_reason || 'สลับหน้าจอ'})`
        : 'ปกติ (ผ่านเกณฑ์ห้องสอบ)';
      const pct = r.is_disqualified
        ? '0.00%'
        : `${((r.real_exam_score / Math.max(1, totalQuestions)) * 100).toFixed(2)}%`;

      const qCells = Array.from({ length: totalQuestions }, (_, idx) => {
        if (r.is_disqualified) return '<td style="background:#FEE2E2;color:#991B1B;text-align:center;">0 (ทุจริต)</td>';
        const val = r.question_results[idx];
        if (val === 1) return '<td style="background:#DCFCE7;color:#166534;text-align:center;font-weight:bold;">1</td>';
        if (val === 0) return '<td style="background:#FEF2F2;color:#991B1B;text-align:center;">0</td>';
        return '<td style="text-align:center;color:#64748B;">-</td>';
      }).join('');

      return `<tr>
        <td style="text-align:center;">${r.student_number}</td>
        <td style="font-weight:bold;">${r.nickname}</td>
        <td style="color:${r.is_disqualified ? '#DC2626' : '#15803D'};font-weight:bold;">${statusText}</td>
        ${qCells}
        <td style="background:#FEF9C3;font-weight:bold;text-align:center;font-size:14px;">${r.is_disqualified ? 0 : r.real_exam_score}</td>
        <td style="text-align:center;font-weight:bold;">${pct}</td>
        <td style="background:#E0F2FE;text-align:right;font-weight:bold;">${r.is_disqualified ? 0 : r.game_exp_score}</td>
        <td style="text-align:right;">${r.damage_dealt}</td>
        <td style="text-align:center;">${(r.avg_response_ms / 1000).toFixed(2)}</td>
      </tr>`;
    })
    .join('\n');

  const excelHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8">
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>ExamReport</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
    </head>
    <body>
      <h3>รายงานผลคะแนนสอบจริงรายข้อ (ข้อละ 1 คะแนน) — ${quizTitle}</h3>
      <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Tahoma,sans-serif;font-size:13px;">
        <thead>
          <tr style="background:#0F172A;color:#FBD000;font-weight:bold;text-align:center;">
            ${headers.map((h) => `<th>${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob(['\uFEFF' + excelHtml], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute(
    'download',
    `รายงานผลสอบ_Excel_${quizTitle.replace(/\s+/g, '_')}.xls`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
