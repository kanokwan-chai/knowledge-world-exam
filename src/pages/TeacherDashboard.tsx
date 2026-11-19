import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  BookOpen,
  Users,
  Play,
  Plus,
  Copy,
  Trash2,
  Download,
  BarChart3,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  Loader2,
  School,
  History,
  Sparkles,
  ShieldCheck,
  Lock,
  KeyRound,
  Swords,
  FileSpreadsheet,
  X,
  RefreshCw,
  Pencil,
  Eye,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  isTeacherGateUnlocked,
  verifyTeacherAccessCode,
  lockTeacherGate,
  getCurrentTeacherAccessCode,
  setCustomTeacherAccessCode,
  generateRandomExamPin,
  validateCustomExamPin,
} from '../lib/securityGuard';
import { soundEngine } from '../lib/soundEngine';
import {
  supabase,
  verifySupabaseConnectionHealth,
  SUPABASE_GRANT_FIX_SQL,
  SUPABASE_TEACHER_AUTH_FIX_SQL,
  getSupabaseProjectRef,
} from '../lib/supabase';
import { RealtimeExamAndBattleArena } from '../components/battle/RealtimeExamAndBattleArena';
import { SmartPasteQuestionImporter } from '../components/quiz/SmartPasteQuestionImporter';
import { ParsedDraftQuestion } from '../lib/smartQuizParser';
import {
  BattleLogEntry,
  DEMO_CLASSROOMS,
  DEMO_GAME_HISTORY,
  DEMO_QUIZZES,
  exportQuestionByQuestionExcel,
  getDemoBattleLogs,
  getDemoStudents,
  INITIAL_DEMO_BATTLE_LOGS,
  INITIAL_DEMO_STUDENTS,
  isDemoDataEnabled,
  QuestionByQuestionStudentRow,
  setDemoDataEnabled,
} from '../lib/demoDataStore';
import {
  addStudentToClassroomByEmail,
  createClassroom,
  createGameRoomRPC,
  createQuiz,
  deleteQuestion,
  deleteQuiz,
  duplicateQuiz,
  exportDetailedRoomReportCSV,
  exportDetailedRoomReportExcel,
  exportScoresToCSV,
  fetchClassroomStudents,
  fetchRoomDetailedReport,
  fetchRoomScoreReport,
  fetchTeacherClassrooms,
  fetchTeacherExamRooms,
  fetchTeacherGameHistory,
  fetchTeacherQuizzes,
  saveQuestionWithChoices,
  swapQuestionSortOrder,
  updateQuestionImageOnly,
  updateQuizDetails,
  uploadQuestionImage,
} from '../services/gameEngineService';
import {
  Classroom,
  ClassroomStudent,
  ExamSessionMode,
  GameHistoryRecord,
  Question,
  QuestionType,
  Quiz,
  RoomDetailedReport,
  TeacherExamRoomSummary,
} from '../types/database';

