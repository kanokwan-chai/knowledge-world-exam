import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, getOrCreateGuestToken } from '../lib/supabase';
import {
  assertRateLimit,
  generateRandomExamPin,
  sanitizeText,
  validateCustomExamPin,
  validateSafeImageUrl,
  validateSafeNickname,
} from '../lib/securityGuard';
import {
  AvatarConfig,
  AvatarItem,
  Classroom,
  ClassroomStudent,
  DetailedAnswerCell,
  DetailedStudentReportRow,
  ExamSessionMode,
  GameHistoryRecord,
  GameParticipant,
  GameRoom,
  GameRoomStatus,
  LuckyBlockRollResult,
  PlayerInventoryItem,
  PlayerMission,
  PlayerPowerInstance,
  PowerCatalogItem,
  Profile,
  PublicQuestionPayload,
  Question,
  Quiz,
  RealtimeBroadcastEvent,
  RoomDetailedReport,
  ScoreRecord,
  SubmitAnswerResult,
  TeacherExamRoomSummary,
} from '../types/database';

// ============================================================================
// 1. PROFILE & AUTH HELPERS
// ============================================================================
export async function fetchUserProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateProfileDisplayName(userId: string, displayName: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: displayName.trim(), updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ============================================================================
// 2. CLASSROOM MANAGEMENT (TEACHER)
// ============================================================================
async function ensureTeacherProfileRow(teacherId: string): Promise<void> {
  const { data: existing, error: selErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', teacherId)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);
  if (existing) return;

  const { data: userData } = await supabase.auth.getUser();
  const authUser = userData?.user;
  const metaName =
    typeof authUser?.user_metadata?.display_name === 'string'
      ? authUser.user_metadata.display_name.trim()
      : '';
  const rawFallback =
    metaName ||
    (authUser?.email ? authUser.email.split('@')[0] : '') ||
    'Teacher';
  let fallbackName = rawFallback.trim().slice(0, 28).trim();
  if (fallbackName.length < 2) {
    fallbackName = 'Teacher';
  }

  const { error: insErr } = await supabase.from('profiles').insert({
    id: teacherId,
    email: authUser?.email ?? null,
    display_name: fallbackName,
    role: 'teacher',
    coins: 200,
    exp: 0,
    level: 1,
  });

  if (insErr && !insErr.message.toLowerCase().includes('duplicate')) {
    throw new Error(insErr.message);
  }
}

export async function fetchTeacherClassrooms(teacherId: string): Promise<Classroom[]> {
  const { data, error } = await supabase
    .from('classrooms')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createClassroom(
  teacherId: string,
  name: string,
  gradeLevel: string,
  description: string
): Promise<Classroom> {
  await ensureTeacherProfileRow(teacherId);
  const classCode = `KW${Math.floor(1000 + Math.random() * 9000)}`;
  const { data, error } = await supabase
    .from('classrooms')
    .insert({
      teacher_id: teacherId,
      name: name.trim(),
      grade_level: gradeLevel.trim() || 'General',
      class_code: classCode,
      description: description.trim(),
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function fetchClassroomStudents(classroomId: string): Promise<ClassroomStudent[]> {
  const { data, error } = await supabase
    .from('classroom_students')
    .select('*, profiles(*)')
    .eq('classroom_id', classroomId)
    .order('joined_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addStudentToClassroomByEmail(
  classroomId: string,
  studentEmail: string,
  studentNumber?: string
): Promise<ClassroomStudent> {
  const { data: studentProfile, error: findErr } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .ilike('email', studentEmail.trim())
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (!studentProfile) {
    throw new Error(`ไม่พบบัญชีนักเรียนที่มีอีเมล ${studentEmail}`);
  }

  const { data, error } = await supabase
    .from('classroom_students')
    .insert({
      classroom_id: classroomId,
      student_id: studentProfile.id,
      student_number: studentNumber?.trim() || null,
    })
    .select('*, profiles(*)')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ============================================================================
// 3. QUIZ & QUESTION MANAGEMENT (TEACHER)
// ============================================================================
export async function fetchTeacherQuizzes(teacherId: string): Promise<Quiz[]> {
  const { data, error } = await supabase
    .from('quizzes')
    .select('*, questions(*, answer_choices(*))')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((q: Quiz) => ({
    ...q,
    questions: (q.questions ?? []).sort((a, b) => a.sort_order - b.sort_order),
  }));
}

export async function createQuiz(
  teacherId: string,
  payload: {
    title: string;
    description: string;
    subject: string;
    game_mode: Quiz['game_mode'];
    classroom_id: string | null;
  }
): Promise<Quiz> {
  await ensureTeacherProfileRow(teacherId);
  const { data, error } = await supabase
    .from('quizzes')
    .insert({
      teacher_id: teacherId,
      title: payload.title.trim(),
      description: payload.description.trim(),
      subject: payload.subject.trim() || 'General',
      game_mode: payload.game_mode,
      classroom_id: payload.classroom_id,
      is_published: true,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return { ...data, questions: [] };
}

export async function deleteQuiz(quizId: string): Promise<void> {
  const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
  if (error) throw new Error(error.message);
}

export async function updateQuizTitle(quizId: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (trimmed.length < 2 || trimmed.length > 150) {
    throw new Error('ชื่อชุดคำถามต้องมีความยาว 2 ถึง 150 ตัวอักษร');
  }
  const { error } = await supabase
    .from('quizzes')
    .update({ title: trimmed, updated_at: new Date().toISOString() })
    .eq('id', quizId);
  if (error) throw new Error(error.message);
}

export async function updateQuizDetails(
  quizId: string,
  payload: { title: string; subject: string; description: string }
): Promise<void> {
  const trimmedTitle = payload.title.trim();
  if (trimmedTitle.length < 2 || trimmedTitle.length > 150) {
    throw new Error('ชื่อชุดคำถามต้องมีความยาว 2 ถึง 150 ตัวอักษร');
  }
  const { error } = await supabase
    .from('quizzes')
    .update({
      title: trimmedTitle,
      subject: payload.subject.trim() || 'ทั่วไป',
      description: payload.description.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', quizId);
  if (error) throw new Error(error.message);
}

export async function fetchQuizQuestionCount(quizId: string): Promise<number> {
  const { count, error } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('quiz_id', quizId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function updateGameRoomMode(
  roomId: string,
  mode: ExamSessionMode
): Promise<GameRoom> {
  const { data, error } = await supabase
    .from('game_rooms')
    .update({ game_mode: mode })
    .eq('id', roomId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as GameRoom;
}

export async function duplicateQuiz(quizId: string, teacherId: string): Promise<Quiz> {
  const { data: source, error: srcErr } = await supabase
    .from('quizzes')
    .select('*, questions(*, answer_choices(*))')
    .eq('id', quizId)
    .single();

  if (srcErr || !source) throw new Error(srcErr?.message || 'ไม่พบชุดคำถามต้นฉบับ');

  const newQuiz = await createQuiz(teacherId, {
    title: `${source.title} (สำเนา)`,
    description: source.description,
    subject: source.subject,
    game_mode: source.game_mode,
    classroom_id: source.classroom_id,
  });

  const questions: Question[] = (source.questions ?? []).sort(
    (a: Question, b: Question) => a.sort_order - b.sort_order
  );

  for (const q of questions) {
    await saveQuestionWithChoices(newQuiz.id, {
      question_type: q.question_type,
      prompt: q.prompt,
      image_url: q.image_url,
      explanation: q.explanation,
      time_limit_seconds: q.time_limit_seconds,
      base_points: q.base_points,
      speed_bonus_max: q.speed_bonus_max,
      sort_order: q.sort_order,
      choices: (q.answer_choices ?? []).map((c) => ({
        choice_label: c.choice_label,
        choice_text: c.choice_text,
        image_url: c.image_url,
        is_correct: Boolean(c.is_correct),
        sort_order: c.sort_order,
      })),
    });
  }

  const refreshed = await fetchTeacherQuizzes(teacherId);
  return refreshed.find((item) => item.id === newQuiz.id) ?? newQuiz;
}

export async function saveQuestionWithChoices(
  quizId: string,
  payload: {
    question_id?: string;
    question_type: Question['question_type'];
    prompt: string;
    image_url: string | null;
    explanation: string;
    time_limit_seconds: number;
    base_points: number;
    speed_bonus_max: number;
    sort_order: number;
    choices: Array<{
      choice_label: string;
      choice_text: string;
      image_url?: string | null;
      is_correct: boolean;
      sort_order: number;
    }>;
  }
): Promise<Question> {
  if (!payload.choices.some((c) => c.is_correct)) {
    throw new Error('ต้องกำหนดคำตอบที่ถูกต้องอย่างน้อย 1 ตัวเลือก');
  }

  let safeImageUrl: string | null = null;
  if (payload.image_url) {
    const imgCheck = validateSafeImageUrl(payload.image_url);
    if (!imgCheck.valid) {
      throw new Error(imgCheck.error || 'URL รูปภาพไม่ปลอดภัย');
    }
    safeImageUrl = imgCheck.sanitized;
  }

  const safePrompt = sanitizeText(payload.prompt, 500);
  if (!safePrompt) {
    throw new Error('กรุณากรอกโจทย์คำถาม');
  }
  const safeExplanation = sanitizeText(payload.explanation, 500);

  const normalizedChoices = payload.choices.map((c, idx) => {
    const label = sanitizeText(c.choice_label || ['A', 'B', 'C', 'D'][idx] || 'A', 4) || 'A';
    const text = sanitizeText(c.choice_text, 200) || `ตัวเลือก ${label}`;
    return {
      ...c,
      choice_label: label,
      choice_text: text,
      sort_order: idx,
    };
  });

  if (!normalizedChoices.some((c) => c.is_correct)) {
    throw new Error('ต้องกำหนดคำตอบที่ถูกต้องอย่างน้อย 1 ตัวเลือก');
  }

  let questionId = payload.question_id;

  if (questionId) {
    const { error: updErr } = await supabase
      .from('questions')
      .update({
        question_type: payload.question_type,
        prompt: safePrompt,
        image_url: safeImageUrl,
        explanation: safeExplanation,
        time_limit_seconds: payload.time_limit_seconds,
        base_points: payload.base_points,
        speed_bonus_max: payload.speed_bonus_max,
        sort_order: payload.sort_order,
      })
      .eq('id', questionId);

    if (updErr) throw new Error(updErr.message);
    await supabase.from('answer_choices').delete().eq('question_id', questionId);
  } else {
    const { data: maxRow, error: maxErr } = await supabase
      .from('questions')
      .select('sort_order')
      .eq('quiz_id', quizId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxErr) throw new Error(maxErr.message);
    const safeSortOrder = (maxRow?.sort_order ?? -1) + 1;

    const { data: qData, error: insErr } = await supabase
      .from('questions')
      .insert({
        quiz_id: quizId,
        question_type: payload.question_type,
        prompt: safePrompt,
        image_url: safeImageUrl,
        explanation: safeExplanation,
        time_limit_seconds: payload.time_limit_seconds,
        base_points: payload.base_points,
        speed_bonus_max: payload.speed_bonus_max,
        sort_order: safeSortOrder,
      })
      .select('*')
      .single();

    if (insErr) throw new Error(insErr.message);
    questionId = qData.id;
  }

  const choicesToInsert = normalizedChoices.map((c, idx) => ({
    question_id: questionId!,
    choice_label: c.choice_label,
    choice_text: c.choice_text,
    image_url: c.image_url || null,
    is_correct: c.is_correct,
    sort_order: idx,
  }));

  const { error: choiceErr } = await supabase.from('answer_choices').insert(choicesToInsert);
  if (choiceErr) throw new Error(choiceErr.message);

  const { data: fullQ, error: fetchErr } = await supabase
    .from('questions')
    .select('*, answer_choices(*)')
    .eq('id', questionId!)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);
  return fullQ;
}

export async function swapQuestionSortOrder(
  questionAId: string,
  orderA: number,
  questionBId: string,
  orderB: number
): Promise<void> {
  const { error: e1 } = await supabase
    .from('questions')
    .update({ sort_order: -999999 })
    .eq('id', questionAId);
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await supabase
    .from('questions')
    .update({ sort_order: orderA })
    .eq('id', questionBId);
  if (e2) throw new Error(e2.message);

  const { error: e3 } = await supabase
    .from('questions')
    .update({ sort_order: orderB })
    .eq('id', questionAId);
  if (e3) throw new Error(e3.message);
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const { error } = await supabase.from('questions').delete().eq('id', questionId);
  if (error) throw new Error(error.message);
}

async function compressImageFileToDataUrl(file: File): Promise<string> {
  const readRawDataUrl = () =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
        }
      };
      reader.onerror = () => reject(new Error('อ่านไฟล์รูปภาพไม่สำเร็จ'));
      reader.readAsDataURL(file);
    });

  const rawDataUrl = await readRawDataUrl();
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return rawDataUrl;
  }

  return await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxWidth = 1200;
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const targetW = Math.max(1, Math.round(img.width * scale));
      const targetH = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

export async function uploadQuestionImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'png';
  const filePath = `quiz-media/${Date.now()}_${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from('knowledge-world-assets').upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (!error) {
    const { data } = supabase.storage.from('knowledge-world-assets').getPublicUrl(filePath);
    return data.publicUrl;
  }

  // Automatic fallback: Compress & convert image to lightweight JPEG Base64 Data URL
  return compressImageFileToDataUrl(file);
}

export async function updateQuestionImageOnly(
  questionId: string,
  imageUrl: string | null
): Promise<void> {
  if (imageUrl) {
    const check = validateSafeImageUrl(imageUrl);
    if (!check.valid) throw new Error(check.error || 'รูปภาพไม่ถูกต้อง');
  }
  const { error } = await supabase
    .from('questions')
    .update({ image_url: imageUrl, question_type: imageUrl ? 'image_quiz' : 'multiple_choice' })
    .eq('id', questionId);
  if (error) throw new Error(error.message);
}

// ============================================================================
// 4. REAL-TIME MULTIPLAYER GAME ROOM ENGINE (SERVER-AUTHORITATIVE)
// ============================================================================
async function releaseFinishedRoomPinIfOwned(
  normalizedPin: string,
  excludeRoomId?: string
): Promise<void> {
  const { data: existing, error: selErr } = await supabase
    .from('game_rooms')
    .select('id, status, host_teacher_id')
    .eq('pin_code', normalizedPin)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);
  if (!existing || existing.id === excludeRoomId) return;

  if (existing.status !== 'finished') {
    throw new Error(
      `รหัสข้อสอบ ${normalizedPin} กำลังถูกใช้งานอยู่ในห้องสอบอื่น กรุณาเลือกเลข 6 หลักอื่น`
    );
  }

  // Attempt to free a finished room's PIN by reassigning a random PIN (succeeds if owned by current teacher)
  const { data: released, error: updErr } = await supabase
    .from('game_rooms')
    .update({ pin_code: generateRandomExamPin() })
    .eq('id', existing.id)
    .select('id')
    .maybeSingle();

  if (updErr || !released) {
    throw new Error(`รหัสข้อสอบ ${normalizedPin} ถูกใช้งานแล้ว กรุณาเลือกเลข 6 หลักอื่น`);
  }
}

export async function updateGameRoomPin(roomId: string, rawPin: string): Promise<GameRoom> {
  const check = validateCustomExamPin(rawPin);
  if (!check.valid || !check.normalized) {
    throw new Error(
      check.error || 'รหัสข้อสอบ (Exam PIN) ต้องเป็นตัวเลข 6 หลัก เช่น 123456'
    );
  }

  await releaseFinishedRoomPinIfOwned(check.normalized, roomId);

  const { data, error } = await supabase
    .from('game_rooms')
    .update({ pin_code: check.normalized })
    .eq('id', roomId)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505' || error.message.toLowerCase().includes('duplicate')) {
      throw new Error(`รหัสข้อสอบ ${check.normalized} ถูกใช้งานไปแล้ว กรุณาเลือกเลข 6 หลักอื่น`);
    }
    throw new Error(error.message);
  }
  return data as GameRoom;
}

export async function createGameRoomRPC(
  quizId: string,
  classroomId: string | null = null,
  gameMode: string = 'adventure_standard',
  allowGuest: boolean = true,
  customPin?: string
): Promise<GameRoom> {
  let normalizedPin = '';
  if (customPin && customPin.trim()) {
    const check = validateCustomExamPin(customPin);
    if (!check.valid) {
      throw new Error(check.error || 'รหัสข้อสอบไม่ถูกต้อง');
    }
    normalizedPin = check.normalized;
    if (normalizedPin) {
      await releaseFinishedRoomPinIfOwned(normalizedPin);
    }
  }

  const { data, error } = await supabase.rpc('create_game_room', {
    p_quiz_id: quizId,
    p_classroom_id: classroomId,
    p_game_mode: gameMode,
    p_allow_guest: allowGuest,
  });

  if (error) throw new Error(error.message);
  const createdRoom = data as GameRoom;

  if (normalizedPin && createdRoom.pin_code !== normalizedPin) {
    try {
      return await updateGameRoomPin(createdRoom.id, normalizedPin);
    } catch (pinErr) {
      await supabase.from('game_rooms').delete().eq('id', createdRoom.id);
      throw pinErr;
    }
  }

  return createdRoom;
}

export async function joinGameRoomRPC(
  pinCode: string,
  nickname: string,
  avatarConfig: AvatarConfig
): Promise<GameParticipant> {
  assertRateLimit('join_game_room', 6, 20000);
  const nickCheck = validateSafeNickname(nickname);
  if (!nickCheck.valid) {
    throw new Error(nickCheck.error || 'ชื่อผู้เล่นไม่ถูกต้อง');
  }

  const guestToken = getOrCreateGuestToken();
  const { data, error } = await supabase.rpc('join_game_room', {
    p_pin_code: sanitizeText(pinCode, 6),
    p_nickname: nickCheck.sanitized,
    p_avatar_config: avatarConfig,
    p_guest_token: guestToken,
  });

  if (error) throw new Error(error.message);
  return data as GameParticipant;
}

export async function fetchGameRoomById(roomId: string): Promise<GameRoom | null> {
  const { data, error } = await supabase
    .from('game_rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function fetchGameRoomByPin(pinCode: string): Promise<GameRoom | null> {
  const { data, error } = await supabase
    .from('game_rooms')
    .select('*')
    .eq('pin_code', pinCode.trim())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function fetchRoomParticipants(roomId: string): Promise<GameParticipant[]> {
  const [partRes, ansRes] = await Promise.all([
    supabase
      .from('game_participants')
      .select('*')
      .eq('room_id', roomId),
    supabase
      .from('game_answers')
      .select('*')
      .eq('room_id', roomId),
  ]);

  if (partRes.error) throw new Error(partRes.error.message);

  // Aggregate authoritative scores from game_answers so Podium & Audit Table ALWAYS match 100% (including after pardon!)
  const aggByParticipant = new Map<
    string,
    { correct: number; points: number; responseMs: number }
  >();

  if (!ansRes.error && ansRes.data) {
    for (const a of ansRes.data as Array<{
      participant_id: string;
      is_correct: boolean;
      total_points_awarded?: number;
      response_time_ms?: number;
    }>) {
      const cur = aggByParticipant.get(a.participant_id) || {
        correct: 0,
        points: 0,
        responseMs: 0,
      };
      if (a.is_correct) {
        cur.correct += 1;
        cur.points += Number(a.total_points_awarded || 1000);
      } else {
        cur.points += Number(a.total_points_awarded || 0);
      }
      cur.responseMs += Number(a.response_time_ms || 0);
      aggByParticipant.set(a.participant_id, cur);
    }
  }

  const normalized: GameParticipant[] = ((partRes.data ?? []) as GameParticipant[]).map((p) => {
    if (p.is_disqualified) {
      return { ...p, correct_count: 0, current_score: 0 };
    }
    const agg = aggByParticipant.get(p.id);
    if (!agg) return p;
    const restoredCorrect = Math.max(p.correct_count || 0, agg.correct);
    const restoredScore = Math.max(
      p.current_score || 0,
      agg.points > 0 ? agg.points : restoredCorrect * 1000
    );
    return {
      ...p,
      correct_count: restoredCorrect,
      current_score: restoredScore,
      total_response_ms: p.total_response_ms > 0 ? p.total_response_ms : agg.responseMs,
    };
  });

  // Deterministic Podium ranking: non-disqualified first -> current_score DESC -> correct_count DESC -> total_response_ms ASC
  normalized.sort((a, b) => {
    const dqDiff = Number(Boolean(a.is_disqualified)) - Number(Boolean(b.is_disqualified));
    if (dqDiff !== 0) return dqDiff;
    if (b.current_score !== a.current_score) return b.current_score - a.current_score;
    if (b.correct_count !== a.correct_count) return b.correct_count - a.correct_count;
    return (a.total_response_ms || 0) - (b.total_response_ms || 0);
  });

  return normalized;
}

export async function getPublicQuestionPayloadRPC(
  roomId: string,
  questionIndex?: number
): Promise<PublicQuestionPayload | null> {
  const { data, error } = await supabase.rpc('get_public_question_payload', {
    p_room_id: roomId,
    p_question_index: questionIndex ?? null,
  });

  if (error) throw new Error(error.message);
  return data as PublicQuestionPayload | null;
}

export async function advanceGameQuestionRPC(roomId: string, nextIndex: number): Promise<GameRoom> {
  const { data, error } = await supabase.rpc('advance_game_question', {
    p_room_id: roomId,
    p_next_index: nextIndex,
  });

  if (error) throw new Error(error.message);
  return data as GameRoom;
}

export async function updateRoomStatus(roomId: string, status: GameRoomStatus): Promise<GameRoom> {
  const { data, error } = await supabase
    .from('game_rooms')
    .update({ status })
    .eq('id', roomId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function submitGameAnswerRPC(params: {
  roomId: string;
  questionId: string;
  participantId: string;
  choiceId?: string | null;
  textAnswer?: string | null;
}): Promise<SubmitAnswerResult> {
  assertRateLimit(`submit_answer_${params.questionId}`, 2, 10000);
  const { data, error } = await supabase.rpc('submit_game_answer', {
    p_room_id: params.roomId,
    p_question_id: params.questionId,
    p_participant_id: params.participantId,
    p_choice_id: params.choiceId ?? null,
    p_text_answer: params.textAnswer ? sanitizeText(params.textAnswer, 120) : null,
  });

  if (error) throw new Error(error.message);
  return data as SubmitAnswerResult;
}

export async function fetchQuestionAnswersForHost(roomId: string, questionId: string) {
  const { data, error } = await supabase
    .from('game_answers')
    .select('*')
    .eq('room_id', roomId)
    .eq('question_id', questionId);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function finalizeGameRoomRPC(roomId: string): Promise<{ status: string; ranked_players: number }> {
  const { data, error } = await supabase.rpc('finalize_game_room', {
    p_room_id: roomId,
  });

  if (error) throw new Error(error.message);
  return data;
}

export async function disqualifyParticipantRPC(
  roomId: string,
  participantId: string,
  reason: string
): Promise<GameParticipant> {
  const { data, error } = await supabase.rpc('disqualify_participant', {
    p_room_id: roomId,
    p_participant_id: participantId,
    p_reason: sanitizeText(reason, 200),
  });

  if (error) throw new Error(error.message);
  return data as GameParticipant;
}

export async function pardonParticipantRPC(
  roomId: string,
  participantId: string
): Promise<GameParticipant> {
  const { data, error } = await supabase.rpc('pardon_participant', {
    p_room_id: roomId,
    p_participant_id: participantId,
  });

  if (error) throw new Error(error.message);
  return data as GameParticipant;
}

// ============================================================================
// 5. REALTIME BROADCAST & PRESENCE SUBSCRIPTION MANAGER
// ============================================================================
export function subscribeToGameRoomRealtime(
  roomId: string,
  participantMeta: { id: string; nickname: string; role: 'teacher' | 'student' },
  handlers: {
    onRoomUpdated?: (room: GameRoom) => void;
    onParticipantsChanged?: () => void;
    onAnswerCountChanged?: () => void;
    onBroadcastEvent?: (event: RealtimeBroadcastEvent) => void;
    onPresenceSync?: (onlineIds: string[]) => void;
    onConnectionStatusChange?: (status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => void;
  }
): {
  channel: RealtimeChannel;
  broadcast: (event: RealtimeBroadcastEvent) => Promise<void>;
  unsubscribe: () => void;
} {
  const channel = supabase.channel(`kw_room_${roomId}`, {
    config: {
      presence: { key: participantMeta.id },
      broadcast: { self: true },
    },
  });

  // 1. Postgres Changes on game_rooms
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` },
    (payload) => {
      if (payload.new && handlers.onRoomUpdated) {
        handlers.onRoomUpdated(payload.new as GameRoom);
      }
    }
  );

  // 2. Postgres Changes on game_participants
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'game_participants', filter: `room_id=eq.${roomId}` },
    () => {
      handlers.onParticipantsChanged?.();
    }
  );

  // 3. Postgres Changes on game_answers
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'game_answers', filter: `room_id=eq.${roomId}` },
    () => {
      handlers.onAnswerCountChanged?.();
    }
  );

  // 4. Low-latency Broadcast events
  channel.on('broadcast', { event: 'game_event' }, ({ payload }) => {
    if (payload && handlers.onBroadcastEvent) {
      handlers.onBroadcastEvent(payload as RealtimeBroadcastEvent);
    }
  });

  // 5. Presence tracking
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    const onlineIds = Object.keys(state);
    handlers.onPresenceSync?.(onlineIds);
  });

  channel.subscribe(async (status) => {
    handlers.onConnectionStatusChange?.(status);
    if (status === 'SUBSCRIBED') {
      await channel.track({
        id: participantMeta.id,
        nickname: participantMeta.nickname,
        role: participantMeta.role,
        online_at: new Date().toISOString(),
      });
    }
  });

  const broadcast = async (event: RealtimeBroadcastEvent) => {
    await channel.send({
      type: 'broadcast',
      event: 'game_event',
      payload: event,
    });
  };

  const unsubscribe = () => {
    supabase.removeChannel(channel);
  };

  return { channel, broadcast, unsubscribe };
}

// ============================================================================
// 6. RPG POWERS, LUCKY BLOCK, AVATAR & SHOP SERVICES
// ============================================================================
export async function fetchParticipantPowers(participantId: string): Promise<PlayerPowerInstance[]> {
  const { data, error } = await supabase
    .from('player_powers')
    .select('*, powers(*)')
    .eq('participant_id', participantId)
    .order('obtained_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function activatePlayerPowerRPC(
  roomId: string,
  participantId: string,
  playerPowerId: string
): Promise<{ activated: boolean; power_type: string; name: string; cooldown_seconds: number }> {
  const { data, error } = await supabase.rpc('use_player_power', {
    p_room_id: roomId,
    p_participant_id: participantId,
    p_player_power_id: playerPowerId,
  });

  if (error) throw new Error(error.message);
  return data;
}

export async function fetchPowersCatalog(): Promise<PowerCatalogItem[]> {
  const { data, error } = await supabase
    .from('powers')
    .select('*')
    .order('drop_weight', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function rollLuckyBlockRPC(claimToken: string, roomId?: string): Promise<LuckyBlockRollResult> {
  assertRateLimit('roll_lucky_block', 4, 15000);
  const { data, error } = await supabase.rpc('roll_lucky_block', {
    p_claim_token: sanitizeText(claimToken, 80),
    p_room_id: roomId ?? null,
  });

  if (error) throw new Error(error.message);
  return data as LuckyBlockRollResult;
}

export async function fetchAvatarItemsCatalog(): Promise<AvatarItem[]> {
  const { data, error } = await supabase
    .from('avatar_items')
    .select('*')
    .order('required_level', { ascending: true })
    .order('price_coins', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchPlayerInventory(profileId: string): Promise<PlayerInventoryItem[]> {
  const { data, error } = await supabase
    .from('player_inventory')
    .select('*, avatar_items(*)')
    .eq('profile_id', profileId);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function savePlayerAvatarCustomization(
  profileId: string,
  avatarName: string,
  config: AvatarConfig
): Promise<void> {
  const { error } = await supabase
    .from('avatars')
    .upsert(
      {
        profile_id: profileId,
        avatar_name: avatarName.trim(),
        base_character_code: config.base,
        hair_code: config.hair,
        outfit_code: config.outfit,
        hat_code: config.hat,
        accessory_code: config.accessory,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id' }
    );

  if (error) throw new Error(error.message);
}

export async function fetchPlayerAvatar(profileId: string): Promise<{ avatar_name: string; config: AvatarConfig } | null> {
  const { data, error } = await supabase
    .from('avatars')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    avatar_name: data.avatar_name,
    config: {
      base: data.base_character_code,
      hair: data.hair_code,
      outfit: data.outfit_code,
      hat: data.hat_code,
      accessory: data.accessory_code,
    },
  };
}

export async function purchaseAvatarItemRPC(itemId: string): Promise<{
  purchased: boolean;
  item_code: string;
  remaining_coins: number;
}> {
  const { data, error } = await supabase.rpc('purchase_avatar_item', {
    p_item_id: itemId,
  });

  if (error) throw new Error(error.message);
  return data;
}

// ============================================================================
// 7. LEADERBOARDS, MISSIONS, ACHIEVEMENTS, HISTORY & CSV REPORT EXPORT
// ============================================================================
export async function fetchGlobalLeaderboard(limit = 20): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'student')
    .order('total_score', { ascending: false })
    .order('level', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchClassroomLeaderboard(classroomId: string): Promise<ScoreRecord[]> {
  const { data, error } = await supabase
    .from('scores')
    .select('*, game_participants(nickname, avatar_config)')
    .eq('classroom_id', classroomId)
    .order('total_score', { ascending: false })
    .order('correct_answers', { ascending: false })
    .order('avg_response_ms', { ascending: true })
    .limit(50);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchStudentMissions(profileId: string): Promise<PlayerMission[]> {
  const { data, error } = await supabase
    .from('player_missions')
    .select('*, missions(*)')
    .eq('profile_id', profileId);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchTeacherGameHistory(teacherId: string): Promise<GameHistoryRecord[]> {
  const { data, error } = await supabase
    .from('game_history')
    .select('*, quizzes(title, subject)')
    .eq('teacher_id', teacherId)
    .order('ended_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchTeacherExamRooms(teacherId: string): Promise<TeacherExamRoomSummary[]> {
  const { data: rooms, error } = await supabase
    .from('game_rooms')
    .select('id, pin_code, quiz_id, game_mode, status, created_at, started_at, ended_at, quizzes(title, subject)')
    .eq('host_teacher_id', teacherId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  const roomList = (rooms ?? []) as unknown as Array<Omit<TeacherExamRoomSummary, 'participant_count'>>;
  if (roomList.length === 0) return [];

  const roomIds = roomList.map((r) => r.id);
  const { data: parts } = await supabase
    .from('game_participants')
    .select('room_id')
    .in('room_id', roomIds);

  const countMap = new Map<string, number>();
  for (const p of parts ?? []) {
    countMap.set(p.room_id, (countMap.get(p.room_id) ?? 0) + 1);
  }

  return roomList.map((r) => ({
    ...r,
    participant_count: countMap.get(r.id) ?? 0,
  }));
}

export async function fetchRoomDetailedReport(roomId: string): Promise<RoomDetailedReport> {
  const room = await fetchGameRoomById(roomId);
  if (!room) throw new Error('ไม่พบห้องสอบนี้');

  const [{ data: quizData, error: qErr }, participants, { data: answersData, error: aErr }] =
    await Promise.all([
      supabase
        .from('quizzes')
        .select('id, title, subject, questions(*, answer_choices(*))')
        .eq('id', room.quiz_id)
        .single(),
      fetchRoomParticipants(roomId),
      supabase
        .from('game_answers')
        .select('question_id, participant_id, selected_choice_id, text_answer, is_correct, response_time_ms')
        .eq('room_id', roomId),
    ]);

  if (qErr) throw new Error(qErr.message);
  if (aErr) throw new Error(aErr.message);

  const questions: Question[] = ((quizData?.questions ?? []) as Question[]).sort(
    (a, b) => a.sort_order - b.sort_order
  );

  type RawAns = {
    question_id: string;
    participant_id: string;
    selected_choice_id: string | null;
    text_answer: string | null;
    is_correct: boolean;
    response_time_ms: number;
  };
  const answerMap = new Map<string, RawAns>();
  for (const ans of (answersData ?? []) as RawAns[]) {
    answerMap.set(`${ans.participant_id}_${ans.question_id}`, ans);
  }

  const rows: DetailedStudentReportRow[] = participants.map((p) => {
    let realScore = 0;
    let answeredCount = 0;

    const cells: DetailedAnswerCell[] = questions.map((q, idx) => {
      const choices = (q.answer_choices ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
      const correctChoice = choices.find((c) => c.is_correct);
      const correctText = correctChoice
        ? `${correctChoice.choice_label}. ${correctChoice.choice_text}`
        : '-';

      const ans = answerMap.get(`${p.id}_${q.id}`);
      if (!ans) {
        return {
          question_id: q.id,
          question_number: idx + 1,
          prompt: q.prompt,
          selected_text: 'ไม่ได้ตอบ (หมดเวลา)',
          correct_text: correctText,
          is_correct: false,
          unanswered: true,
          response_time_ms: 0,
        };
      }

      answeredCount += 1;
      if (ans.is_correct) realScore += 1;

      const selectedChoice = choices.find((c) => c.id === ans.selected_choice_id);
      const selectedText = selectedChoice
        ? `${selectedChoice.choice_label}. ${selectedChoice.choice_text}`
        : ans.text_answer || '-';

      return {
        question_id: q.id,
        question_number: idx + 1,
        prompt: q.prompt,
        selected_text: selectedText,
        correct_text: correctText,
        is_correct: Boolean(ans.is_correct),
        unanswered: false,
        response_time_ms: ans.response_time_ms ?? 0,
      };
    });

    const restoredExp = p.is_disqualified
      ? 0
      : Math.max(p.current_score || 0, realScore * 1000);

    return {
      participant: {
        ...p,
        correct_count: p.is_disqualified ? 0 : Math.max(p.correct_count || 0, realScore),
        current_score: restoredExp,
      },
      real_exam_score: p.is_disqualified ? 0 : realScore,
      total_questions: questions.length,
      game_exp_score: restoredExp,
      answered_count: answeredCount,
      cells,
    };
  });

  rows.sort((a, b) => {
    if (Boolean(a.participant.is_disqualified) !== Boolean(b.participant.is_disqualified)) {
      return a.participant.is_disqualified ? 1 : -1;
    }
    if (b.real_exam_score !== a.real_exam_score) return b.real_exam_score - a.real_exam_score;
    return b.game_exp_score - a.game_exp_score;
  });

  return {
    room,
    quiz_title: quizData?.title || 'แบบทดสอบ Knowledge World',
    quiz_subject: quizData?.subject || 'ทั่วไป',
    questions,
    rows,
  };
}

function escapeExcelHtml(val: string): string {
  return (val || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function exportDetailedRoomReportExcel(report: RoomDetailedReport): void {
  const qHeaders = report.questions
    .map((_, idx) => `<th style="background:#FFD93D;border:1px solid #000;padding:6px;">ข้อ ${idx + 1}</th>`)
    .join('');

  const bodyRows = report.rows
    .map((row, idx) => {
      const cellsHtml = row.cells
        .map((c) => {
          if (row.participant.is_disqualified) {
            return `<td style="border:1px solid #000;text-align:center;background:#fee2e2;color:#991b1b;">0 (ทุจริต)</td>`;
          }
          if (c.unanswered) {
            return `<td style="border:1px solid #000;text-align:center;color:#64748b;">ไม่ตอบ (0)</td>`;
          }
          return c.is_correct
            ? `<td style="border:1px solid #000;text-align:center;background:#dcfce7;color:#166534;font-weight:bold;">ถูก (1)</td>`
            : `<td style="border:1px solid #000;text-align:center;background:#fee2e2;color:#991b1b;">ผิด (0)</td>`;
        })
        .join('');

      const statusText = row.participant.is_disqualified
        ? `ปรับทุจริต (${escapeExcelHtml(row.participant.disqualified_reason || 'สลับหน้าจอ')})`
        : 'ปกติ';

      return `<tr>
        <td style="border:1px solid #000;text-align:center;">${idx + 1}</td>
        <td style="border:1px solid #000;padding:6px;font-weight:bold;">${escapeExcelHtml(row.participant.nickname)}</td>
        <td style="border:1px solid #000;padding:6px;">${statusText}</td>
        ${cellsHtml}
        <td style="border:1px solid #000;text-align:center;font-weight:bold;background:#d1fae5;">${row.real_exam_score} / ${row.total_questions}</td>
        <td style="border:1px solid #000;text-align:center;">${row.game_exp_score}</td>
      </tr>`;
    })
    .join('');

  const detailRows = report.rows
    .flatMap((row) =>
      row.cells.map(
        (c) => `<tr>
          <td style="border:1px solid #000;padding:4px;">${escapeExcelHtml(row.participant.nickname)}</td>
          <td style="border:1px solid #000;text-align:center;">ข้อ ${c.question_number}</td>
          <td style="border:1px solid #000;padding:4px;">${escapeExcelHtml(c.prompt)}</td>
          <td style="border:1px solid #000;padding:4px;">${escapeExcelHtml(c.selected_text)}</td>
          <td style="border:1px solid #000;padding:4px;">${escapeExcelHtml(c.correct_text)}</td>
          <td style="border:1px solid #000;text-align:center;">${c.unanswered ? 'ไม่ได้ตอบ' : c.is_correct ? 'ถูก (+1)' : 'ผิด (0)'}</td>
        </tr>`
      )
    )
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>
    <h2>รายงานผลคะแนนรายข้อ: ${escapeExcelHtml(report.quiz_title)} (PIN: ${report.room.pin_code})</h2>
    <p>โหมด: ${report.room.game_mode === 'serious_exam' ? 'สอบวัดความรู้จริง' : 'กิจกรรมเก็บคะแนนสั้นๆ'} | เวลาส่งออก: ${new Date().toLocaleString('th-TH')}</p>
    <table style="border-collapse:collapse;font-family:Tahoma,sans-serif;font-size:12px;">
      <thead>
        <tr>
          <th style="background:#0f172a;color:#fff;border:1px solid #000;padding:6px;">อันดับ</th>
          <th style="background:#0f172a;color:#fff;border:1px solid #000;padding:6px;">ชื่อ-รหัส 3 ตัวหลัง</th>
          <th style="background:#0f172a;color:#fff;border:1px solid #000;padding:6px;">สถานะ</th>
          ${qHeaders}
          <th style="background:#16a34a;color:#fff;border:1px solid #000;padding:6px;">คะแนนสอบจริง</th>
          <th style="background:#2563eb;color:#fff;border:1px solid #000;padding:6px;">EXP กิจกรรม</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <br/>
    <h3>รายละเอียดคำตอบที่เลือก vs เฉลย (ตรวจความถูกต้องรายข้อทุกคน)</h3>
    <table style="border-collapse:collapse;font-family:Tahoma,sans-serif;font-size:12px;">
      <thead>
        <tr>
          <th style="background:#334155;color:#fff;border:1px solid #000;padding:6px;">นักเรียน</th>
          <th style="background:#334155;color:#fff;border:1px solid #000;padding:6px;">ข้อที่</th>
          <th style="background:#334155;color:#fff;border:1px solid #000;padding:6px;">โจทย์</th>
          <th style="background:#334155;color:#fff;border:1px solid #000;padding:6px;">คำตอบที่เด็กเลือก</th>
          <th style="background:#334155;color:#fff;border:1px solid #000;padding:6px;">เฉลยที่ถูกต้อง</th>
          <th style="background:#334155;color:#fff;border:1px solid #000;padding:6px;">ผลตรวจ</th>
        </tr>
      </thead>
      <tbody>${detailRows}</tbody>
    </table>
  </body></html>`;

  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute(
    'download',
    `ExamReport_${report.quiz_title.replace(/\s+/g, '_')}_PIN${report.room.pin_code}.xls`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportDetailedRoomReportCSV(report: RoomDetailedReport): void {
  const headers = [
    'อันดับ',
    'ชื่อ-เลข 3 ตัวหลัง',
    'สถานะ',
    ...report.questions.map((_, i) => `ข้อ ${i + 1}`),
    'คะแนนสอบจริง',
    'คะแนนเต็ม',
    'EXP กิจกรรม',
  ];

  const rows = report.rows.map((r, idx) => [
    idx + 1,
    `"${r.participant.nickname.replace(/"/g, '""')}"`,
    r.participant.is_disqualified ? '"ทุจริต (0 คะแนน)"' : '"ปกติ"',
    ...r.cells.map((c) =>
      r.participant.is_disqualified ? 0 : c.unanswered ? 'ไม่ตอบ' : c.is_correct ? 1 : 0
    ),
    r.real_exam_score,
    r.total_questions,
    r.game_exp_score,
  ]);

  const csvContent =
    '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute(
    'download',
    `ExamReport_${report.quiz_title.replace(/\s+/g, '_')}_PIN${report.room.pin_code}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function fetchStudentScoresHistory(profileId: string): Promise<ScoreRecord[]> {
  const { data, error } = await supabase
    .from('scores')
    .select('*, game_participants(nickname, avatar_config)')
    .eq('profile_id', profileId)
    .order('recorded_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchRoomScoreReport(roomId: string): Promise<ScoreRecord[]> {
  const { data, error } = await supabase
    .from('scores')
    .select('*, game_participants(nickname, avatar_config)')
    .eq('room_id', roomId)
    .order('final_rank', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export function exportScoresToCSV(scores: ScoreRecord[], quizTitle: string): void {
  const headers = [
    'อันดับ (Rank)',
    'ชื่อผู้เข้าสอบ (Student Name)',
    'สถานะการสอบ (Exam Status)',
    'คะแนนสอบจริง (ข้อละ 1 คะแนน)',
    'จำนวนข้อทั้งหมด',
    'ความแม่นยำ (%)',
    'คะแนนเกมสะสมเพื่ออัปเลเวล (Game EXP Points)',
    'เวลาตอบเฉลี่ย (ms)',
    'เหรียญที่ได้รับ (Coins)',
    'EXP ที่ได้รับ',
    'เวลาบันทึกผล',
  ];

  const rows = scores.map((s, idx) => [
    s.final_rank ?? idx + 1,
    `"${(s.game_participants?.nickname || 'Player').replace(/"/g, '""')}"`,
    s.is_disqualified
      ? `"ปรับทุจริต 0 คะแนน (${(s.disqualified_reason || 'สลับหน้าจอ').replace(/"/g, '""')})"`
      : '"ปกติ (ผ่านเกณฑ์ห้องสอบ)"',
    s.is_disqualified ? 0 : s.correct_answers,
    s.total_questions,
    s.is_disqualified ? 0 : s.accuracy_percent,
    s.is_disqualified ? 0 : s.total_score,
    s.avg_response_ms,
    s.coins_earned,
    s.exp_earned,
    s.recorded_at,
  ]);

  const csvContent =
    '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `KnowledgeWorld_Report_${quizTitle.replace(/\s+/g, '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


// ============================================================================
// TEACHER STUDENT DIRECTORY & CROSS-STAGE ACTIVITY TRACKER
// ============================================================================

export interface TeacherStudentSessionRecord {
  room_id: string;
  pin_code: string;
  quiz_title: string;
  game_mode: string;
  joined_at: string;
  real_exam_score: number;
  game_exp_score: number;
  is_disqualified: boolean;
  disqualified_reason: string | null;
}

export interface TeacherStudentActivitySummary {
  identity_key: string;
  display_name: string;
  avatar_config: AvatarConfig;
  wallet_coins: number;
  level: number;
  total_accumulated_exp: number;
  owned_items_count: number;
  total_sessions: number;
  serious_exam_count: number;
  activity_game_count: number;
  total_real_exam_correct: number;
  disqualified_count: number;
  last_active_at: string;
  sessions: TeacherStudentSessionRecord[];
}

function normalizeNicknameKey(nickname: string): string {
  const cleaned = (nickname || '').trim().replace(/\s+/g, ' ');
  const m = cleaned.match(/^(.+?)\s*\(#(\d{3})\)$/);
  if (m) return `${m[1].trim().toLowerCase()}#${m[2]}`;
  return cleaned.toLowerCase();
}

export async function fetchTeacherStudentDirectory(teacherId: string): Promise<{
  students: TeacherStudentActivitySummary[];
  cloudTableReady: boolean;
}> {
  const { data: rooms, error: roomErr } = await supabase
    .from('game_rooms')
    .select('id, pin_code, game_mode, created_at, quizzes(title, subject)')
    .eq('host_teacher_id', teacherId)
    .order('created_at', { ascending: false })
    .limit(150);

  if (roomErr) throw new Error(roomErr.message);

  const roomList = (rooms ?? []) as unknown as Array<{
    id: string;
    pin_code: string;
    game_mode: string;
    created_at: string;
    quizzes?: { title: string; subject: string } | null;
  }>;

  const roomMap = new Map(roomList.map((r) => [r.id, r]));
  const roomIds = roomList.map((r) => r.id);

  let participants: GameParticipant[] = [];
  if (roomIds.length > 0) {
    const { data: partsData } = await supabase
      .from('game_participants')
      .select('*')
      .in('room_id', roomIds)
      .order('joined_at', { ascending: false });
    participants = (partsData ?? []) as GameParticipant[];
  }

  // Also check Supabase Cloud Student Vault (`student_identities`) if migration 004 has been applied
  let cloudTableReady = false;
  const cloudMap = new Map<
    string,
    {
      identity_key: string;
      display_identity: string;
      avatar_config: AvatarConfig;
      wallet_coins: number;
      total_accumulated_exp: number;
      level: number;
      owned_item_codes: string[];
      last_seen_at: string;
    }
  >();

  try {
    const { data: cloudRows, error: cloudErr } = await supabase
      .from('student_identities')
      .select('*')
      .order('last_seen_at', { ascending: false })
      .limit(300);

    if (!cloudErr && cloudRows) {
      cloudTableReady = true;
      for (const r of cloudRows as Array<Record<string, unknown>>) {
        const key = String(r.identity_key || '').toLowerCase();
        if (!key) continue;
        cloudMap.set(key, {
          identity_key: key,
          display_identity: String(r.display_identity || key),
          avatar_config: (r.avatar_config as AvatarConfig) || {
            gender: 'female',
            face: 'face_hero',
            base: 'explorer_red',
            hair: 'wavy_crimson',
            outfit: 'dress_princess',
            hat: 'bow_ribbon',
            accessory: 'star_badge',
          },
          wallet_coins: Number(r.wallet_coins ?? 0),
          total_accumulated_exp: Number(r.total_accumulated_exp ?? 0),
          level: Number(r.level ?? 1),
          owned_item_codes: Array.isArray(r.owned_item_codes)
            ? (r.owned_item_codes as string[])
            : [],
          last_seen_at: String(r.last_seen_at || new Date().toISOString()),
        });
      }
    }
  } catch {
    cloudTableReady = false;
  }

  const studentMap = new Map<string, TeacherStudentActivitySummary>();

  // 1) Seed from cloud profiles so even students who customized avatar before joining appear
  cloudMap.forEach((c, key) => {
    studentMap.set(key, {
      identity_key: key,
      display_name: c.display_identity,
      avatar_config: c.avatar_config,
      wallet_coins: c.wallet_coins,
      level: c.level,
      total_accumulated_exp: c.total_accumulated_exp,
      owned_items_count: c.owned_item_codes.length,
      total_sessions: 0,
      serious_exam_count: 0,
      activity_game_count: 0,
      total_real_exam_correct: 0,
      disqualified_count: 0,
      last_active_at: c.last_seen_at,
      sessions: [],
    });
  });

  // 2) Merge all exam & activity sessions from `game_participants`
  for (const p of participants) {
    const rm = roomMap.get(p.room_id);
    if (!rm) continue;
    const key = normalizeNicknameKey(p.nickname);
    const existing = studentMap.get(key);
    const isSerious = rm.game_mode === 'serious_exam';

    const sessionRec: TeacherStudentSessionRecord = {
      room_id: rm.id,
      pin_code: rm.pin_code,
      quiz_title: rm.quizzes?.title || 'ชุดข้อสอบ',
      game_mode: rm.game_mode,
      joined_at: p.joined_at || rm.created_at,
      real_exam_score: p.is_disqualified ? 0 : p.correct_count,
      game_exp_score: p.is_disqualified ? 0 : p.current_score,
      is_disqualified: Boolean(p.is_disqualified),
      disqualified_reason: p.disqualified_reason || null,
    };

    if (!existing) {
      studentMap.set(key, {
        identity_key: key,
        display_name: p.nickname,
        avatar_config: p.avatar_config,
        wallet_coins: 0,
        level: 1,
        total_accumulated_exp: p.is_disqualified ? 0 : p.current_score,
        owned_items_count: 0,
        total_sessions: 1,
        serious_exam_count: isSerious ? 1 : 0,
        activity_game_count: isSerious ? 0 : 1,
        total_real_exam_correct: p.is_disqualified ? 0 : p.correct_count,
        disqualified_count: p.is_disqualified ? 1 : 0,
        last_active_at: sessionRec.joined_at,
        sessions: [sessionRec],
      });
    } else {
      existing.total_sessions += 1;
      if (isSerious) existing.serious_exam_count += 1;
      else existing.activity_game_count += 1;
      existing.total_real_exam_correct += p.is_disqualified ? 0 : p.correct_count;
      if (p.is_disqualified) existing.disqualified_count += 1;
      if (new Date(sessionRec.joined_at).getTime() > new Date(existing.last_active_at).getTime()) {
        existing.last_active_at = sessionRec.joined_at;
        existing.avatar_config = p.avatar_config || existing.avatar_config;
      }
      existing.sessions.push(sessionRec);
    }
  }

  const students = Array.from(studentMap.values()).sort(
    (a, b) => new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime()
  );

  return { students, cloudTableReady };
}


export async function removeStudentFromClassroom(classroomStudentId: string): Promise<void> {
  const { error } = await supabase
    .from('classroom_students')
    .delete()
    .eq('id', classroomStudentId);

  if (error) throw new Error(error.message);
}

export async function deleteRoomParticipant(roomId: string, participantId: string): Promise<void> {
  const { error: rpcErr } = await supabase.rpc('teacher_delete_room_participant', {
    p_room_id: roomId,
    p_participant_id: participantId,
  });

  if (!rpcErr) return;

  // Fallback to direct delete if policy exists without RPC
  const { error: delErr } = await supabase
    .from('game_participants')
    .delete()
    .eq('id', participantId)
    .eq('room_id', roomId);

  if (delErr) {
    throw new Error(
      'กรุณากดปุ่ม "คัดลอก SQL เปิดระบบจำตัวละครข้ามเครื่อง & ลบนักเรียน" ในแท็บ ข้อมูลนักเรียนรายคน ไปรันใน Supabase SQL Editor 1 ครั้งก่อนลบนักเรียนครับ'
    );
  }
}

export async function deleteStudentFromDirectory(
  identityKey: string,
  displayName: string
): Promise<void> {
  const { error: rpcErr } = await supabase.rpc('teacher_delete_student_records', {
    p_identity_key: identityKey,
    p_display_name: displayName,
  });

  if (!rpcErr) return;

  throw new Error(
    'กรุณากดปุ่ม "คัดลอก SQL เปิดระบบจำตัวละครข้ามเครื่อง & ลบนักเรียน" ด้านบนไปรันใน Supabase SQL Editor 1 ครั้งก่อนลบข้อมูลนักเรียนครับ'
  );
}
