import { QuestionType } from '../types/database';

export interface ParsedDraftChoice {
  choice_label: string;
  choice_text: string;
  is_correct: boolean;
  sort_order: number;
}

export interface ParsedDraftQuestion {
  temp_id: string;
  question_type: QuestionType;
  prompt: string;
  image_url: string | null;
  explanation: string;
  time_limit_seconds: number;
  base_points: number;
  speed_bonus_max: number;
  choices: ParsedDraftChoice[];
}

const THAI_CHOICE_MAP: Record<string, number> = {
  ก: 0,
  ข: 1,
  ค: 2,
  ง: 3,
  a: 0,
  b: 1,
  c: 2,
  d: 3,
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
};

function normalizeThaiNumerals(input: string): string {
  const thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
  return input.replace(/[๐-๙]/g, (ch) => String(thaiDigits.indexOf(ch)));
}

/**
 * Smart Question & Choice Auto-Parser
 * Parses raw pasted Thai/English exam text (from Word, PDF, Google Docs, Line, or AI)
 * into structured questions, choices, correct answers, explanations, and timers.
 */
export function parseRawQuizText(
  rawText: string,
  defaultTimeSeconds: number = 20
): ParsedDraftQuestion[] {
  if (!rawText || !rawText.trim()) return [];

  const normalized = normalizeThaiNumerals(rawText)
    .replace(/\r\n/g, '\n')
    .replace(/\t+/g, '  ')
    // Split inline choices e.g. "ก. 10   ข. 20   ค. 30   ง. 40" or "(ก) 10 (ข) 20" onto separate lines
    .replace(/\s+(?=[*✓✔]?(?:\([กขคงABCDabcd]\)|[กขคงABCDabcd][.)])\s+)/g, '\n')
    .trim();

  const lines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const questions: ParsedDraftQuestion[] = [];
  const bulkAnswerKeyMap = new Map<number, number>();
  let currentPromptLines: string[] = [];
  let currentChoices: Array<{ text: string; isCorrect: boolean }> = [];
  let explicitAnswerIndex: number | null = null;
  let currentExplanation = '';
  let currentTime = defaultTimeSeconds;

  const flushCurrentQuestion = () => {
    const promptText = currentPromptLines
      .join(' ')
      .replace(/^(?:ข้อที่|ข้อ|Question|Q)?\s*\d+\s*[.):-]\s*/i, '')
      .trim();

    if (!promptText && currentChoices.length === 0) return;

    let finalChoices: ParsedDraftChoice[] = [];
    let qType: QuestionType = 'multiple_choice';

    if (currentChoices.length === 0) {
      // Fallback default 4 empty choices so teacher can fill or edit
      finalChoices = ['A', 'B', 'C', 'D'].map((lbl, idx) => ({
        choice_label: lbl,
        choice_text: `ตัวเลือก ${lbl}`,
        is_correct: idx === 0,
        sort_order: idx,
      }));
    } else if (currentChoices.length === 2) {
      qType = 'true_false';
      finalChoices = currentChoices.map((c, idx) => ({
        choice_label: idx === 0 ? 'T' : 'F',
        choice_text: c.text,
        is_correct: c.isCorrect,
        sort_order: idx,
      }));
    } else {
      const padded = [...currentChoices];
      while (padded.length < 4) {
        padded.push({ text: `ตัวเลือก ${['A', 'B', 'C', 'D'][padded.length]}`, isCorrect: false });
      }
      finalChoices = padded.slice(0, 4).map((c, idx) => ({
        choice_label: ['A', 'B', 'C', 'D'][idx],
        choice_text: c.text,
        is_correct: c.isCorrect,
        sort_order: idx,
      }));
    }

    if (explicitAnswerIndex !== null && finalChoices[explicitAnswerIndex]) {
      finalChoices = finalChoices.map((c, idx) => ({
        ...c,
        is_correct: idx === explicitAnswerIndex,
      }));
    } else if (!finalChoices.some((c) => c.is_correct) && finalChoices.length > 0) {
      finalChoices[0].is_correct = true;
    }

    questions.push({
      temp_id: `draft_${Date.now()}_${questions.length}_${Math.random().toString(36).slice(2, 6)}`,
      question_type: qType,
      prompt: promptText || `คำถามข้อที่ ${questions.length + 1}`,
      image_url: null,
      explanation: currentExplanation,
      time_limit_seconds: currentTime,
      base_points: 1000,
      speed_bonus_max: 500,
      choices: finalChoices,
    });

    currentPromptLines = [];
    currentChoices = [];
    explicitAnswerIndex = null;
    currentExplanation = '';
    currentTime = defaultTimeSeconds;
  };

  for (const line of lines) {
    // 0. Check if line is a Bulk Bottom Answer Key e.g. "เฉลย: 1.ก 2.ข 3.ค 4.ง"
    if (/^(?:เฉลยรวม|เฉลยทั้งหมด|เฉลย|Answer\s*Key)\s*[:=-]?\s*(?:\d+\s*[.):-]?\s*[กขคงABCDabcd1234](?:[\s,;]+|$)){2,}/i.test(line)) {
      const pairs = line.matchAll(/(\d+)\s*[.):-]?\s*([กขคงABCDabcd1234])/gi);
      for (const m of pairs) {
        const qNum = Number(m[1]);
        const ansIdx = THAI_CHOICE_MAP[m[2].toLowerCase()];
        if (qNum >= 1 && ansIdx !== undefined) {
          bulkAnswerKeyMap.set(qNum - 1, ansIdx);
        }
      }
      continue;
    }

    // 1. Check if line is an Explicit Answer Key e.g. "เฉลย: ก", "ตอบ ข", "Answer: C"
    const ansMatch = line.match(
      /^(?:เฉลย|ตอบ|คำตอบ|Answer|Ans)\s*[:=-]?\s*\(?([กขคงABCDabcd1234])\)?(?:[.)\s]+(.*))?$/i
    );
    if (ansMatch) {
      const keyChar = ansMatch[1].toLowerCase();
      if (THAI_CHOICE_MAP[keyChar] !== undefined) {
        explicitAnswerIndex = THAI_CHOICE_MAP[keyChar];
      }
      if (ansMatch[2] && ansMatch[2].trim()) {
        currentExplanation = ansMatch[2].trim();
      }
      continue;
    }

    // 2. Check if line is an Explanation line e.g. "คำอธิบาย: ..." or "เหตุผล: ..."
    const expMatch = line.match(/^(?:คำอธิบาย|อธิบาย|เหตุผล|Explanation)\s*[:=-]?\s*(.+)$/i);
    if (expMatch) {
      currentExplanation = expMatch[1].trim();
      continue;
    }

    // 3. Check if line is a Timer specification e.g. "เวลา: 30"
    const timeMatch = line.match(/^(?:เวลา|Time)\s*[:=-]?\s*(\d+)/i);
    if (timeMatch) {
      const sec = Number(timeMatch[1]);
      if (sec >= 5 && sec <= 180) currentTime = sec;
      continue;
    }

    // 4. Check if line is a Choice e.g. "ก. ...", "(ก) ...", "*ข. ...", "A) ...", "- ..."
    const choiceMatch = line.match(
      /^([*✓✔])?\s*(?:\([กขคงABCDabcd]\)|[กขคงABCDabcd][.):]|[-•])\s*(.+)$/
    );
    if (choiceMatch) {
      let rawChoiceText = choiceMatch[2].trim();
      let isMarkedCorrect = Boolean(choiceMatch[1]);

      // Check trailing markers like (ถูก), (เฉลย), *, ✓
      if (/(\(ถูก\)|\[ถูก\]|\(เฉลย\)|\(correct\)|\*|✓|✔)\s*$/i.test(rawChoiceText)) {
        isMarkedCorrect = true;
        rawChoiceText = rawChoiceText
          .replace(/(\(ถูก\)|\[ถูก\]|\(เฉลย\)|\(correct\)|\*|✓|✔)\s*$/gi, '')
          .trim();
      }

      currentChoices.push({
        text: rawChoiceText,
        isCorrect: isMarkedCorrect,
      });
      continue;
    }

    // 5. Check if line starts a new Question number e.g. "1. ...", "ข้อ 2. ...", "Q3: ..."
    const newQMatch = line.match(/^(?:ข้อที่|ข้อ|Question|Q)?\s*\d+\s*[.):-]\s*(.+)$/i);
    if (newQMatch) {
      if (currentPromptLines.length > 0 || currentChoices.length > 0) {
        flushCurrentQuestion();
      }
      currentPromptLines.push(newQMatch[1].trim());
      continue;
    }

    // 6. Otherwise, if we already have >= 4 choices, a new plain text line starts a new question!
    if (currentChoices.length >= 4) {
      flushCurrentQuestion();
      currentPromptLines.push(line);
    } else if (currentChoices.length > 0 && !line.startsWith('?')) {
      // Unprefixed choice line
      let rawChoiceText = line;
      let isMarkedCorrect = false;
      if (/(\(ถูก\)|\[ถูก\]|\(เฉลย\)|\*|✓|✔)\s*$/i.test(rawChoiceText) || rawChoiceText.startsWith('*')) {
        isMarkedCorrect = true;
        rawChoiceText = rawChoiceText
          .replace(/^\*\s*/, '')
          .replace(/(\(ถูก\)|\[ถูก\]|\(เฉลย\)|\*|✓|✔)\s*$/gi, '')
          .trim();
      }
      currentChoices.push({ text: rawChoiceText, isCorrect: isMarkedCorrect });
    } else {
      currentPromptLines.push(line);
    }
  }

  if (currentPromptLines.length > 0 || currentChoices.length > 0) {
    flushCurrentQuestion();
  }

  // Apply bulk bottom answer key map if present
  if (bulkAnswerKeyMap.size > 0) {
    bulkAnswerKeyMap.forEach((ansIdx, qIdx) => {
      const q = questions[qIdx];
      if (q && q.choices[ansIdx]) {
        q.choices = q.choices.map((c, idx) => ({
          ...c,
          is_correct: idx === ansIdx,
        }));
      }
    });
  }

  return questions;
}