export const TeacherDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, isSupabaseConfigured, signIn, signUp } = useAuth();

  // Teacher Auth Form State (inside Teacher Portal)
  const [teacherAuthMode, setTeacherAuthMode] = useState<'signin' | 'signup'>('signin');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherDisplayName, setTeacherDisplayName] = useState('');
  const [showTeacherAuthBox, setShowTeacherAuthBox] = useState(true);
  const [authBoxError, setAuthBoxError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Teacher Master Security Passcode Gate State
  const [gateUnlocked, setGateUnlocked] = useState<boolean>(() => isTeacherGateUnlocked());
  const [gatePasscode, setGatePasscode] = useState('');
  const [gateError, setGateError] = useState<string | null>(null);
  const [showChangeCodeModal, setShowChangeCodeModal] = useState(false);
  const [newCustomCode, setNewCustomCode] = useState('');
  const [confirmCustomCode, setConfirmCustomCode] = useState('');
  const [codeSavedNotice, setCodeSavedNotice] = useState<string | null>(null);

  // Demo Data State (can be wiped in 1 click anytime)
  const [demoEnabled, setDemoEnabled] = useState<boolean>(() => isDemoDataEnabled());
  const [demoStudents, setDemoStudents] = useState<QuestionByQuestionStudentRow[]>(() =>
    getDemoStudents()
  );
  const [demoBattleLogs, setDemoBattleLogs] = useState<BattleLogEntry[]>(() =>
    getDemoBattleLogs()
  );

  const [activeTab, setActiveTab] = useState<
    'live_matrix' | 'overview' | 'quizzes' | 'classrooms' | 'history'
  >('quizzes');
  const [classrooms, setClassrooms] = useState<Classroom[]>(() =>
    isDemoDataEnabled() ? DEMO_CLASSROOMS : []
  );
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(
    isDemoDataEnabled() ? DEMO_CLASSROOMS[0].id : null
  );
  const [classroomStudents, setClassroomStudents] = useState<ClassroomStudent[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>(() =>
    isDemoDataEnabled() ? DEMO_QUIZZES : []
  );
  const [history, setHistory] = useState<GameHistoryRecord[]>(() =>
    isDemoDataEnabled() ? DEMO_GAME_HISTORY : []
  );
  const [examRooms, setExamRooms] = useState<TeacherExamRoomSummary[]>([]);
  const [inspectingReport, setInspectingReport] = useState<RoomDetailedReport | null>(null);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dbHealth, setDbHealth] = useState<{
    isConfigured: boolean;
    url: string;
    connected: boolean;
    tablesReady: boolean;
    needsGrantFix?: boolean;
    powersSeedCount: number;
    message: string;
  } | null>(null);
  const [copiedGrantSql, setCopiedGrantSql] = useState(false);
  const [copiedAuthFixSql, setCopiedAuthFixSql] = useState(false);

  useEffect(() => {
    setDemoDataEnabled(false);
    verifySupabaseConnectionHealth().then(setDbHealth).catch(() => null);
  }, []);

  // Classroom Form
  const [className, setClassName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('มัธยมศึกษาปีที่ 1');
  const [classDesc, setClassDesc] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentNumber, setStudentNumber] = useState('');

  // Quiz Builder Form
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(() =>
    isDemoDataEnabled() ? DEMO_QUIZZES[0] : null
  );
  const [quizTitle, setQuizTitle] = useState('');
  const [quizSubject, setQuizSubject] = useState('วิทยาศาสตร์');
  const [quizDesc, setQuizDesc] = useState('');

  // Question Editor Form
  const [editingQuestionId, setEditingQuestionId] = useState<string | undefined>(undefined);
  const [qType, setQType] = useState<QuestionType>('multiple_choice');
  const [qPrompt, setQPrompt] = useState('');
  const [qImageUrl, setQImageUrl] = useState('');
  const [qExplanation, setQExplanation] = useState('');
  const [qTimeLimit, setQTimeLimit] = useState(20);
  const [qBasePoints, setQBasePoints] = useState(1000);
  const [qSpeedBonus, setQSpeedBonus] = useState(500);
  const [qChoices, setQChoices] = useState<
    Array<{ choice_label: string; choice_text: string; is_correct: boolean; sort_order: number }>
  >([
    { choice_label: 'A', choice_text: '', is_correct: true, sort_order: 0 },
    { choice_label: 'B', choice_text: '', is_correct: false, sort_order: 1 },
    { choice_label: 'C', choice_text: '', is_correct: false, sort_order: 2 },
    { choice_label: 'D', choice_text: '', is_correct: false, sort_order: 3 },
  ]);
  const [actionLoading, setActionLoading] = useState(false);

  // Launch Exam Room Modal State (Custom 6-digit Exam PIN + Exam Mode Picker)
  const [launchModalQuiz, setLaunchModalQuiz] = useState<Quiz | null>(null);
  const [launchExamMode, setLaunchExamMode] = useState<ExamSessionMode>('serious_exam');
  const [customExamPin, setCustomExamPin] = useState('');
  const [launchModalError, setLaunchModalError] = useState<string | null>(null);

  // Saved Quiz Full Inline Edit State (Title + Subject + Description)
  const [renamingQuizId, setRenamingQuizId] = useState<string | null>(null);
  const [renameQuizDraft, setRenameQuizDraft] = useState('');
  const [renameQuizSubjectDraft, setRenameQuizSubjectDraft] = useState('');
  const [renameQuizDescDraft, setRenameQuizDescDraft] = useState('');

  const loadDashboardData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [cls, qzs, hist, rooms] = await Promise.all([
        fetchTeacherClassrooms(user.id),
        fetchTeacherQuizzes(user.id),
        fetchTeacherGameHistory(user.id),
        fetchTeacherExamRooms(user.id).catch(() => []),
      ]);
      setClassrooms(cls);
      setQuizzes(qzs);
      setHistory(hist);
      setExamRooms(rooms);

      setSelectedClassroomId((prev) => prev ?? (cls[0]?.id ?? null));
      setSelectedQuiz((prev) =>
        prev && qzs.some((q) => q.id === prev.id)
          ? qzs.find((q) => q.id === prev.id) ?? null
          : qzs[0] ?? null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลครูได้');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    if (selectedClassroomId) {
      fetchClassroomStudents(selectedClassroomId)
        .then(setClassroomStudents)
        .catch(() => setClassroomStudents([]));
    }
  }, [selectedClassroomId]);

  const handleCreateClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('กรุณาเชื่อมต่อ Supabase และเข้าสู่ระบบบัญชีคุณครูก่อนสร้างห้องเรียน');
      return;
    }
    if (!className.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      const created = await createClassroom(user.id, className, gradeLevel, classDesc);
      setClassrooms((prev) => [created, ...prev]);
      setSelectedClassroomId(created.id);
      setClassName('');
      setClassDesc('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างห้องเรียนไม่สำเร็จ');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassroomId || !studentEmail.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      const added = await addStudentToClassroomByEmail(selectedClassroomId, studentEmail, studentNumber);
      setClassroomStudents((prev) => [...prev, added]);
      setStudentEmail('');
      setStudentNumber('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เพิ่มนักเรียนไม่สำเร็จ');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('กรุณาเชื่อมต่อ Supabase และเข้าสู่ระบบบัญชีคุณครูก่อนสร้างชุดคำถาม');
      setShowTeacherAuthBox(true);
      document.getElementById('teacher-auth-section')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (!quizTitle.trim()) return;
    setActionLoading(true);
    setError(null);
    setSaveSuccess(null);
    try {
      const created = await createQuiz(user.id, {
        title: quizTitle,
        description: quizDesc,
        subject: quizSubject,
        game_mode: 'adventure_standard',
        classroom_id: null,
      });
      setQuizzes((prev) => [created, ...prev]);
      setSelectedQuiz(created);
      setQuizTitle('');
      setQuizDesc('');
      setActiveTab('quizzes');
      soundEngine.playCoinSound();
      setSaveSuccess(`✅ สร้างชุดคำถาม "${created.title}" เรียบร้อยแล้ว!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างชุดคำถามไม่สำเร็จ');
    } finally {
      setActionLoading(false);
    }
  };

  const handleQuestionTypeChange = (nextType: QuestionType) => {
    setQType(nextType);
    if (nextType === 'true_false') {
      setQChoices([
        { choice_label: 'T', choice_text: 'ถูก (True)', is_correct: true, sort_order: 0 },
        { choice_label: 'F', choice_text: 'ผิด (False)', is_correct: false, sort_order: 1 },
      ]);
    } else if (nextType === 'text_quiz') {
      setQChoices([
        { choice_label: 'ANS', choice_text: '', is_correct: true, sort_order: 0 },
      ]);
    } else {
      setQChoices([
        { choice_label: 'A', choice_text: '', is_correct: true, sort_order: 0 },
        { choice_label: 'B', choice_text: '', is_correct: false, sort_order: 1 },
        { choice_label: 'C', choice_text: '', is_correct: false, sort_order: 2 },
        { choice_label: 'D', choice_text: '', is_correct: false, sort_order: 3 },
      ]);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('กรุณาเข้าสู่ระบบบัญชีคุณครูก่อนบันทึกคำถามลงฐานข้อมูล');
      setShowTeacherAuthBox(true);
      document.getElementById('teacher-auth-section')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    setActionLoading(true);
    setError(null);
    setSaveSuccess(null);

    try {
      let targetQuiz = selectedQuiz;
      if (!targetQuiz) {
        targetQuiz = await createQuiz(user.id, {
          title: quizTitle.trim() || `ชุดข้อสอบใหม่ (${new Date().toLocaleDateString('th-TH')})`,
          description: quizDesc.trim() || 'ชุดข้อสอบ Knowledge World',
          subject: quizSubject || 'ทั่วไป',
          game_mode: 'adventure_standard',
          classroom_id: null,
        });
      }

      const currentQuestions = targetQuiz.questions ?? [];
      const sortOrder = editingQuestionId
        ? currentQuestions.find((q) => q.id === editingQuestionId)?.sort_order ?? currentQuestions.length
        : Math.max(-1, ...currentQuestions.map((q) => q.sort_order)) + 1;

      await saveQuestionWithChoices(targetQuiz.id, {
        question_id: editingQuestionId,
        question_type: qType,
        prompt: qPrompt,
        image_url: qImageUrl.trim() || null,
        explanation: qExplanation,
        time_limit_seconds: qTimeLimit,
        base_points: qBasePoints,
        speed_bonus_max: qSpeedBonus,
        sort_order: sortOrder,
        choices: qChoices,
      });

      const refreshed = await fetchTeacherQuizzes(user.id);
      setQuizzes(refreshed);
      const updatedQuiz = refreshed.find((q) => q.id === targetQuiz!.id) ?? null;
      setSelectedQuiz(updatedQuiz);

      // Reset question form
      setEditingQuestionId(undefined);
      setQPrompt('');
      setQImageUrl('');
      setQExplanation('');
      handleQuestionTypeChange('multiple_choice');
      soundEngine.playPowerUpSound();
      setSaveSuccess('✅ บันทึกคำถามลงฐานข้อมูลเรียบร้อยแล้ว!');
    } catch (err) {
      soundEngine.playWrongSound();
      setError(err instanceof Error ? err.message : 'บันทึกคำถามไม่สำเร็จ');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReorderQuestion = async (question: Question, direction: 'up' | 'down') => {
    if (!selectedQuiz || !user) return;
    const list = [...(selectedQuiz.questions ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const idx = list.findIndex((q) => q.id === question.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;

    const target = list[swapIdx];
    setActionLoading(true);
    setError(null);
    try {
      await swapQuestionSortOrder(question.id, question.sort_order, target.id, target.sort_order);

      const refreshed = await fetchTeacherQuizzes(user.id);
      setQuizzes(refreshed);
      setSelectedQuiz(refreshed.find((q) => q.id === selectedQuiz.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'จัดเรียงลำดับไม่สำเร็จ');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLaunchGameRoom = (quiz: Quiz) => {
    if ((quiz.questions?.length ?? 0) === 0) {
      setError('กรุณาเพิ่มคำถามอย่างน้อย 1 ข้อในชุดคำถามก่อนเริ่มสร้างห้องแข่งขัน');
      setSelectedQuiz(quiz);
      setActiveTab('quizzes');
      return;
    }

    soundEngine.playClickSound();
    setError(null);
    setLaunchModalError(null);
    setCustomExamPin('');
    setLaunchModalQuiz(quiz);
  };

  const handleConfirmLaunchGameRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!launchModalQuiz) return;

    const pinCheck = validateCustomExamPin(customExamPin);
    if (!pinCheck.valid) {
      soundEngine.playWrongSound();
      setLaunchModalError(pinCheck.error || 'รหัสข้อสอบไม่ถูกต้อง');
      return;
    }

    setActionLoading(true);
    setLaunchModalError(null);
    setError(null);
    try {
      const room = await createGameRoomRPC(
        launchModalQuiz.id,
        null,
        launchExamMode,
        true,
        pinCheck.normalized || undefined
      );
      soundEngine.playPowerUpSound();
      setLaunchModalQuiz(null);
      setCustomExamPin('');
      navigate(`/teacher/room/${room.id}`);
    } catch (err) {
      soundEngine.playWrongSound();
      setLaunchModalError(err instanceof Error ? err.message : 'ไม่สามารถเปิดห้องสอบได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadRoomCSV = async (roomId: string, title: string) => {
    try {
      const scores = await fetchRoomScoreReport(roomId);
      exportScoresToCSV(scores, title);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ดาวน์โหลดรายงานไม่สำเร็จ');
    }
  };

  const handleClearDemoData = () => {
    soundEngine.playClickSound();
    setDemoDataEnabled(false);
    setDemoEnabled(false);
    setDemoStudents([]);
    setDemoBattleLogs([]);
    if (!user) {
      setClassrooms([]);
      setQuizzes([]);
      setHistory([]);
      setSelectedQuiz(null);
      setSelectedClassroomId(null);
    }
  };

  const handleRestoreDemoData = () => {
    soundEngine.playPowerUpSound();
    setDemoDataEnabled(true);
    setDemoEnabled(true);
    setDemoStudents(INITIAL_DEMO_STUDENTS);
    setDemoBattleLogs(INITIAL_DEMO_BATTLE_LOGS);
    if (!user) {
      setClassrooms(DEMO_CLASSROOMS);
      setQuizzes(DEMO_QUIZZES);
      setHistory(DEMO_GAME_HISTORY);
      setSelectedQuiz(DEMO_QUIZZES[0]);
      setSelectedClassroomId(DEMO_CLASSROOMS[0].id);
    }
  };

  const handleSaveCustomPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = newCustomCode.trim();
    if (trimmed.length < 4) {
      setError('รหัสผ่านคุณครูต้องยาวอย่างน้อย 4 ตัวอักษร');
      return;
    }
    if (confirmCustomCode && trimmed !== confirmCustomCode.trim()) {
      soundEngine.playWrongSound();
      setError('รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง');
      return;
    }
    try {
      setCustomTeacherAccessCode(trimmed);
      if (user) {
        await supabase.auth
          .updateUser({ data: { teacher_vault_code: trimmed } })
          .catch(() => null);
      }
      soundEngine.playCoinSound();
      setCodeSavedNotice(`✅ เปลี่ยนรหัสผ่านเข้าหน้าคุณครูใหม่เป็น "${trimmed}" เรียบร้อยแล้ว!`);
      setNewCustomCode('');
      setConfirmCustomCode('');
      setTimeout(() => {
        setCodeSavedNotice(null);
      }, 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ตั้งรหัสไม่สำเร็จ');
    }
  };

  // Strictly prevent students from viewing Teacher Portal
  if (profile?.role === 'student') {
    return <Navigate to="/student" replace />;
  }

  // Layer 1 Security Gate: Always require Teacher Master Passcode once per browser session
  if (!gateUnlocked) {
    const handleUnlockGate = (e: React.FormEvent) => {
      e.preventDefault();
      setGateError(null);
      const res = verifyTeacherAccessCode(gatePasscode);
      if (res.unlocked) {
        soundEngine.playPowerUpSound();
        setGateUnlocked(true);
      } else {
        soundEngine.playWrongSound();
        setGateError(res.error || 'รหัสผ่านไม่ถูกต้อง');
      }
    };

    return (
      <div className="max-w-lg mx-auto px-4 py-10 space-y-4">
        {dbHealth && (
          <div
            className={`card-game p-4 text-left space-y-2 ${
              dbHealth.connected && dbHealth.tablesReady
                ? 'bg-emerald-100 border-emerald-700'
                : dbHealth.isConfigured
                  ? 'bg-amber-100 border-amber-700'
                  : 'bg-red-100 border-red-700'
            }`}
          >
            <div className="text-xs font-extrabold text-slate-900 flex items-center justify-between">
              <span>
                {dbHealth.connected && dbHealth.tablesReady
                  ? '🟢 สถานะฐานข้อมูล Supabase: เชื่อมต่อสำเร็จ!'
                  : '🟠 สถานะฐานข้อมูล Supabase:'}
              </span>
              <button
                type="button"
                onClick={() => verifySupabaseConnectionHealth().then(setDbHealth)}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-900 text-[11px] font-bold"
              >
                🔄 เช็คอีกครั้ง
              </button>
            </div>
            <p className="text-xs font-bold text-slate-800">{dbHealth.message}</p>
            {dbHealth.needsGrantFix && (
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(SUPABASE_GRANT_FIX_SQL);
                  setCopiedGrantSql(true);
                  setTimeout(() => setCopiedGrantSql(false), 3000);
                }}
                className="btn-game-yellow w-full py-2 text-xs"
              >
                {copiedGrantSql
                  ? '✅ คัดลอกแล้ว! นำไปวางใน Supabase SQL Editor แล้วกด RUN ได้เลย'
                  : '📋 คัดลอกคำสั่งปลดล็อกสิทธิ์ตาราง (4 บรรทัด) ไปรันใน SQL Editor'}
              </button>
            )}
          </div>
        )}

        <div className="card-game p-8 space-y-6 text-center bg-gradient-to-b from-kw-cream to-amber-50">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-kw-red text-white border-4 border-slate-900 shadow-block-sm flex items-center justify-center">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-900 text-kw-yellow text-xs font-extrabold">
              <ShieldCheck className="w-4 h-4" /> TEACHER SECURITY VAULT
            </span>
            <h1 className="font-game text-2xl font-extrabold text-slate-900 pt-1">
              ระบบป้องกันการเข้าถึงพื้นที่คุณครู
            </h1>
            <p className="text-xs font-semibold text-slate-600">
              ป้องกันนักเรียนแอบพิมพ์ URL เข้ามาดูเฉลยหรือแก้ไขข้อสอบ กรุณากรอกรหัสผ่านเข้าหน้าคุณครู
            </p>
          </div>

          <form onSubmit={handleUnlockGate} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                รหัสผ่านเข้าหน้าคุณครู (Teacher Master Passcode)
              </label>
              <div className="relative">
                <KeyRound className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="password"
                  value={gatePasscode}
                  onChange={(e) => setGatePasscode(e.target.value)}
                  placeholder="กรอกรหัสผ่านคุณครู"
                  className="w-full rounded-2xl border-3 border-slate-900 pl-11 pr-4 py-3 font-bold text-sm bg-white"
                  required
                />
              </div>
              <span className="block text-[11px] font-bold text-slate-500 mt-1">
                * ระบบล็อกอัตโนมัติ 60 วินาทีหากใส่รหัสผิดครบ 5 ครั้ง (นักเรียนห้ามเข้าพื้นที่นี้เด็ดขาด)
              </span>
            </div>

            {gateError && (
              <div className="p-3 rounded-xl bg-red-100 border-2 border-red-600 text-red-900 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{gateError}</span>
              </div>
            )}

            <button type="submit" className="btn-game-green w-full py-3.5 text-base">
              ปลดล็อกเข้าสู่ระบบคุณครู
            </button>
          </form>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs font-bold text-slate-600 underline"
          >
            กลับไปหน้าหลักสำหรับนักเรียน
          </button>
        </div>
      </div>
    );
  }

  const handleTeacherAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    setAuthBoxError(null);
    try {
      if (teacherAuthMode === 'signin') {
        await signIn(teacherEmail, teacherPassword);
      } else {
        await signUp(teacherEmail, teacherPassword, teacherDisplayName || 'คุณครู Knowledge World', 'teacher');
      }
      soundEngine.playPowerUpSound();
      setShowTeacherAuthBox(false);
    } catch (err) {
      soundEngine.playWrongSound();
      const msg = err instanceof Error ? err.message : 'เข้าสู่ระบบครูไม่สำเร็จ';
      setAuthBoxError(msg);
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const avgOverallScore =
    history.length > 0
      ? Math.round(history.reduce((acc, h) => acc + Number(h.average_score || 0), 0) / history.length)
      : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 pb-24 space-y-8">
      {/* Live Database Connection Health Diagnostic Banner */}
      {dbHealth && (
        <div
          className={`card-game p-4 flex flex-wrap items-center justify-between gap-3 ${
            dbHealth.connected && dbHealth.tablesReady
              ? 'bg-emerald-100 border-emerald-700'
              : dbHealth.isConfigured
                ? 'bg-amber-100 border-amber-700'
                : 'bg-red-100 border-red-700'
          }`}
        >
          <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span>
              {dbHealth.connected && dbHealth.tablesReady
                ? '🟢 สถานะฐานข้อมูล Supabase: '
                : '🟠 สถานะฐานข้อมูล Supabase: '}
            </span>
            <span>{dbHealth.message}</span>
          </div>
          <div className="flex items-center gap-2">
            {dbHealth.needsGrantFix && (
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(SUPABASE_GRANT_FIX_SQL);
                  setCopiedGrantSql(true);
                  setTimeout(() => setCopiedGrantSql(false), 3000);
                }}
                className="btn-game-yellow text-xs py-1.5 px-3"
              >
                {copiedGrantSql
                  ? '✅ คัดลอกแล้ว! นำไปวางใน SQL Editor แล้วกด RUN'
                  : '📋 คัดลอกคำสั่งปลดล็อกสิทธิ์ตาราง (4 บรรทัด)'}
              </button>
            )}
            <button
              type="button"
              onClick={() => verifySupabaseConnectionHealth().then(setDbHealth)}
              className="px-3 py-1.5 rounded-xl bg-white border-2 border-slate-900 text-xs font-extrabold"
            >
              🔄 เช็คการเชื่อมต่ออีกครั้ง
            </button>
          </div>
        </div>
      )}

      {/* Connection / Teacher Auth Guide Banner if not logged in yet */}
      {(!isSupabaseConfigured || !user) && (
        <div id="teacher-auth-section" className="card-game p-5 bg-amber-100 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-bold text-slate-900">
              {!isSupabaseConfigured ? (
                <span>
                  💡 <strong>ขั้นตอนสำหรับคุณครู:</strong> 1) กดปุ่ม{' '}
                  <strong className="text-kw-red">"⚙️ ตั้งค่าเชื่อม Supabase DB"</strong>{' '}
                  มุมขวาบนสุดเพื่อเชื่อมฐานข้อมูล 2) กดปุ่มเข้าสู่ระบบ/สมัครสมาชิกครูด้านขวา
                </span>
              ) : (
                <span>
                  💡 <strong>ระบบเฉพาะคุณครู (Teacher Portal):</strong> กรุณาเข้าสู่ระบบหรือสมัครบัญชีคุณครูเพื่อบันทึกชุดข้อสอบและเปิดห้องแข่งขัน
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowTeacherAuthBox((v) => !v)}
              className="btn-game-blue text-xs py-2 px-4"
            >
              {showTeacherAuthBox ? 'ซ่อนฟอร์มเข้าสู่ระบบครู' : '🔑 เข้าสู่ระบบ / สมัครสมาชิกคุณครู'}
            </button>
          </div>

          {showTeacherAuthBox && (
            <form
              onSubmit={handleTeacherAuth}
              className="p-4 rounded-2xl bg-white border-3 border-slate-900 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
            >
              <div className="md:col-span-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setTeacherAuthMode('signin')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border-2 border-slate-900 ${
                    teacherAuthMode === 'signin' ? 'bg-kw-blue text-white' : 'bg-slate-100'
                  }`}
                >
                  เข้าสู่ระบบครู (Sign In)
                </button>
                <button
                  type="button"
                  onClick={() => setTeacherAuthMode('signup')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border-2 border-slate-900 ${
                    teacherAuthMode === 'signup' ? 'bg-kw-orange text-white' : 'bg-slate-100'
                  }`}
                >
                  สมัครบัญชีคุณครูใหม่ (Sign Up)
                </button>
              </div>

              {teacherAuthMode === 'signup' && (
                <div>
                  <label className="block text-xs font-bold mb-1">ชื่อคุณครู (2-28 ตัวอักษร)</label>
                  <input
                    type="text"
                    minLength={2}
                    maxLength={28}
                    value={teacherDisplayName}
                    onChange={(e) => setTeacherDisplayName(e.target.value)}
                    placeholder="เช่น ครูสมชาย ใจดี"
                    className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-sm"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold mb-1">อีเมลคุณครู</label>
                <input
                  type="email"
                  value={teacherEmail}
                  onChange={(e) => setTeacherEmail(e.target.value)}
                  placeholder="teacher@school.ac.th"
                  className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">รหัสผ่าน</label>
                <input
                  type="password"
                  minLength={6}
                  value={teacherPassword}
                  onChange={(e) => setTeacherPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-sm"
                  required
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={actionLoading || !isSupabaseConfigured}
                  className="btn-game-green w-full text-xs py-2.5"
                >
                  {actionLoading
                    ? 'กำลังดำเนินการ...'
                    : teacherAuthMode === 'signin'
                      ? 'เข้าสู่ระบบคุณครู'
                      : 'ยืนยันสมัครบัญชีคุณครู'}
                </button>
              </div>

              {authBoxError && (
                <div className="md:col-span-4 p-3.5 rounded-xl bg-red-100 border-2 border-red-600 text-red-900 text-xs font-bold space-y-2.5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{authBoxError}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {(() => {
                      const projectRef = getSupabaseProjectRef();
                      return projectRef ? (
                        <a
                          href={`https://supabase.com/dashboard/project/${projectRef}/auth/providers`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white border-2 border-slate-900 font-extrabold text-xs inline-flex items-center gap-1"
                        >
                          ⚙️ เปิดหน้าเปิดสวิตช์ Email Provider บน Supabase
                        </a>
                      ) : null;
                    })()}
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(SUPABASE_TEACHER_AUTH_FIX_SQL);
                        setCopiedAuthFixSql(true);
                        setTimeout(() => setCopiedAuthFixSql(false), 3500);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-kw-yellow text-slate-900 border-2 border-slate-900 font-extrabold text-xs"
                    >
                      {copiedAuthFixSql
                        ? '✅ คัดลอกแล้ว! นำไปวางใน Supabase SQL Editor แล้วกด RUN'
                        : '📋 คัดลอก SQL แก้ปัญหาสมัครครู & ยืนยันบัญชีอัตโนมัติ'}
                    </button>
                    {teacherAuthMode === 'signup' && (
                      <button
                        type="button"
                        onClick={() => {
                          setTeacherAuthMode('signin');
                          setAuthBoxError(null);
                          setError(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-kw-blue text-white border-2 border-slate-900 font-extrabold text-xs"
                      >
                        🔑 สลับไปเข้าสู่ระบบ (Sign In)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      )}

      {/* Header Banner */}
      <div className="card-game p-6 bg-gradient-to-r from-amber-100 via-kw-cream to-sky-100 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-kw-orange text-white text-xs font-extrabold border-2 border-slate-900">
            <Sparkles className="w-3.5 h-3.5" /> TEACHER COMMAND CASTLE
          </span>
          <h1 className="font-game text-3xl font-extrabold text-slate-900 mt-1">
            สวัสดีคุณครู {profile?.display_name || user?.email || '(โหมดจัดการข้อสอบ)'}
          </h1>
          <p className="text-sm text-slate-700">
            จัดการห้องเรียน สร้างบล็อกคำถาม เปิดห้องแข่งขันด้วย QR Code และดาวน์โหลดรายงานผลคะแนน
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowChangeCodeModal((v) => !v)}
            className="px-3.5 py-2.5 rounded-2xl bg-amber-100 hover:bg-kw-yellow text-slate-900 font-game font-extrabold text-xs border-2 border-slate-900 flex items-center gap-1.5 shadow-sm"
          >
            <KeyRound className="w-4 h-4 text-kw-red" />
            <span>🔑 เปลี่ยนรหัสเข้าหน้าครู</span>
          </button>
          <button
            type="button"
            onClick={() => {
              lockTeacherGate();
              setGateUnlocked(false);
            }}
            className="px-3.5 py-2.5 rounded-2xl bg-slate-900 text-kw-yellow font-game font-bold text-xs border-2 border-slate-900 flex items-center gap-1.5"
          >
            <Lock className="w-4 h-4" />
            <span>ล็อกหน้าจอครู</span>
          </button>
          <button
            type="button"
            onClick={() =>
              exportQuestionByQuestionExcel(
                demoStudents,
                selectedQuiz?.title || 'แบบทดสอบ_KnowledgeWorld',
                selectedQuiz?.questions?.length || 5
              )
            }
            className="btn-game-green text-xs py-2.5 px-4 flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>ดาวน์โหลด Excel (.xls)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('quizzes')}
            className="btn-game-yellow text-sm py-2.5 px-4 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>สร้างคำถาม / ชุดข้อสอบ</span>
          </button>
          {quizzes.length > 0 && (
            <button
              type="button"
              onClick={() => handleLaunchGameRoom(selectedQuiz || quizzes[0])}
              disabled={actionLoading}
              className="btn-game-red text-sm py-2.5 px-5 flex items-center gap-1.5"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>เริ่มเปิดห้องเกมทันที!</span>
            </button>
          )}
        </div>
      </div>

      {/* Custom Teacher Passcode Setter Box (Always easy to find & test!) */}
      {showChangeCodeModal && (
        <form
          onSubmit={handleSaveCustomPasscode}
          className="card-game p-5 bg-amber-50 border-4 border-slate-900 flex flex-wrap items-end justify-between gap-4"
        >
          <div className="flex-1 min-w-[260px] space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-slate-900 text-kw-yellow font-game text-xs font-extrabold">
                🔑 รหัสเข้าหน้าคุณครูปัจจุบันคือ: {getCurrentTeacherAccessCode()}
              </span>
              <span className="text-xs font-bold text-slate-600">
                (ใช้กรอกตอนหน้าจอถูกล็อก เพื่อกันนักเรียนแอบเข้าหน้าครู)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-800 mb-1">
                  ตั้งรหัสผ่านคุณครูใหม่ (อย่างน้อย 4 ตัวอักษร):
                </label>
                <input
                  type="text"
                  minLength={4}
                  value={newCustomCode}
                  onChange={(e) => setNewCustomCode(e.target.value)}
                  placeholder="พิมพ์รหัสใหม่ เช่น KRUMAIL99 หรือ 2569"
                  className="w-full rounded-xl border-2 border-slate-900 px-3 py-2.5 text-sm font-bold bg-white"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-800 mb-1">
                  ยืนยันรหัสผ่านใหม่อีกครั้ง:
                </label>
                <input
                  type="text"
                  minLength={4}
                  value={confirmCustomCode}
                  onChange={(e) => setConfirmCustomCode(e.target.value)}
                  placeholder="พิมพ์รหัสใหม่ซ้ำอีกครั้งเพื่อยืนยัน"
                  className="w-full rounded-xl border-2 border-slate-900 px-3 py-2.5 text-sm font-bold bg-white"
                  required
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {codeSavedNotice && (
              <span className="text-xs font-extrabold text-emerald-700">{codeSavedNotice}</span>
            )}
            <button type="submit" className="btn-game-green text-xs py-2.5 px-5">
              บันทึกรหัสผ่านครูใหม่
            </button>
            <button
              type="button"
              onClick={() => {
                lockTeacherGate();
                setGateUnlocked(false);
              }}
              className="btn-game-red text-xs py-2.5 px-4 flex items-center gap-1.5"
            >
              <Lock className="w-4 h-4" />
              <span>ล็อกหน้าจอเพื่อทดสอบใส่รหัสครู</span>
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-red-100 border-3 border-red-600 text-red-900 font-bold text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-xs underline">
            ปิด
          </button>
        </div>
      )}

      {saveSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-100 border-3 border-emerald-600 text-emerald-950 font-bold text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-700" />
            <span>{saveSuccess}</span>
          </div>
          <button type="button" onClick={() => setSaveSuccess(null)} className="text-xs underline">
            ปิด
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card-game p-4 text-center">
          <School className="w-6 h-6 mx-auto text-kw-blue mb-1" />
          <div className="font-game text-3xl font-extrabold">{classrooms.length}</div>
          <div className="text-xs font-bold text-slate-600">จำนวนห้องเรียน</div>
        </div>
        <div className="card-game p-4 text-center">
          <Users className="w-6 h-6 mx-auto text-kw-green mb-1" />
          <div className="font-game text-3xl font-extrabold">{classroomStudents.length}</div>
          <div className="text-xs font-bold text-slate-600">นักเรียนในห้องที่เลือก</div>
        </div>
        <div className="card-game p-4 text-center">
          <BookOpen className="w-6 h-6 mx-auto text-kw-orange mb-1" />
          <div className="font-game text-3xl font-extrabold">{quizzes.length}</div>
          <div className="text-xs font-bold text-slate-600">จำนวนชุดคำถาม</div>
        </div>
        <div className="card-game p-4 text-center">
          <Play className="w-6 h-6 mx-auto text-kw-red mb-1" />
          <div className="font-game text-3xl font-extrabold">{Math.max(examRooms.length, history.length)}</div>
          <div className="text-xs font-bold text-slate-600">จำนวนครั้งที่จัดสอบแล้ว</div>
        </div>
        <div className="card-game p-4 text-center col-span-2 md:col-span-1">
          <BarChart3 className="w-6 h-6 mx-auto text-purple-600 mb-1" />
          <div className="font-game text-3xl font-extrabold">{avgOverallScore.toLocaleString()}</div>
          <div className="text-xs font-bold text-slate-600">คะแนนเฉลี่ยรวม</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto no-scrollbar gap-2 border-b-4 border-slate-900 pb-2 sm:flex-wrap sm:pb-3">
        {[
          { id: 'live_matrix', label: '📊 แดชบอร์ดคะแนนเรียลไทม์ข้อต่อข้อ & 3D Battle', icon: Swords },
          { id: 'quizzes', label: 'จัดการชุดคำถาม / ตั้งเวลารายข้อ', icon: BookOpen },
          { id: 'overview', label: 'ภาพรวม & กราฟผลการเรียน', icon: BarChart3 },
          { id: 'classrooms', label: 'ห้องเรียน & รายชื่อนักเรียน', icon: Users },
          { id: 'history', label: 'ประวัติการแข่งขัน & รายงาน Excel', icon: History },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`shrink-0 whitespace-nowrap px-4 py-2.5 rounded-2xl font-game font-bold text-xs sm:text-sm border-3 border-slate-900 flex items-center gap-2 transition ${
                activeTab === t.id
                  ? 'bg-kw-yellow text-slate-900 shadow-block-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="card-game p-12 text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-kw-blue mb-2" />
          <p className="font-bold text-slate-700">กำลังโหลดข้อมูลจากฐานข้อมูล Supabase...</p>
        </div>
      ) : null}

      {/* TAB 0: LIVE QUESTION-BY-QUESTION MATRIX & 3D BATTLE ARENA */}
      {!loading && activeTab === 'live_matrix' && (
        <RealtimeExamAndBattleArena
          quizTitle={selectedQuiz?.title || 'แบบทดสอบ Knowledge World'}
          totalQuestions={selectedQuiz?.questions?.length || 5}
          students={demoStudents}
          onStudentsChange={setDemoStudents}
          battleLogs={demoBattleLogs}
          onBattleLogsChange={setDemoBattleLogs}
          isDemoActive={demoEnabled}
          onClearDemoData={handleClearDemoData}
          onRestoreDemoData={handleRestoreDemoData}
        />
      )}

      {/* TAB 1: OVERVIEW & ANALYTICS */}
      {!loading && activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Quick Launch Quizzes */}
          <div className="lg:col-span-7 card-game p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-game text-2xl font-bold">ชุดคำถามพร้อมเปิดห้องแข่งขัน</h2>
              <button
                type="button"
                onClick={() => setActiveTab('quizzes')}
                className="text-xs font-extrabold text-kw-blue underline"
              >
                + สร้างชุดคำถามใหม่
              </button>
            </div>

            {quizzes.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-400 text-center space-y-3">
                <p className="font-bold text-slate-700">ยังไม่มีชุดคำถามในระบบ</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('quizzes')}
                  className="btn-game-yellow text-sm py-2 px-4"
                >
                  สร้างชุดคำถามแรกของคุณครู
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {quizzes.map((qz) => (
                  <div
                    key={qz.id}
                    className="p-4 rounded-2xl bg-white border-3 border-slate-900 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-sky-100 border border-slate-900 text-[11px] font-bold">
                          {qz.subject}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-100 border border-slate-900 text-[11px] font-bold">
                          {qz.questions?.length ?? 0} ข้อ
                        </span>
                      </div>
                      <h3 className="font-game text-lg font-extrabold mt-1">{qz.title}</h3>
                      <p className="text-xs text-slate-600">{qz.description || 'พร้อมสำหรับการแข่งขัน'}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedQuiz(qz);
                          setActiveTab('quizzes');
                        }}
                        className="px-3 py-2 rounded-xl border-2 border-slate-900 bg-slate-100 hover:bg-slate-200 text-xs font-bold"
                      >
                        แก้ไขคำถาม
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLaunchGameRoom(qz)}
                        className="btn-game-green text-xs py-2 px-4 flex items-center gap-1"
                      >
                        <Play className="w-4 h-4 fill-white" />
                        <span>เปิดห้องเกม (QR/PIN)</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Learning Analytics Chart */}
          <div className="lg:col-span-5 card-game p-6 space-y-4">
            <h2 className="font-game text-2xl font-bold">กราฟความแม่นยำผลการเรียนล่าสุด</h2>
            {history.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-400 text-center text-sm text-slate-600 font-semibold">
                เมื่อจัดเกมเสร็จสิ้น กราฟวิเคราะห์คะแนนและความแม่นยำรายเกมจะแสดงที่นี่
              </div>
            ) : (
              <div className="space-y-3">
                {history.slice(0, 6).map((h) => (
                  <div key={h.id} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="truncate max-w-[60%]">{h.quizzes?.title || 'Quiz Game'}</span>
                      <span>
                        ความแม่นยำ {h.average_accuracy}% | เฉลี่ย {Math.round(h.average_score)} pts
                      </span>
                    </div>
                    <div className="w-full h-4 rounded-full bg-slate-200 border-2 border-slate-900 overflow-hidden">
                      <div
                        className="h-full bg-kw-green transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(8, Number(h.average_accuracy)))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: QUIZ & QUESTION BUILDER */}
      {!loading && activeTab === 'quizzes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Create Quiz & Select Quiz List */}
          <div className="lg:col-span-4 space-y-6">
            <form onSubmit={handleCreateQuiz} className="card-game p-5 space-y-3">
              <h3 className="font-game text-xl font-bold border-b-2 border-slate-200 pb-2">
                + สร้างชุดคำถามใหม่
              </h3>
              <div>
                <label className="block text-xs font-bold mb-1">ชื่อชุดคำถาม</label>
                <input
                  type="text"
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  placeholder="เช่น ตะลุยด่านวิทยาศาสตร์ ม.1"
                  className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-sm font-semibold"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">วิชา / หมวดหมู่</label>
                <input
                  type="text"
                  value={quizSubject}
                  onChange={(e) => setQuizSubject(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">คำอธิบายเพิ่มเติม (ถ้ามี)</label>
                <input
                  type="text"
                  value={quizDesc}
                  onChange={(e) => setQuizDesc(e.target.value)}
                  placeholder="เช่น สอบกลางภาค บทที่ 1–3"
                  className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-sm font-semibold"
                />
              </div>
              <button
                type="submit"
                disabled={actionLoading}
                className="btn-game-blue w-full text-sm py-2.5"
              >
                สร้างชุดคำถาม
              </button>
            </form>

            {/* Quiz List */}
            <div className="card-game p-5 space-y-3">
              <h3 className="font-game text-lg font-bold">รายการชุดคำถามทั้งหมด ({quizzes.length})</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {quizzes.map((qz) => (
                  <div
                    key={qz.id}
                    onClick={() => setSelectedQuiz(qz)}
                    className={`p-3 rounded-2xl border-2 border-slate-900 cursor-pointer transition ${
                      selectedQuiz?.id === qz.id ? 'bg-kw-yellow' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm truncate">{qz.title}</span>
                      <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-white border border-slate-900">
                        {qz.questions?.length ?? 0} ข้อ
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-900/15 text-xs">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLaunchGameRoom(qz);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-kw-green text-white border border-slate-900 font-bold"
                      >
                        <Play className="w-3 h-3 fill-white" /> เปิดห้องสอบ
                      </button>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!user) return;
                            const copy = await duplicateQuiz(qz.id, user.id);
                            setQuizzes((prev) => [copy, ...prev]);
                          }}
                          className="inline-flex items-center gap-1 font-bold text-slate-700 hover:text-slate-950"
                        >
                          <Copy className="w-3.5 h-3.5" /> สำเนา
                        </button>
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!window.confirm(`ยืนยันลบชุดข้อสอบ "${qz.title}" ใช่หรือไม่? (ข้อมูลข้อสอบทั้งหมดในชุดนี้จะถูกลบ)`)) {
                              return;
                            }
                            await deleteQuiz(qz.id);
                            const next = quizzes.filter((item) => item.id !== qz.id);
                            setQuizzes(next);
                            if (selectedQuiz?.id === qz.id) setSelectedQuiz(next[0] ?? null);
                          }}
                          className="inline-flex items-center gap-1 font-bold text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> ลบ
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Smart Paste Question Importer + Single Question Editor + Question List */}
          <div className="lg:col-span-8 space-y-6">
            <>
              <SmartPasteQuestionImporter
                quizTitle={selectedQuiz?.title}
                isLoggedIn={Boolean(user)}
                onRequestTeacherLogin={() => {
                  setShowTeacherAuthBox(true);
                  document.getElementById('teacher-auth-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
                onSaveBulkQuestions={async (drafts: ParsedDraftQuestion[]) => {
                  if (!user) {
                    const msg = 'กรุณาเข้าสู่ระบบบัญชีคุณครูด้านบนก่อนบันทึกโจทย์ลงฐานข้อมูล';
                    setError(msg);
                    setShowTeacherAuthBox(true);
                    document.getElementById('teacher-auth-section')?.scrollIntoView({ behavior: 'smooth' });
                    throw new Error(msg);
                  }
                  setError(null);
                  setSaveSuccess(null);
                  let targetQuiz = selectedQuiz;
                  if (!targetQuiz) {
                    targetQuiz = await createQuiz(user.id, {
                      title: quizTitle.trim() || `ชุดข้อสอบใหม่ (${new Date().toLocaleDateString('th-TH')})`,
                      description: 'สร้างจากระบบวางโจทย์อัตโนมัติ',
                      subject: quizSubject || 'ทั่วไป',
                      game_mode: 'adventure_standard',
                      classroom_id: null,
                    });
                  }
                  const startOrder = Math.max(-1, ...(targetQuiz.questions ?? []).map((q) => q.sort_order)) + 1;
                  for (let i = 0; i < drafts.length; i++) {
                    const d = drafts[i];
                    await saveQuestionWithChoices(targetQuiz.id, {
                      question_type: d.image_url ? 'image_quiz' : d.question_type,
                      prompt: d.prompt,
                      image_url: d.image_url,
                      explanation: d.explanation,
                      time_limit_seconds: d.time_limit_seconds,
                      base_points: d.base_points,
                      speed_bonus_max: d.speed_bonus_max,
                      sort_order: startOrder + i,
                      choices: d.choices,
                    });
                  }
                  const refreshed = await fetchTeacherQuizzes(user.id);
                  setQuizzes(refreshed);
                  setSelectedQuiz(refreshed.find((q) => q.id === targetQuiz!.id) ?? null);
                  setSaveSuccess(`✅ บันทึกโจทย์ทั้ง ${drafts.length} ข้อลงฐานข้อมูลเรียบร้อยแล้ว!`);
                  setTimeout(() => {
                    document.getElementById('saved-questions-section')?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }, 150);
                }}
              />

              {/* Saved Questions List inside Selected Quiz (Prominent right below Smart Paste!) */}
              {selectedQuiz && (
                <div id="saved-questions-section" className="card-game p-5 sm:p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-slate-200 pb-3">
                    <div className="space-y-1.5 flex-1 min-w-[220px]">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-950 border-2 border-emerald-700 text-xs font-extrabold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        <span>
                          บันทึกแล้ว {selectedQuiz.questions?.length ?? 0} ข้อในฐานข้อมูล Supabase
                        </span>
                      </span>

                      {renamingQuizId === selectedQuiz.id ? (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (!user) return;
                            try {
                              setActionLoading(true);
                              setError(null);
                              await updateQuizDetails(selectedQuiz.id, {
                                title: renameQuizDraft,
                                subject: renameQuizSubjectDraft,
                                description: renameQuizDescDraft,
                              });
                              const refreshed = await fetchTeacherQuizzes(user.id);
                              setQuizzes(refreshed);
                              setSelectedQuiz(refreshed.find((q) => q.id === selectedQuiz.id) ?? null);
                              setRenamingQuizId(null);
                              soundEngine.playCoinSound();
                              setSaveSuccess(`✅ บันทึกการแก้ไขชุดข้อสอบ "${renameQuizDraft.trim()}" เรียบร้อยแล้ว!`);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'แก้ไขข้อมูลชุดข้อสอบไม่สำเร็จ');
                            } finally {
                              setActionLoading(false);
                            }
                          }}
                          className="space-y-2 pt-1"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              minLength={2}
                              maxLength={150}
                              value={renameQuizDraft}
                              onChange={(e) => setRenameQuizDraft(e.target.value)}
                              placeholder="ชื่อชุดข้อสอบ"
                              className="rounded-xl border-2 border-slate-900 px-3 py-1.5 text-sm font-bold bg-white"
                              required
                            />
                            <input
                              type="text"
                              value={renameQuizSubjectDraft}
                              onChange={(e) => setRenameQuizSubjectDraft(e.target.value)}
                              placeholder="วิชา / หมวดหมู่"
                              className="rounded-xl border-2 border-slate-900 px-3 py-1.5 text-sm font-bold bg-white"
                            />
                          </div>
                          <input
                            type="text"
                            value={renameQuizDescDraft}
                            onChange={(e) => setRenameQuizDescDraft(e.target.value)}
                            placeholder="คำอธิบายชุดข้อสอบ"
                            className="w-full rounded-xl border-2 border-slate-900 px-3 py-1.5 text-xs font-semibold bg-white"
                          />
                          <div className="flex items-center gap-2">
                            <button type="submit" disabled={actionLoading} className="btn-game-green text-xs py-1.5 px-3">
                              บันทึกข้อมูลชุดข้อสอบ
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingQuizId(null)}
                              className="px-3 py-1.5 rounded-xl border-2 border-slate-900 bg-slate-200 text-xs font-bold"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-game text-xl font-bold text-slate-900">
                            คำถามในชุด "{selectedQuiz.title}" ({selectedQuiz.questions?.length ?? 0} ข้อ)
                          </h3>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingQuizId(selectedQuiz.id);
                              setRenameQuizDraft(selectedQuiz.title);
                              setRenameQuizSubjectDraft(selectedQuiz.subject || 'ทั่วไป');
                              setRenameQuizDescDraft(selectedQuiz.description || '');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border-2 border-slate-900 bg-amber-100 hover:bg-kw-yellow text-xs font-bold"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>แก้ไขข้อมูลชุดข้อสอบ</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleLaunchGameRoom(selectedQuiz)}
                      className="btn-game-green text-xs sm:text-sm py-2.5 px-5 flex items-center gap-1.5 shrink-0"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>▶️ เปิดห้องสอบชุดนี้เลย (ตั้งรหัส PIN)</span>
                    </button>
                  </div>

                  {(selectedQuiz.questions ?? []).length === 0 ? (
                    <p className="text-sm text-slate-600">ยังไม่มีคำถามในชุดนี้ กรุณาวางโจทย์ด้านบนหรือเพิ่มจากฟอร์มด้านล่าง</p>
                  ) : (
                    <div className="space-y-3">
                      {(selectedQuiz.questions ?? []).map((q, idx) => {
                        const sortedChoices = (q.answer_choices ?? [])
                          .slice()
                          .sort((a, b) => a.sort_order - b.sort_order);

                        return (
                          <div
                            key={q.id}
                            className="p-4 rounded-2xl bg-white border-2 border-slate-900 flex flex-wrap items-start justify-between gap-3"
                          >
                            <div className="space-y-2 flex-1 min-w-[240px]">
                              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                                <span className="px-2 py-0.5 rounded-lg bg-kw-yellow border border-slate-900">
                                  ข้อที่ {idx + 1} (1 คะแนน)
                                </span>
                                <span className="inline-flex items-center gap-1 text-slate-600">
                                  <Clock className="w-3.5 h-3.5" /> {q.time_limit_seconds}s
                                </span>
                                <span className="text-emerald-700">
                                  EXP เกม: {q.base_points} (+{q.speed_bonus_max} speed)
                                </span>
                              </div>
                              <div className="font-bold text-slate-900">{q.prompt}</div>

                              {sortedChoices.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                                  {sortedChoices.map((ch) => (
                                    <div
                                      key={ch.id}
                                      className={`px-2.5 py-1.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                                        ch.is_correct
                                          ? 'bg-emerald-100 border-emerald-600 text-emerald-950 font-extrabold'
                                          : 'bg-slate-50 border-slate-300 text-slate-700 font-semibold'
                                      }`}
                                    >
                                      <span className="truncate">
                                        {ch.choice_label}. {ch.choice_text}
                                      </span>
                                      {ch.is_correct && (
                                        <span className="shrink-0 text-emerald-700 font-extrabold">✓</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {q.image_url && (
                                <div className="pt-1 flex items-center gap-2">
                                  <img
                                    src={q.image_url}
                                    alt="Question visual"
                                    className="h-20 rounded-xl border-2 border-slate-900 object-contain bg-slate-50"
                                  />
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!user) return;
                                      await updateQuestionImageOnly(q.id, null);
                                      const refreshed = await fetchTeacherQuizzes(user.id);
                                      setQuizzes(refreshed);
                                      setSelectedQuiz(
                                        refreshed.find((item) => item.id === selectedQuiz.id) ?? null
                                      );
                                    }}
                                    className="text-xs font-bold text-red-600 underline"
                                  >
                                    ลบรูปออก
                                  </button>
                                </div>
                              )}
                              {q.explanation && (
                                <div className="text-xs text-slate-600">เฉลย: {q.explanation}</div>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {/* Add or change image on already-saved question anytime! */}
                              <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-2 rounded-xl border-2 border-slate-900 bg-sky-100 hover:bg-sky-200 text-xs font-extrabold text-slate-900">
                                <ImageIcon className="w-4 h-4 text-kw-blue" />
                                <span>{q.image_url ? 'เปลี่ยนรูป' : '+ เพิ่มรูปทีหลัง'}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file || !user) return;
                                    try {
                                      setActionLoading(true);
                                      const url = await uploadQuestionImage(file);
                                      await updateQuestionImageOnly(q.id, url);
                                      const refreshed = await fetchTeacherQuizzes(user.id);
                                      setQuizzes(refreshed);
                                      setSelectedQuiz(
                                        refreshed.find((item) => item.id === selectedQuiz.id) ?? null
                                      );
                                      soundEngine.playPowerUpSound();
                                      setSaveSuccess(`✅ เพิ่มรูปภาพในข้อที่ ${idx + 1} เรียบร้อยแล้ว!`);
                                    } catch (err) {
                                      setError(
                                        err instanceof Error ? err.message : 'เพิ่มรูปทีหลังไม่สำเร็จ'
                                      );
                                    } finally {
                                      setActionLoading(false);
                                    }
                                  }}
                                />
                              </label>

                              <button
                                type="button"
                                onClick={() => {
                                  soundEngine.playClickSound();
                                  setEditingQuestionId(q.id);
                                  setQType(q.question_type);
                                  setQPrompt(q.prompt);
                                  setQImageUrl(q.image_url || '');
                                  setQExplanation(q.explanation || '');
                                  setQTimeLimit(q.time_limit_seconds);
                                  setQBasePoints(q.base_points);
                                  setQSpeedBonus(q.speed_bonus_max);
                                  if (sortedChoices.length > 0) {
                                    setQChoices(
                                      sortedChoices.map((ch, cIdx) => ({
                                        choice_label: ch.choice_label,
                                        choice_text: ch.choice_text,
                                        is_correct: Boolean(ch.is_correct),
                                        sort_order: cIdx,
                                      }))
                                    );
                                  }
                                  document.getElementById('single-question-editor')?.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'start',
                                  });
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border-2 border-slate-900 bg-amber-100 hover:bg-kw-yellow text-xs font-extrabold text-slate-900"
                                title="แก้ไขคำถาม"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>แก้ไข</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleReorderQuestion(q, 'up')}
                                className="p-2 rounded-xl border-2 border-slate-900 bg-slate-100 hover:bg-slate-200"
                                title="เลื่อนขึ้น"
                              >
                                <ArrowUp className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReorderQuestion(q, 'down')}
                                className="p-2 rounded-xl border-2 border-slate-900 bg-slate-100 hover:bg-slate-200"
                                title="เลื่อนลง"
                              >
                                <ArrowDown className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!user) return;
                                  if (!window.confirm(`ยืนยันลบคำถามข้อที่ ${idx + 1} ใช่หรือไม่?`)) return;
                                  await deleteQuestion(q.id);
                                  const refreshed = await fetchTeacherQuizzes(user.id);
                                  setQuizzes(refreshed);
                                  setSelectedQuiz(
                                    refreshed.find((item) => item.id === selectedQuiz.id) ?? null
                                  );
                                }}
                                className="p-2 rounded-xl border-2 border-slate-900 bg-red-100 hover:bg-red-200 text-red-700"
                                title="ลบคำถาม"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <form id="single-question-editor" onSubmit={handleSaveQuestion} className="card-game p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-200 pb-3">
                  <div>
                    <span className="text-xs font-bold text-kw-blue uppercase">
                      {selectedQuiz
                        ? `กำลังจัดการชุดคำถาม: ${selectedQuiz.title}`
                        : 'กรุณาสร้างชุดคำถามทางด้านซ้ายก่อนกดบันทึกข้อสอบ'}
                    </span>
                    <h3 className="font-game text-2xl font-bold">
                      {editingQuestionId ? 'แก้ไขคำถาม' : '+ ฟอร์มใส่คำถามและตัวเลือกคำตอบ'}
                    </h3>
                  </div>

                  {selectedQuiz && (
                    <button
                      type="button"
                      onClick={() => handleLaunchGameRoom(selectedQuiz)}
                      className="btn-game-green text-xs py-2 px-4 flex items-center gap-1.5"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>เปิดห้องแข่งชุดนี้เลย!</span>
                    </button>
                  )}
                </div>

                  {/* Question Type Selector */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { type: 'multiple_choice', label: 'Multiple Choice (4 ตัวเลือก)' },
                      { type: 'true_false', label: 'True / False (ถูก/ผิด)' },
                      { type: 'image_quiz', label: 'คำถามรูปภาพ (Image)' },
                      { type: 'text_quiz', label: 'พิมพ์คำตอบ (Text)' },
                    ].map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => handleQuestionTypeChange(item.type as QuestionType)}
                        className={`p-2.5 rounded-xl border-2 border-slate-900 text-xs font-bold transition ${
                          qType === item.type
                            ? 'bg-kw-blue text-white shadow-sm'
                            : 'bg-white text-slate-700'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                      โจทย์คำถาม (Question Prompt)
                    </label>
                    <textarea
                      rows={2}
                      value={qPrompt}
                      onChange={(e) => setQPrompt(e.target.value)}
                      placeholder="พิมพ์โจทย์คำถามที่นี่..."
                      className="w-full rounded-xl border-2 border-slate-900 p-3 font-semibold text-sm"
                      required
                    />
                  </div>

                  {/* Optional Image URL or Upload */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-8">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        URL รูปภาพประกอบคำถาม (ถ้ามี)
                      </label>
                      <input
                        type="text"
                        value={qImageUrl}
                        onChange={(e) => setQImageUrl(e.target.value)}
                        placeholder="https://images.unsplash.com/..."
                        className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="cursor-pointer w-full inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-slate-900 bg-amber-100 hover:bg-amber-200 px-3 py-2 text-xs font-bold">
                        <ImageIcon className="w-4 h-4" />
                        <span>อัปโหลดขึ้น Supabase Storage</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              setActionLoading(true);
                              const url = await uploadQuestionImage(file);
                              setQImageUrl(url);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'อัปโหลดรูปไม่สำเร็จ');
                            } finally {
                              setActionLoading(false);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Real Exam Scoring Rule & Per-Question Custom Timer */}
                  <div className="p-4 rounded-2xl bg-sky-50 border-3 border-slate-900 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-extrabold uppercase text-slate-900 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-kw-red" />
                        ตั้งเวลาทำข้อสอบของข้อนี้ & ระบบคะแนนคู่ขนาน (คะแนนสอบจริง + คะแนนเกมอัปเลเวล)
                      </span>
                      <span className="px-3 py-1 rounded-full bg-kw-green text-white border-2 border-slate-900 text-xs font-extrabold">
                        📝 คะแนนเก็บข้อสอบจริง: ตอบถูกได้ข้อละ 1 คะแนน
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-6 space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700">
                          เวลาของข้อนี้ (วินาที — ครูกำหนดได้ตามความยาก 5–180 วินาที)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={5}
                            max={180}
                            value={qTimeLimit}
                            onChange={(e) => setQTimeLimit(Number(e.target.value))}
                            className="w-24 rounded-xl border-2 border-slate-900 px-3 py-2 text-sm font-extrabold bg-white text-center"
                          />
                          <div className="flex flex-wrap gap-1">
                            {[15, 20, 30, 45, 60, 90, 120].map((sec) => (
                              <button
                                key={sec}
                                type="button"
                                onClick={() => setQTimeLimit(sec)}
                                className={`px-2 py-1 rounded-lg border-2 border-slate-900 text-[11px] font-bold ${
                                  qTimeLimit === sec ? 'bg-kw-yellow text-slate-900' : 'bg-white text-slate-700'
                                }`}
                              >
                                {sec} วิ
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          EXP เกมพื้นฐาน (ใช้เพิ่มเลเวลในเกม)
                        </label>
                        <input
                          type="number"
                          min={100}
                          max={10000}
                          step={100}
                          value={qBasePoints}
                          onChange={(e) => setQBasePoints(Number(e.target.value))}
                          className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-sm font-bold bg-white"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          โบนัสความเร็วในเกมสูงสุด
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={5000}
                          step={50}
                          value={qSpeedBonus}
                          onChange={(e) => setQSpeedBonus(Number(e.target.value))}
                          className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-sm font-bold bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Choices Editor */}
                  <div className="space-y-2">
                    <label className="block text-xs font-extrabold uppercase text-slate-700">
                      ตัวเลือกคำตอบ (คลิกปุ่มวงกลมหน้าข้อที่ถูกต้อง)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {qChoices.map((ch, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-2xl border-3 border-slate-900 flex items-center gap-2 ${
                            ch.is_correct ? 'bg-emerald-100' : 'bg-white'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setQChoices((prev) =>
                                prev.map((item, i) => ({
                                  ...item,
                                  is_correct: i === idx,
                                }))
                              )
                            }
                            className={`w-8 h-8 rounded-xl border-2 border-slate-900 font-game font-extrabold text-sm flex items-center justify-center shrink-0 ${
                              ch.is_correct ? 'bg-kw-green text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                            title="ตั้งเป็นคำตอบที่ถูกต้อง"
                          >
                            {ch.choice_label}
                          </button>
                          <input
                            type="text"
                            value={ch.choice_text}
                            onChange={(e) =>
                              setQChoices((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, choice_text: e.target.value } : item
                                )
                              )
                            }
                            placeholder={`ตัวเลือก ${ch.choice_label}`}
                            className="w-full bg-transparent font-semibold text-sm focus:outline-none"
                            required
                          />
                          {ch.is_correct && <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      คำอธิบายเฉลยหลังหมดเวลา (Explanation)
                    </label>
                    <input
                      type="text"
                      value={qExplanation}
                      onChange={(e) => setQExplanation(e.target.value)}
                      placeholder="อธิบายเหตุผลของคำตอบที่ถูกต้องให้นักเรียนเข้าใจ..."
                      className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-sm"
                    />
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-red-100 border-2 border-red-600 text-red-900 text-xs font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {saveSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-100 border-2 border-emerald-600 text-emerald-950 text-xs font-bold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
                      <span>{saveSuccess}</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    {editingQuestionId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQuestionId(undefined);
                          setQPrompt('');
                          setQExplanation('');
                        }}
                        className="px-4 py-2 rounded-xl border-2 border-slate-900 bg-slate-200 text-xs font-bold"
                      >
                        ยกเลิกการแก้ไข
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="btn-game-yellow text-sm py-2.5 px-6"
                    >
                      {editingQuestionId ? 'บันทึกการแก้ไขคำถาม' : '+ บันทึกคำถามลงในชุดข้อสอบ'}
                    </button>
                  </div>
                </form>
              </>
          </div>
        </div>
      )}

      {/* TAB 3: CLASSROOMS & STUDENTS */}
      {!loading && activeTab === 'classrooms' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-6">
            <form onSubmit={handleCreateClassroom} className="card-game p-6 space-y-3">
              <h3 className="font-game text-xl font-bold">+ สร้างห้องเรียนใหม่</h3>
              <div>
                <label className="block text-xs font-bold mb-1">ชื่อห้องเรียน</label>
                <input
                  type="text"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="เช่น ห้อง ม.1/1 วิทย์-คณิต"
                  className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-sm font-semibold"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">ระดับชั้น</label>
                <input
                  type="text"
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">คำอธิบาย</label>
                <input
                  type="text"
                  value={classDesc}
                  onChange={(e) => setClassDesc(e.target.value)}
                  placeholder="รายละเอียดเพิ่มเติม..."
                  className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <button type="submit" disabled={actionLoading} className="btn-game-green w-full text-sm py-2.5">
                บันทึกห้องเรียน
              </button>
            </form>

            <div className="card-game p-6 space-y-2">
              <h3 className="font-game text-lg font-bold">รายการห้องเรียนของคุณครู</h3>
              {classrooms.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedClassroomId(c.id)}
                  className={`w-full p-3 rounded-2xl border-2 border-slate-900 text-left flex items-center justify-between ${
                    selectedClassroomId === c.id ? 'bg-kw-yellow font-bold' : 'bg-white'
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm">{c.name}</div>
                    <div className="text-xs text-slate-600">{c.grade_level}</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl bg-slate-900 text-kw-yellow font-mono text-xs font-bold">
                    {c.class_code}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 card-game p-6 space-y-4">
            <h3 className="font-game text-2xl font-bold">รายชื่อนักเรียนในห้องเรียน</h3>
            {selectedClassroomId ? (
              <>
                <form onSubmit={handleAddStudent} className="flex flex-wrap gap-2">
                  <input
                    type="email"
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                    placeholder="กรอกอีเมลนักเรียนที่สมัครแล้ว..."
                    className="flex-1 rounded-xl border-2 border-slate-900 px-3 py-2 text-sm font-semibold"
                    required
                  />
                  <input
                    type="text"
                    value={studentNumber}
                    onChange={(e) => setStudentNumber(e.target.value)}
                    placeholder="เลขที่ (เช่น 12)"
                    className="w-28 rounded-xl border-2 border-slate-900 px-3 py-2 text-sm font-semibold"
                  />
                  <button type="submit" disabled={actionLoading} className="btn-game-blue text-xs py-2 px-4">
                    + เพิ่มนักเรียน
                  </button>
                </form>

                <div className="space-y-2">
                  {classroomStudents.length === 0 ? (
                    <p className="text-sm text-slate-600 py-4">
                      ยังไม่มีนักเรียนในห้องนี้ (นักเรียนสามารถเข้าร่วมเกมผ่าน QR Code / Game PIN ได้ทันทีเช่นกัน)
                    </p>
                  ) : (
                    classroomStudents.map((cs) => (
                      <div
                        key={cs.id}
                        className="p-3 rounded-xl bg-white border-2 border-slate-900 flex items-center justify-between text-sm"
                      >
                        <div>
                          <span className="font-bold">{cs.profiles?.display_name || 'Student'}</span>
                          <span className="text-xs text-slate-500 ml-2">{cs.profiles?.email}</span>
                        </div>
                        <div className="text-xs font-bold">
                          Lv.{cs.profiles?.level ?? 1} | {cs.profiles?.total_score ?? 0} pts
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-600">กรุณาเลือกหรือสร้างห้องเรียนก่อน</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: PERSISTENT EXAM HISTORY, AUDIT REPORT & REAL-TIME EXPORT */}
      {!loading && activeTab === 'history' && (
        <div className="space-y-6">
          <div className="card-game p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-game text-2xl font-bold">
                  ประวัติการจัดสอบทั้งหมด ({examRooms.length} ครั้ง) & รายงานตรวจรายข้อ
                </h2>
                <p className="text-xs font-bold text-slate-600">
                  บันทึกถาวรใน Supabase ไม่หาย สามารถกดดู Report ตรวจคำตอบรายข้อของเด็กทุกคน ดาวน์โหลด Excel/CSV หรือกดนำข้อสอบชุดเดิมมาออกสอบใหม่ได้ตลอด
                </p>
              </div>
              <button
                type="button"
                onClick={loadDashboardData}
                className="px-3.5 py-2 rounded-xl bg-white border-2 border-slate-900 text-xs font-extrabold flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> รีเฟรชประวัติ
              </button>
            </div>

            {examRooms.length === 0 ? (
              <p className="text-sm text-slate-600 py-6">
                ยังไม่มีประวัติการเปิดห้องสอบ (เมื่อเปิดห้องสอบแล้ว ประวัติจะถูกบันทึกถาวรที่นี่อัตโนมัติ)
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b-3 border-slate-900 bg-amber-100 font-game text-xs">
                      <th className="p-3">วัน-เวลาที่เปิดสอบ</th>
                      <th className="p-3">ชื่อชุดข้อสอบ</th>
                      <th className="p-3">รูปแบบการสอบ</th>
                      <th className="p-3">PIN</th>
                      <th className="p-3 text-center">ผู้เข้าสอบ</th>
                      <th className="p-3 text-right">รายงาน & ออกสอบใหม่</th>
                    </tr>
                  </thead>
                  <tbody>
                    {examRooms.map((rm) => {
                      const isSerious = rm.game_mode === 'serious_exam';
                      const matchingQuiz = quizzes.find((q) => q.id === rm.quiz_id);
                      return (
                        <tr key={rm.id} className="border-b border-slate-300 hover:bg-white/70">
                          <td className="p-3 text-xs font-semibold text-slate-700 whitespace-nowrap">
                            {new Date(rm.created_at).toLocaleString('th-TH', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </td>
                          <td className="p-3 font-bold text-slate-900">{rm.quizzes?.title || 'ชุดข้อสอบ'}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border border-slate-900 ${
                                isSerious
                                  ? 'bg-slate-900 text-kw-yellow'
                                  : 'bg-kw-orange text-white'
                              }`}
                            >
                              {isSerious ? '📝 สอบวัดความรู้จริง' : '🏆 กิจกรรมเก็บคะแนน'}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-extrabold text-kw-blue">{rm.pin_code}</td>
                          <td className="p-3 text-center font-extrabold">{rm.participant_count} คน</td>
                          <td className="p-3 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={loadingReport}
                                onClick={async () => {
                                  setLoadingReport(true);
                                  setError(null);
                                  try {
                                    const rep = await fetchRoomDetailedReport(rm.id);
                                    setInspectingReport(rep);
                                    setExpandedStudentId(null);
                                  } catch (err) {
                                    setError(
                                      err instanceof Error
                                        ? err.message
                                        : 'ไม่สามารถโหลด Report รายข้อได้'
                                    );
                                  } finally {
                                    setLoadingReport(false);
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-kw-blue text-white font-bold text-xs border-2 border-slate-900"
                              >
                                <Eye className="w-3.5 h-3.5" /> ตรวจรายข้อ
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const rep = await fetchRoomDetailedReport(rm.id);
                                    exportDetailedRoomReportExcel(rep);
                                  } catch (err) {
                                    setError(
                                      err instanceof Error ? err.message : 'ดาวน์โหลด Excel ไม่สำเร็จ'
                                    );
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-kw-green text-white font-bold text-xs border-2 border-slate-900"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadRoomCSV(rm.id, rm.quizzes?.title || 'ExamReport')
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white text-slate-900 font-bold text-xs border-2 border-slate-900"
                              >
                                <Download className="w-3.5 h-3.5" /> CSV
                              </button>
                              {matchingQuiz && (
                                <button
                                  type="button"
                                  onClick={() => handleLaunchGameRoom(matchingQuiz)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-kw-yellow text-slate-900 font-bold text-xs border-2 border-slate-900"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" /> ออกสอบใหม่
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detailed Per-Student Question-by-Question Audit Report Viewer (Item 10) */}
          {inspectingReport && (
            <div className="card-game p-6 bg-white space-y-4 border-4 border-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-slate-200 pb-3">
                <div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-kw-blue text-white text-xs font-extrabold">
                    📊 DETAILED QUESTION-BY-QUESTION AUDIT REPORT
                  </span>
                  <h3 className="font-game text-2xl font-extrabold text-slate-900 mt-1">
                    {inspectingReport.quiz_title} (PIN: {inspectingReport.room.pin_code})
                  </h3>
                  <p className="text-xs font-bold text-slate-600">
                    คลิกที่ชื่อนักเรียนแต่ละคนเพื่อดูรายละเอียดว่าแต่ละข้อเด็กตอบตัวเลือกไหนเทียบกับเฉลยที่ถูกต้อง
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportDetailedRoomReportExcel(inspectingReport)}
                    className="btn-game-green text-xs py-2 px-4 flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> โหลดรายงานนี้เป็น Excel (.xls)
                  </button>
                  <button
                    type="button"
                    onClick={() => exportDetailedRoomReportCSV(inspectingReport)}
                    className="px-3.5 py-2 rounded-xl bg-white border-2 border-slate-900 font-bold text-xs flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectingReport(null)}
                    className="p-2 rounded-xl bg-slate-100 border-2 border-slate-900"
                    title="ปิดรายงาน"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {inspectingReport.rows.length === 0 ? (
                <p className="text-sm font-bold text-slate-600 py-4">
                  ยังไม่มีนักเรียนเข้าสอบในห้องนี้
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white font-game">
                        <th className="p-2.5">ชื่อนักเรียน (#รหัส 3 ตัวหลัง)</th>
                        <th className="p-2.5 text-center">สถานะ</th>
                        {inspectingReport.questions.map((q, qIdx) => (
                          <th key={q.id} className="p-2 text-center">
                            ข้อ {qIdx + 1}
                          </th>
                        ))}
                        <th className="p-2.5 text-center">คะแนนสอบจริง</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectingReport.rows.map((st) => {
                        const p = st.participant;
                        const isExpanded = expandedStudentId === p.id;
                        return (
                          <React.Fragment key={p.id}>
                            <tr
                              onClick={() => setExpandedStudentId(isExpanded ? null : p.id)}
                              className={`border-b border-slate-200 cursor-pointer transition ${
                                p.is_disqualified
                                  ? 'bg-red-50 hover:bg-red-100'
                                  : isExpanded
                                    ? 'bg-amber-100'
                                    : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="p-2.5 font-extrabold text-slate-900 whitespace-nowrap">
                                {isExpanded ? '▼ ' : '▶ '}
                                {p.nickname}
                              </td>
                              <td className="p-2.5 text-center whitespace-nowrap">
                                {p.is_disqualified ? (
                                  <span className="px-2 py-0.5 rounded-full bg-red-600 text-white font-extrabold text-[10px]">
                                    ทุจริต (0)
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-extrabold text-[10px]">
                                    ปกติ
                                  </span>
                                )}
                              </td>
                              {st.cells.map((ans) => (
                                <td key={ans.question_id} className="p-2 text-center font-extrabold">
                                  {ans.unanswered ? (
                                    <span className="text-slate-400">–</span>
                                  ) : ans.is_correct ? (
                                    <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                      ✓
                                    </span>
                                  ) : (
                                    <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-700">
                                      ✗
                                    </span>
                                  )}
                                </td>
                              ))}
                              <td className="p-2.5 text-center font-game text-sm font-extrabold text-emerald-800 whitespace-nowrap">
                                {p.is_disqualified ? 0 : st.real_exam_score} / {st.total_questions}
                              </td>
                            </tr>

                            {/* Expanded Per-Question Exact Answer Audit */}
                            {isExpanded && (
                              <tr className="bg-amber-50/70">
                                <td
                                  colSpan={inspectingReport.questions.length + 3}
                                  className="p-3 border-b-2 border-slate-900"
                                >
                                  <div className="space-y-2">
                                    <div className="font-game text-xs font-extrabold text-slate-900">
                                      🔍 รายละเอียดคำตอบรายข้อของ {p.nickname}:
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {st.cells.map((ans) => (
                                        <div
                                          key={ans.question_id}
                                          className={`p-2.5 rounded-xl border-2 text-xs space-y-1 ${
                                            ans.unanswered
                                              ? 'bg-slate-100 border-slate-400'
                                              : ans.is_correct
                                                ? 'bg-emerald-50 border-emerald-600'
                                                : 'bg-red-50 border-red-500'
                                          }`}
                                        >
                                          <div className="font-extrabold text-slate-900">
                                            ข้อ {ans.question_number}: {ans.prompt}
                                          </div>
                                          <div>
                                            <span className="font-bold text-slate-600">เด็กตอบ: </span>
                                            <span
                                              className={`font-extrabold ${
                                                ans.unanswered
                                                  ? 'text-slate-500'
                                                  : ans.is_correct
                                                    ? 'text-emerald-800'
                                                    : 'text-red-700'
                                              }`}
                                            >
                                              {ans.selected_text}
                                            </span>
                                          </div>
                                          <div>
                                            <span className="font-bold text-slate-600">เฉลยที่ถูก: </span>
                                            <span className="font-extrabold text-emerald-900">
                                              {ans.correct_text}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* LAUNCH EXAM ROOM MODAL (Custom 6-Digit Exam PIN + Mandatory Teacher Lobby Lock) */}
      {launchModalQuiz && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmLaunchGameRoom}
            className="card-game max-w-lg w-full max-h-[90dvh] overflow-y-auto p-5 sm:p-6 bg-gradient-to-b from-kw-cream to-amber-50 space-y-5 relative"
          >
            <button
              type="button"
              onClick={() => setLaunchModalQuiz(null)}
              className="absolute top-4 right-4 p-1.5 rounded-xl bg-white border-2 border-slate-900 hover:bg-slate-100"
              title="ปิดหน้าต่าง"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1 pr-8">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-kw-yellow border-2 border-slate-900 font-game text-xs font-extrabold">
                <KeyRound className="w-3.5 h-3.5 text-kw-red" /> ตั้งรหัสข้อสอบ & เปิดห้องรอสอบ (Lobby)
              </span>
              <h2 className="font-game text-2xl font-extrabold text-slate-900 pt-1">
                {launchModalQuiz.title}
              </h2>
              <p className="text-xs font-bold text-slate-600">
                จำนวนคำถามทั้งหมด {launchModalQuiz.questions?.length ?? 0} ข้อ
              </p>
            </div>

            {/* Exam Mode Picker: Serious Exam vs Activity Game (Items 1 & 2) */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold uppercase text-slate-800">
                เลือกรูปแบบการสอบครั้งนี้
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setLaunchExamMode('serious_exam')}
                  className={`p-3.5 rounded-2xl border-3 border-slate-900 text-left space-y-1 transition ${
                    launchExamMode === 'serious_exam'
                      ? 'bg-slate-900 text-white shadow-block-sm'
                      : 'bg-white text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-game text-sm font-extrabold flex items-center gap-1.5">
                    <span>📝 สอบวัดความรู้จริง</span>
                  </div>
                  <p
                    className={`text-[11px] font-semibold leading-snug ${
                      launchExamMode === 'serious_exam' ? 'text-amber-200' : 'text-slate-600'
                    }`}
                  >
                    จริงจัง • สลับข้อรายคน • ไม่มีโจมตี • ไม่เฉลยคำตอบ • นับเฉพาะคะแนนสอบจริง
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setLaunchExamMode('activity_game')}
                  className={`p-3.5 rounded-2xl border-3 border-slate-900 text-left space-y-1 transition ${
                    launchExamMode === 'activity_game'
                      ? 'bg-kw-orange text-white shadow-block-sm'
                      : 'bg-white text-slate-800 hover:bg-amber-50'
                  }`}
                >
                  <div className="font-game text-sm font-extrabold flex items-center gap-1.5">
                    <span>🏆 กิจกรรมเก็บคะแนนสั้นๆ</span>
                  </div>
                  <p
                    className={`text-[11px] font-semibold leading-snug ${
                      launchExamMode === 'activity_game' ? 'text-amber-50' : 'text-slate-600'
                    }`}
                  >
                    แข่งขันสนุก • มีโพเดียมทุกข้อ • เลือกเพื่อนโจมตีแต้มเกมได้ • พลัง RPG &amp; Lucky Block
                  </p>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-extrabold uppercase text-slate-800">
                ตั้งรหัสข้อสอบ (Exam PIN 6 หลัก)
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={customExamPin}
                  onChange={(e) => {
                    setLaunchModalError(null);
                    setCustomExamPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                  }}
                  placeholder="เช่น 123456 (หรือเว้นว่างเพื่อสุ่ม)"
                  className="flex-1 min-w-[180px] rounded-2xl border-3 border-slate-900 px-4 py-3 font-game text-2xl font-extrabold tracking-widest text-center bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClickSound();
                    setLaunchModalError(null);
                    setCustomExamPin(generateRandomExamPin());
                  }}
                  className="px-4 py-3 rounded-2xl bg-sky-100 hover:bg-sky-200 border-3 border-slate-900 font-game font-extrabold text-xs flex items-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4 text-kw-blue" />
                  <span>🎲 สุ่มรหัส 6 หลัก</span>
                </button>
              </div>
              <p className="text-[11px] font-bold text-slate-600">
                (ปล่อยว่างเพื่อสุ่มอัตโนมัติ หรือพิมพ์เลข 6 หลักที่ตั้งเอง เช่น 123456 — สามารถแก้ไขอีกครั้งในหน้า Lobby ได้)
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-100 border-3 border-emerald-700 text-emerald-950 text-xs font-bold flex items-start gap-2">
              <Lock className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>
                🔒 โหมดครูคุมสอบ: ห้องจะเปิดค้างไว้ที่หน้า Lobby เสมอ นักเรียนจะยังไม่เห็นข้อสอบจนกว่าคุณครูจะกดปุ่ม{' '}
                <strong>"▶️ ครูสั่งเริ่มสอบ!"</strong> ด้วยตัวเองทุกครั้ง
              </span>
            </div>

            {launchModalError && (
              <div className="p-3 rounded-xl bg-red-100 border-2 border-red-600 text-red-900 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{launchModalError}</span>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setLaunchModalQuiz(null)}
                className="px-4 py-2.5 rounded-2xl bg-white hover:bg-slate-100 border-2 border-slate-900 font-bold text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="btn-game-green text-sm py-2.5 px-6 flex items-center gap-2"
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>กำลังเปิดห้องรอสอบ...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>🚪 เปิดห้องรอสอบ (เข้าหน้า Lobby)</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
