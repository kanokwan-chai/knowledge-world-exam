import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { motion } from 'framer-motion';
import {
  Users,
  Play,
  SkipForward,
  Trophy,
  Clock,
  CheckCircle2,
  BarChart2,
  Download,
  Flag,
  Sparkles,
  Copy,
  Check,
  AlertCircle,
  ShieldAlert,
  RotateCcw,
  Lock,
  KeyRound,
  RefreshCw,
  FileSpreadsheet,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AvatarRenderer } from '../components/avatar/AvatarRenderer';
import { soundEngine } from '../lib/soundEngine';
import { generateRandomExamPin, isTeacherGateUnlocked } from '../lib/securityGuard';
import {
  advanceGameQuestionRPC,
  createGameRoomRPC,
  deleteRoomParticipant,
  exportDetailedRoomReportCSV,
  exportDetailedRoomReportExcel,
  exportScoresToCSV,
  fetchGameRoomById,
  fetchQuestionAnswersForHost,
  fetchRoomDetailedReport,
  fetchRoomParticipants,
  fetchRoomScoreReport,
  fetchTeacherQuizzes,
  finalizeGameRoomRPC,
  getPublicQuestionPayloadRPC,
  pardonParticipantRPC,
  subscribeToGameRoomRealtime,
  updateGameRoomMode,
  updateGameRoomPin,
  updateRoomStatus,
} from '../services/gameEngineService';
import {
  ExamSessionMode,
  GameParticipant,
  GameRoom,
  PublicQuestionPayload,
  Quiz,
  RealtimeBroadcastEvent,
  RoomDetailedReport,
} from '../types/database';

export const TeacherGameHostPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [room, setRoom] = useState<GameRoom | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [participants, setParticipants] = useState<GameParticipant[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [questionPayload, setQuestionPayload] = useState<PublicQuestionPayload | null>(null);
  const [answersForCurrentQ, setAnswersForCurrentQ] = useState<
    Array<{ selected_choice_id: string | null; is_correct: boolean }>
  >([]);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingPin, setEditingPin] = useState<string>('');
  const [pinSaving, setPinSaving] = useState<boolean>(false);
  const [pinNotice, setPinNotice] = useState<string | null>(null);
  const [modeSaving, setModeSaving] = useState<boolean>(false);
  const [liveReport, setLiveReport] = useState<RoomDetailedReport | null>(null);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  const broadcastRef = useRef<((event: RealtimeBroadcastEvent) => Promise<void>) | null>(null);

  const loadRoomState = useCallback(async () => {
    if (!roomId) return;
    try {
      const rm = await fetchGameRoomById(roomId);
      if (!rm) {
        setError('ไม่พบห้องแข่งขันนี้');
        return;
      }
      setRoom(rm);

      const parts = await fetchRoomParticipants(roomId);
      setParticipants(parts);

      if (user) {
        const teacherQuizzes = await fetchTeacherQuizzes(user.id);
        const foundQuiz = teacherQuizzes.find((q) => q.id === rm.quiz_id) ?? null;
        setQuiz(foundQuiz);
      }

      if (rm.current_question_id) {
        const qPay = await getPublicQuestionPayloadRPC(roomId);
        setQuestionPayload(qPay);
        const ans = await fetchQuestionAnswersForHost(roomId, rm.current_question_id);
        setAnswersForCurrentQ(ans);
      }

      if (rm.status !== 'lobby') {
        const rep = await fetchRoomDetailedReport(roomId).catch(() => null);
        if (rep) setLiveReport(rep);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดห้องเกม');
    }
  }, [roomId, user]);

  useEffect(() => {
    loadRoomState();
  }, [loadRoomState]);

  // Realtime Subscription
  useEffect(() => {
    if (!roomId || !user) return;

    const sub = subscribeToGameRoomRealtime(
      roomId,
      {
        id: user.id,
        nickname: profile?.display_name || 'Teacher Host',
        role: 'teacher',
      },
      {
        onRoomUpdated: (updatedRoom) => {
          setRoom(updatedRoom);
          getPublicQuestionPayloadRPC(roomId).then(setQuestionPayload).catch(() => null);
        },
        onParticipantsChanged: () => {
          fetchRoomParticipants(roomId).then(setParticipants).catch(() => null);
        },
        onAnswerCountChanged: () => {
          if (room?.current_question_id) {
            fetchQuestionAnswersForHost(roomId, room.current_question_id)
              .then(setAnswersForCurrentQ)
              .catch(() => null);
          }
          fetchRoomParticipants(roomId).then(setParticipants).catch(() => null);
        },
        onBroadcastEvent: (ev) => {
          if (
            ev.type === 'ANSWER_SUBMITTED' ||
            ev.type === 'POWER_USED' ||
            ev.type === 'CHEATING_DISQUALIFIED'
          ) {
            if (ev.type === 'CHEATING_DISQUALIFIED') {
              soundEngine.playWrongSound();
            }
            fetchRoomParticipants(roomId).then(setParticipants).catch(() => null);
            if (room?.current_question_id) {
              fetchQuestionAnswersForHost(roomId, room.current_question_id)
                .then(setAnswersForCurrentQ)
                .catch(() => null);
            }
          }
        },
        onPresenceSync: (ids) => setOnlineIds(ids),
      }
    );

    broadcastRef.current = sub.broadcast;
    return () => sub.unsubscribe();
  }, [roomId, user, profile?.display_name, room?.current_question_id]);

  // Question Countdown Timer Display (Never auto-reveals Q1 so students can auto-advance across Q1..QN)
  useEffect(() => {
    if (!room || room.status !== 'question_active' || !room.question_ends_at) {
      setSecondsLeft(0);
      return;
    }

    const tick = () => {
      const diffMs = new Date(room.question_ends_at!).getTime() - Date.now();
      const secs = Math.max(0, Math.ceil(diffMs / 1000));
      setSecondsLeft(secs);
    };

    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [room?.status, room?.question_ends_at]);

  // Keep Lobby PIN editor synced with live room PIN
  useEffect(() => {
    if (room?.pin_code) {
      setEditingPin(room.pin_code);
    }
  }, [room?.pin_code]);

  // 3-second Polling Fallback for Lobby participants, active answers & real-time audit report
  useEffect(() => {
    if (!roomId || !room) return;
    const interval = setInterval(() => {
      fetchRoomParticipants(roomId).then(setParticipants).catch(() => null);
      if (room.current_question_id) {
        fetchQuestionAnswersForHost(roomId, room.current_question_id)
          .then(setAnswersForCurrentQ)
          .catch(() => null);
      }
      if (room.status !== 'lobby') {
        fetchRoomDetailedReport(roomId)
          .then(setLiveReport)
          .catch(() => null);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [roomId, room?.status, room?.current_question_id]);

  const handleStartOrNextQuestion = async (nextIndex: number) => {
    if (!roomId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await advanceGameQuestionRPC(roomId, nextIndex);
      setRoom(updated);
      setAnswersForCurrentQ([]);
      const qPay = await getPublicQuestionPayloadRPC(roomId);
      setQuestionPayload(qPay);

      await broadcastRef.current?.({
        type: 'ROOM_STATUS_CHANGED',
        status: 'question_active',
        question_index: nextIndex,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถเริ่มคำถามถัดไปได้');
    } finally {
      setBusy(false);
    }
  };

  const handleRevealAnswer = async () => {
    if (!roomId || !room) return;
    setBusy(true);
    try {
      const updated = await updateRoomStatus(roomId, 'question_reveal');
      setRoom(updated);
      const qPay = await getPublicQuestionPayloadRPC(roomId);
      setQuestionPayload(qPay);
      if (room.current_question_id) {
        const ans = await fetchQuestionAnswersForHost(roomId, room.current_question_id);
        setAnswersForCurrentQ(ans);
      }
      await broadcastRef.current?.({
        type: 'ROOM_STATUS_CHANGED',
        status: 'question_reveal',
        question_index: room.current_question_index,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถแสดงเฉลยได้');
    } finally {
      setBusy(false);
    }
  };

  const handleShowLeaderboard = async () => {
    if (!roomId || !room) return;
    setBusy(true);
    try {
      const updated = await updateRoomStatus(roomId, 'leaderboard');
      setRoom(updated);
      const parts = await fetchRoomParticipants(roomId);
      setParticipants(parts);
      soundEngine.playVictoryFanfare();
      await broadcastRef.current?.({
        type: 'ROOM_STATUS_CHANGED',
        status: 'leaderboard',
        question_index: room.current_question_index,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleFinishGame = async () => {
    if (!roomId) return;
    setBusy(true);
    try {
      await finalizeGameRoomRPC(roomId);
      const rm = await fetchGameRoomById(roomId);
      setRoom(rm);
      const parts = await fetchRoomParticipants(roomId);
      setParticipants(parts);
      await broadcastRef.current?.({ type: 'GAME_FINISHED' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'จบเกมไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateLobbyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room || room.status !== 'lobby') return;
    setPinSaving(true);
    setError(null);
    setPinNotice(null);
    try {
      const updated = await updateGameRoomPin(room.id, editingPin);
      setRoom(updated);
      soundEngine.playCoinSound();
      setPinNotice(`✅ ตั้งรหัสข้อสอบใหม่เป็น ${updated.pin_code} เรียบร้อย! (QR Code อัปเดตแล้ว)`);
      await broadcastRef.current?.({
        type: 'ROOM_STATUS_CHANGED',
        status: updated.status,
        question_index: updated.current_question_index,
      });
    } catch (err) {
      soundEngine.playWrongSound();
      setError(err instanceof Error ? err.message : 'เปลี่ยนรหัสข้อสอบไม่สำเร็จ');
    } finally {
      setPinSaving(false);
    }
  };

  const handleOpenNewExamRound = async () => {
    if (!room) return;
    setBusy(true);
    setError(null);
    try {
      const newRoom = await createGameRoomRPC(
        room.quiz_id,
        room.classroom_id,
        room.game_mode,
        room.allow_guest
      );
      soundEngine.playPowerUpSound();
      navigate(`/teacher/room/${newRoom.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เปิดรอบสอบใหม่ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchExamMode = async (nextMode: ExamSessionMode) => {
    if (!room || room.status !== 'lobby' || modeSaving) return;
    setModeSaving(true);
    setError(null);
    try {
      const updated = await updateGameRoomMode(room.id, nextMode);
      setRoom(updated);
      soundEngine.playClickSound();
      await broadcastRef.current?.({
        type: 'ROOM_STATUS_CHANGED',
        status: updated.status,
        question_index: updated.current_question_index,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เปลี่ยนโหมดการสอบไม่สำเร็จ');
    } finally {
      setModeSaving(false);
    }
  };

  const handleExportLiveExcel = async () => {
    if (!room) return;
    try {
      const rep = liveReport || (await fetchRoomDetailedReport(room.id));
      setLiveReport(rep);
      exportDetailedRoomReportExcel(rep);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ดาวน์โหลด Excel ไม่สำเร็จ');
    }
  };

  const handleExportLiveCSV = async () => {
    if (!room) return;
    try {
      const rep = liveReport || (await fetchRoomDetailedReport(room.id));
      setLiveReport(rep);
      exportDetailedRoomReportCSV(rep);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ดาวน์โหลด CSV ไม่สำเร็จ');
    }
  };

  // Enforce Teacher Security Vault on Host Room route as well (Items 6, 14, 15)
  if (!isTeacherGateUnlocked()) {
    return <Navigate to="/teacher" replace />;
  }

  if (!room) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="card-game p-10 font-bold">กำลังโหลดห้องแข่งขัน...</div>
      </div>
    );
  }

  const joinUrl = `${window.location.origin}/?pin=${room.pin_code}`;
  const totalQuestions = liveReport?.questions.length ?? quiz?.questions?.length ?? 0;
  const hasMoreQuestions = room.current_question_index + 1 < totalQuestions;

  // Guarantee 100% consistency between Top Podium, Summary Table, and Live Audit Table
  const reportRowById = new Map(
    (liveReport?.rows ?? []).map((r) => [r.participant.id, r])
  );
  const syncedParticipants = participants
    .map((p) => {
      if (p.is_disqualified) return { ...p, correct_count: 0, current_score: 0 };
      const row = reportRowById.get(p.id);
      if (!row) return p;
      const mergedCorrect = Math.max(p.correct_count || 0, row.real_exam_score || 0);
      const mergedScore = Math.max(
        p.current_score || 0,
        row.game_exp_score || 0,
        mergedCorrect * 1000
      );
      return {
        ...p,
        correct_count: mergedCorrect,
        current_score: mergedScore,
      };
    })
    .sort((a, b) => {
      const dqDiff = Number(Boolean(a.is_disqualified)) - Number(Boolean(b.is_disqualified));
      if (dqDiff !== 0) return dqDiff;
      if (b.current_score !== a.current_score) return b.current_score - a.current_score;
      if (b.correct_count !== a.correct_count) return b.correct_count - a.correct_count;
      return (a.total_response_ms || 0) - (b.total_response_ms || 0);
    });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24 space-y-6">
      {/* Top Host Control Bar */}
      <div className="card-game p-5 bg-gradient-to-r from-kw-cream via-amber-50 to-sky-50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="px-4 py-2 rounded-2xl bg-kw-yellow border-3 border-slate-900 shadow-block-sm text-center">
            <span className="block text-[10px] font-extrabold uppercase">GAME PIN</span>
            <span className="font-game text-3xl font-extrabold tracking-widest text-slate-900">
              {room.pin_code}
            </span>
          </div>
          <div>
            <h1 className="font-game text-2xl font-extrabold text-slate-900">
              {quiz?.title || 'Knowledge World Live Arena'}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600 mt-0.5">
              <span
                className={`px-2.5 py-0.5 rounded-full border border-slate-900 font-extrabold ${
                  room.game_mode === 'serious_exam'
                    ? 'bg-slate-900 text-kw-yellow'
                    : 'bg-kw-orange text-white'
                }`}
              >
                {room.game_mode === 'serious_exam'
                  ? '📝 โหมดสอบวัดความรู้จริง (ไม่เฉลย / สลับข้อรายคน)'
                  : '🏆 โหมดกิจกรรมเก็บคะแนนสั้นๆ (โพเดียม & โจมตีเพื่อน)'}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="w-4 h-4 text-kw-blue" /> ผู้เล่นในห้อง: {participants.length} คน
              </span>
              <span>•</span>
              <span>สถานะ: {room.status.toUpperCase()}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Real-Time Score Export Anytime During & After Exam (Item 9) */}
          {room.status !== 'lobby' && (
            <>
              <button
                type="button"
                onClick={handleExportLiveExcel}
                className="px-3.5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-slate-900 font-game font-extrabold text-xs flex items-center gap-1.5 shadow-sm"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>โหลดคะแนน Real-time (.xls)</span>
              </button>
              <button
                type="button"
                onClick={handleExportLiveCSV}
                className="px-3 py-2.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 border-2 border-slate-900 font-game font-extrabold text-xs flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </>
          )}
          {room.status === 'lobby' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleStartOrNextQuestion(0)}
              className="btn-game-green text-base py-3 px-6 flex items-center gap-2"
            >
              <Play className="w-5 h-5 fill-white" />
              <span>▶️ ครูสั่งเริ่มสอบเดี๋ยวนี้! (Start Exam · {participants.length} คน)</span>
            </button>
          )}

          {room.status === 'question_active' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleShowLeaderboard}
                className="btn-game-yellow text-sm py-2.5 px-5 flex items-center gap-2"
              >
                <Trophy className="w-4 h-4 text-kw-red" />
                <span>⏹️ หยุดข้อนี้ &amp; โชว์โพเดียมทันที</span>
              </button>
              {room.game_mode !== 'serious_exam' && hasMoreQuestions && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleStartOrNextQuestion(room.current_question_index + 1)}
                  className="btn-game-blue text-sm py-2.5 px-5 flex items-center gap-2"
                >
                  <SkipForward className="w-4 h-4" />
                  <span>เริ่มข้อถัดไป (ข้อ {room.current_question_index + 2}/{totalQuestions})</span>
                </button>
              )}
            </>
          )}

          {room.status === 'question_reveal' && (
            <button
              type="button"
              disabled={busy}
              onClick={handleShowLeaderboard}
              className="btn-game-yellow text-sm py-2.5 px-5 flex items-center gap-2"
            >
              <Trophy className="w-4 h-4" />
              <span>แสดงโพเดียมอันดับ</span>
            </button>
          )}

          {(room.status === 'question_reveal' || room.status === 'leaderboard') &&
            hasMoreQuestions && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleStartOrNextQuestion(room.current_question_index + 1)}
                className="btn-game-green text-sm py-2.5 px-5 flex items-center gap-2"
              >
                <SkipForward className="w-4 h-4" />
                <span>▶️ เริ่มข้อถัดไป (ข้อ {room.current_question_index + 2}/{totalQuestions})</span>
              </button>
            )}

          {room.status !== 'finished' && room.status !== 'lobby' && (
            <button
              type="button"
              disabled={busy}
              onClick={handleFinishGame}
              className="btn-game-red text-sm py-2.5 px-4 flex items-center gap-1.5"
            >
              <Flag className="w-4 h-4" />
              <span>จบการแข่งขัน</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-100 border-2 border-red-600 text-red-900 text-sm font-bold flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* LIVE ANTI-CHEAT PROCTORING MONITOR FOR TEACHER */}
      {participants.some((p) => p.is_disqualified) && (
        <div className="card-game p-5 bg-red-50 border-4 border-red-700 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-game text-lg font-extrabold text-red-900 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-kw-red animate-bounce" />
              <span>
                🚨 แจ้งเตือนระบบคุมสอบ: ตรวจพบผู้เข้าสอบถูกปรับทุจริต ({participants.filter((p) => p.is_disqualified).length} คน)
              </span>
            </h3>
            <span className="text-xs font-bold text-red-700">
              คะแนนถูกปรับเป็น 0 อัตโนมัติ
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {participants
              .filter((p) => p.is_disqualified)
              .map((p) => (
                <div
                  key={p.id}
                  className="p-3 rounded-2xl bg-white border-2 border-red-700 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-bold text-sm text-slate-900">{p.nickname}</div>
                    <div className="text-red-700 font-semibold">
                      สาเหตุ: {p.disqualified_reason || 'สลับแท็บหรือออกจากหน้าจอระหว่างสอบ'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await pardonParticipantRPC(room.id, p.id);
                      const [parts, rep] = await Promise.all([
                        fetchRoomParticipants(room.id),
                        fetchRoomDetailedReport(room.id).catch(() => null),
                      ]);
                      setParticipants(parts);
                      if (rep) setLiveReport(rep);
                      soundEngine.playCoinSound();
                      await broadcastRef.current?.({
                        type: 'STUDENT_PARDONED',
                        participant_id: p.id,
                        nickname: p.nickname,
                      });
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-200 hover:bg-kw-yellow border-2 border-slate-900 font-bold flex items-center gap-1 shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> ปลดล็อกอนุโลม
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* PHASE A: LOBBY VIEW WITH QR CODE & PARTICIPANT ROSTER */}
      {room.status === 'lobby' && (
        <div className="space-y-5">
          {/* Teacher-Controlled Manual Start Banner */}
          <div className="card-game p-5 bg-gradient-to-r from-emerald-100 via-amber-50 to-sky-100 border-4 border-slate-900 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 text-kw-yellow font-game text-xs font-extrabold">
                <Lock className="w-3.5 h-3.5" /> สถานะห้อง: ล็อกอยู่ที่หน้า LOBBY (รอคุณครูกดเริ่ม)
              </div>
              <p className="font-game text-base md:text-lg font-extrabold text-slate-900">
                🔒 ล็อกห้องสอบอยู่ที่หน้า Lobby — นักเรียนทุกคนกำลังรออยู่ ยังไม่เห็นข้อสอบจนกว่าคุณครูจะกดปุ่มเริ่มสอบ
              </p>
              {participants.length === 0 && (
                <p className="text-xs font-bold text-amber-800">
                  💡 แนะนำ: ให้นักเรียนสแกน QR Code หรือกรอกรหัส <strong>{room.pin_code}</strong> เข้ามาก่อน (หรือครูกดเริ่มก่อนได้เช่นกัน)
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => handleStartOrNextQuestion(0)}
              className="btn-game-green w-full sm:w-auto justify-center text-base sm:text-lg py-3.5 px-6 sm:px-7 flex items-center gap-2 shrink-0"
            >
              <Play className="w-5 h-5 fill-white" />
              <span>▶️ ครูสั่งเริ่มสอบเดี๋ยวนี้! ({participants.length} คนพร้อมสอบ)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* QR Code & Inline Custom Exam PIN Editor */}
            <div className="lg:col-span-5 card-game p-4 sm:p-6 text-center space-y-4">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-kw-yellow border-2 border-slate-900 text-xs font-extrabold">
                <Sparkles className="w-3.5 h-3.5" /> สแกน QR CODE เพื่อเข้าห้องทันที
              </span>

              <div className="inline-block max-w-full p-3 sm:p-5 bg-white rounded-3xl border-4 border-slate-900 shadow-block">
                <QRCodeCanvas value={joinUrl} size={220} level="H" includeMargin className="max-w-full h-auto" />
              </div>

              <div className="space-y-1">
                <div className="text-xs font-bold text-slate-600 uppercase">หรือกรอกรหัส GAME PIN</div>
                <div className="font-game text-5xl font-extrabold tracking-widest text-kw-red">
                  {room.pin_code}
                </div>
              </div>

              {/* Inline Custom 6-Digit Exam PIN Editor */}
              <form
                onSubmit={handleUpdateLobbyPin}
                className="p-3.5 rounded-2xl bg-amber-50 border-3 border-slate-900 text-left space-y-2"
              >
                <label className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-kw-red" />
                  <span>✏️ ตั้ง / เปลี่ยนรหัสข้อสอบ 6 หลักเอง (ก่อนกดเริ่มสอบ)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={editingPin}
                    onChange={(e) => {
                      setPinNotice(null);
                      setEditingPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                    }}
                    placeholder="เลข 6 หลัก"
                    className="flex-1 min-w-[120px] rounded-xl border-2 border-slate-900 px-3 py-2 font-game text-lg font-extrabold tracking-widest text-center bg-white"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playClickSound();
                      setPinNotice(null);
                      setEditingPin(generateRandomExamPin());
                    }}
                    className="px-3 py-2 rounded-xl bg-sky-100 hover:bg-sky-200 border-2 border-slate-900 text-xs font-extrabold flex items-center gap-1"
                    title="สุ่มเลข 6 หลัก"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-kw-blue" />
                    <span>🎲 สุ่ม</span>
                  </button>
                  <button
                    type="submit"
                    disabled={pinSaving || editingPin.length !== 6}
                    className="btn-game-yellow text-xs py-2 px-4 disabled:opacity-50"
                  >
                    {pinSaving ? 'กำลังบันทึก...' : 'บันทึกรหัส'}
                  </button>
                </div>
                {pinNotice && (
                  <p className="text-xs font-extrabold text-emerald-800">{pinNotice}</p>
                )}
              </form>

              {/* Inline Exam Mode Toggle in Lobby */}
              <div className="p-3.5 rounded-2xl bg-white border-3 border-slate-900 text-left space-y-2">
                <div className="text-xs font-extrabold text-slate-900">
                  🎛️ สลับรูปแบบการสอบ (ก่อนกดเริ่มสอบ):
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={modeSaving}
                    onClick={() => handleSwitchExamMode('serious_exam')}
                    className={`p-2 rounded-xl border-2 border-slate-900 text-xs font-extrabold transition ${
                      room.game_mode === 'serious_exam'
                        ? 'bg-slate-900 text-kw-yellow'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    📝 สอบวัดความรู้จริง
                  </button>
                  <button
                    type="button"
                    disabled={modeSaving}
                    onClick={() => handleSwitchExamMode('activity_game')}
                    className={`p-2 rounded-xl border-2 border-slate-900 text-xs font-extrabold transition ${
                      room.game_mode !== 'serious_exam'
                        ? 'bg-kw-orange text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-amber-50'
                    }`}
                  >
                    🏆 กิจกรรมเก็บคะแนน
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(joinUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 border-2 border-slate-900 text-xs font-bold flex items-center justify-center gap-2"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'คัดลอกลิงก์เข้าห้องแล้ว!' : 'คัดลอกลิงก์เข้าร่วมห้อง'}</span>
              </button>
            </div>

            {/* Connected Players Grid */}
            <div className="lg:col-span-7 card-game p-6 space-y-4">
              <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
                <h2 className="font-game text-2xl font-bold flex items-center gap-2">
                  <Users className="w-6 h-6 text-kw-green" />
                  <span>นักผจญภัยใน Lobby ({participants.length} คน)</span>
                </h2>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-600">
                  รองรับ 40+ คนพร้อมกันแบบ Real-time
                </span>
              </div>

              {participants.length === 0 ? (
                <div className="py-16 text-center space-y-2 text-slate-600">
                  <p className="font-game text-xl font-bold">กำลังรอนักเรียนสแกน QR Code หรือกรอก Game PIN...</p>
                  <p className="text-xs">รายชื่อและตัวละคร Avatar จะปรากฏขึ้นทันทีโดยไม่ต้องรีเฟรชหน้าเว็บ</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[420px] overflow-y-auto p-1">
                  {participants.map((p) => (
                    <motion.div
                      key={p.id}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="relative p-3 rounded-2xl bg-white border-3 border-slate-900 shadow-sm flex flex-col items-center text-center space-y-1.5"
                    >
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(`ยืนยันลบ "${p.nickname}" ออกจากห้องสอบนี้ใช่หรือไม่?`)) {
                            return;
                          }
                          try {
                            await deleteRoomParticipant(room.id, p.id);
                            setParticipants((prev) => prev.filter((item) => item.id !== p.id));
                            soundEngine.playClickSound();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'ลบนักเรียนไม่สำเร็จ');
                          }
                        }}
                        className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 border border-red-400"
                        title="ลบนักเรียนออกจากห้องนี้"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <AvatarRenderer config={p.avatar_config} size="sm" animate={false} />
                      <div className="font-bold text-sm truncate w-full">{p.nickname}</div>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                          onlineIds.includes(p.id) || p.is_connected
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        พร้อมลุย!
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PHASE B: ACTIVE QUESTION & REVEAL VIEW */}
      {(room.status === 'question_active' || room.status === 'question_reveal') && questionPayload && (
        <div className="space-y-6">
          <div className="card-game p-6 md:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-slate-200 pb-4">
              <span className="px-4 py-1.5 rounded-full bg-kw-yellow border-2 border-slate-900 font-game font-extrabold text-sm">
                คำถามข้อที่ {room.current_question_index + 1} / {totalQuestions}
              </span>

              <div className="flex items-center gap-4">
                <div className="px-4 py-2 rounded-2xl bg-sky-100 border-2 border-slate-900 font-game font-extrabold text-sm flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-kw-blue" />
                  <span>
                    ส่งคำตอบแล้ว: {answersForCurrentQ.length} / {participants.length} คน
                  </span>
                </div>

                <div
                  className={`px-5 py-2 rounded-2xl border-3 border-slate-900 font-game text-2xl font-extrabold flex items-center gap-2 ${
                    secondsLeft <= 5 && room.status === 'question_active'
                      ? 'bg-kw-red text-white animate-bounce'
                      : 'bg-white text-slate-900'
                  }`}
                >
                  <Clock className="w-6 h-6" />
                  <span>{room.status === 'question_active' ? `${secondsLeft}s` : 'หมดเวลา'}</span>
                </div>
              </div>
            </div>

            <div className="text-center space-y-4">
              <h2 className="font-game text-2xl md:text-4xl font-extrabold text-slate-900">
                {questionPayload.question.prompt}
              </h2>
              {questionPayload.question.image_url && (
                <img
                  src={questionPayload.question.image_url}
                  alt="Question Visual"
                  className="max-h-64 mx-auto rounded-2xl border-4 border-slate-900 object-contain bg-white"
                />
              )}
            </div>

            {/* Choices Grid + Answer Distribution Bars on Reveal */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {questionPayload.choices.map((ch, idx) => {
                const countForChoice = answersForCurrentQ.filter(
                  (a) => a.selected_choice_id === ch.id
                ).length;
                const colors = ['bg-kw-red text-white', 'bg-kw-blue text-white', 'bg-kw-yellow text-slate-900', 'bg-kw-green text-white'];
                const isRevealedCorrect = room.status === 'question_reveal' && ch.is_correct;

                return (
                  <div
                    key={ch.id}
                    className={`p-5 rounded-2xl border-4 border-slate-900 shadow-block-sm flex items-center justify-between gap-3 transition ${
                      room.status === 'question_reveal'
                        ? isRevealedCorrect
                          ? 'bg-kw-green text-white ring-4 ring-kw-yellow'
                          : 'bg-slate-200 text-slate-500 opacity-75'
                        : colors[idx % colors.length]
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-black/20 border-2 border-slate-900 font-game text-xl font-extrabold flex items-center justify-center">
                        {ch.choice_label}
                      </span>
                      <span className="font-bold text-lg">{ch.choice_text}</span>
                    </div>

                    {room.status === 'question_reveal' && (
                      <div className="flex items-center gap-2 font-game font-extrabold text-lg">
                        {isRevealedCorrect && <CheckCircle2 className="w-6 h-6" />}
                        <span>{countForChoice} คน</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {room.status === 'question_reveal' && questionPayload.question.explanation && (
              <div className="p-4 rounded-2xl bg-amber-100 border-3 border-slate-900 text-slate-900 font-semibold text-sm">
                <strong className="font-game">💡 คำอธิบายเฉลย: </strong>
                {questionPayload.question.explanation}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PHASE C: LIVE LEADERBOARD & FINAL PODIUM */}
      {(room.status === 'leaderboard' || room.status === 'finished') && (
        <div className="card-game p-6 md:p-8 space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b-4 border-slate-900 pb-4">
            <div>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-kw-yellow border-2 border-slate-900 text-xs font-extrabold">
                <Trophy className="w-4 h-4" />{' '}
                {room.status === 'finished' ? 'FINAL CHAMPIONSHIP PODIUM' : 'LIVE REAL-TIME LEADERBOARD'}
              </span>
              <h2 className="font-game text-3xl font-extrabold mt-1">
                {room.status === 'finished'
                  ? 'สรุปผลการแข่งขัน Knowledge World!'
                  : 'อันดับคะแนนสะสมระหว่างการแข่งขัน'}
              </h2>
              <p className="text-xs text-slate-600">
                กติกาเมื่อคะแนนเท่ากัน: 1) คะแนนรวมสูงสุด 2) จำนวนข้อที่ตอบถูก 3) เวลาตอบเฉลี่ยเร็วที่สุด
              </p>
            </div>

            {room.status === 'finished' && (
              <button
                type="button"
                onClick={async () => {
                  const report = await fetchRoomScoreReport(room.id);
                  exportScoresToCSV(report, quiz?.title || 'KnowledgeWorld');
                }}
                className="btn-game-green text-sm py-2.5 px-5 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>ดาวน์โหลดรายงานคะแนน (CSV)</span>
              </button>
            )}
          </div>

          {/* Top 3 Podium */}
          {syncedParticipants.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-4">
              {/* 2nd Place */}
              {syncedParticipants[1] && (
                <div className="p-5 rounded-3xl bg-slate-100 border-4 border-slate-900 text-center space-y-2 order-2 md:order-1">
                  <div className="inline-block px-3 py-1 rounded-full bg-slate-300 border-2 border-slate-900 font-game font-extrabold text-xs">
                    🥈 อันดับ 2
                  </div>
                  <div className="flex justify-center">
                    <AvatarRenderer config={syncedParticipants[1].avatar_config} size="md" />
                  </div>
                  <div className="font-game text-xl font-extrabold truncate">
                    {syncedParticipants[1].nickname}
                  </div>
                  <div className="font-game text-2xl font-extrabold text-kw-blue">
                    {syncedParticipants[1].current_score.toLocaleString()} pts
                  </div>
                  <div className="text-xs font-bold text-slate-600">
                    ถูก {syncedParticipants[1].correct_count} ข้อ | เฉลี่ย{' '}
                    {syncedParticipants[1].correct_count > 0
                      ? Math.round(syncedParticipants[1].total_response_ms / syncedParticipants[1].correct_count)
                      : 0}{' '}
                    ms
                  </div>
                </div>
              )}

              {/* 1st Place */}
              {syncedParticipants[0] && (
                <div className="p-6 rounded-3xl bg-gradient-to-b from-amber-200 to-kw-yellow border-4 border-slate-900 shadow-block text-center space-y-2 order-1 md:order-2 md:-translate-y-4">
                  <div className="inline-block px-4 py-1 rounded-full bg-kw-red text-white border-2 border-slate-900 font-game font-extrabold text-sm">
                    👑 อันดับ 1 CHAMPION
                  </div>
                  <div className="flex justify-center">
                    <AvatarRenderer config={syncedParticipants[0].avatar_config} size="lg" />
                  </div>
                  <div className="font-game text-2xl font-extrabold truncate">
                    {syncedParticipants[0].nickname}
                  </div>
                  <div className="font-game text-3xl font-extrabold text-slate-900">
                    {syncedParticipants[0].current_score.toLocaleString()} pts
                  </div>
                  <div className="text-xs font-extrabold text-slate-800">
                    ถูก {syncedParticipants[0].correct_count} ข้อ | เฉลี่ย{' '}
                    {syncedParticipants[0].correct_count > 0
                      ? Math.round(syncedParticipants[0].total_response_ms / syncedParticipants[0].correct_count)
                      : 0}{' '}
                    ms
                  </div>
                </div>
              )}

              {/* 3rd Place */}
              {syncedParticipants[2] && (
                <div className="p-5 rounded-3xl bg-orange-100 border-4 border-slate-900 text-center space-y-2 order-3">
                  <div className="inline-block px-3 py-1 rounded-full bg-amber-600 text-white border-2 border-slate-900 font-game font-extrabold text-xs">
                    🥉 อันดับ 3
                  </div>
                  <div className="flex justify-center">
                    <AvatarRenderer config={syncedParticipants[2].avatar_config} size="md" />
                  </div>
                  <div className="font-game text-xl font-extrabold truncate">
                    {syncedParticipants[2].nickname}
                  </div>
                  <div className="font-game text-2xl font-extrabold text-kw-orange">
                    {syncedParticipants[2].current_score.toLocaleString()} pts
                  </div>
                  <div className="text-xs font-bold text-slate-600">
                    ถูก {syncedParticipants[2].correct_count} ข้อ | เฉลี่ย{' '}
                    {syncedParticipants[2].correct_count > 0
                      ? Math.round(syncedParticipants[2].total_response_ms / syncedParticipants[2].correct_count)
                      : 0}{' '}
                    ms
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Top 10 Table */}
          <div className="space-y-2">
            <h3 className="font-game text-xl font-bold">
              ตารางสรุปคะแนนสอบจริง (ข้อละ 1 คะแนน) & คะแนนเกมอัปเลเวล
            </h3>
            <div className="space-y-2">
              {syncedParticipants.slice(0, 10).map((p, i) => (
                <div
                  key={p.id}
                  className={`p-3.5 rounded-2xl border-3 border-slate-900 flex flex-wrap items-center justify-between gap-4 ${
                    p.is_disqualified ? 'bg-red-100' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-slate-900 text-kw-yellow font-game font-extrabold flex items-center justify-center text-sm">
                      #{i + 1}
                    </span>
                    <AvatarRenderer config={p.avatar_config} size="sm" animate={false} />
                    <div>
                      <div className="font-bold text-base flex items-center gap-2">
                        <span>{p.nickname}</span>
                        {p.is_disqualified && (
                          <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-extrabold">
                            🚨 ปรับทุจริต ({p.disqualified_reason || 'สลับแท็บ'})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600">
                        Streak สูงสุด {p.max_streak} | เวลาตอบรวม{' '}
                        {(p.total_response_ms / 1000).toFixed(1)}s
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="px-3.5 py-1.5 rounded-xl bg-kw-green text-white border-2 border-slate-900 text-center">
                      <span className="block text-[10px] font-extrabold uppercase">คะแนนสอบจริง</span>
                      <span className="font-game text-lg font-extrabold">
                        {p.is_disqualified ? 0 : p.correct_count} / {totalQuestions || '-'} คะแนน
                      </span>
                    </div>
                    <div className="px-3.5 py-1.5 rounded-xl bg-kw-yellow text-slate-900 border-2 border-slate-900 text-center">
                      <span className="block text-[10px] font-extrabold uppercase">EXP อัปเลเวล</span>
                      <span className="font-game text-lg font-extrabold">
                        {p.is_disqualified ? 0 : p.current_score.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {room.status === 'finished' && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={handleOpenNewExamRound}
                className="btn-game-green text-base py-3 px-6 flex items-center gap-2"
              >
                <RotateCcw className="w-5 h-5" />
                <span>🔄 เปิดรอบสอบใหม่ (เข้า Lobby รอครูกดเริ่มเองอีกครั้ง)</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/teacher')}
                className="btn-game-blue text-base py-3 px-6"
              >
                กลับสู่หน้า Teacher Dashboard
              </button>
            </div>
          )}
        </div>
      )}

      {/* LIVE QUESTION-BY-QUESTION AUDIT MATRIX (Real-time during exam & after finish — Item 9 & 10) */}
      {room.status !== 'lobby' && liveReport && (
        <div className="card-game p-5 sm:p-6 bg-white space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-200 pb-3">
            <div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-kw-blue text-white text-xs font-extrabold">
                📊 LIVE PER-STUDENT ANSWER AUDIT (อัปเดตเรียลไทม์)
              </span>
              <h3 className="font-game text-xl font-extrabold text-slate-900 mt-1">
                ตารางตรวจคำตอบรายข้อของนักเรียนทุกคน ({liveReport.rows.length} คน)
              </h3>
              <p className="text-xs font-bold text-slate-600">
                คลิกที่ชื่อนักเรียนแต่ละคนเพื่อตรวจสอบว่าแต่ละข้อตอบตัวเลือกใดเทียบกับเฉลยที่ถูกต้อง
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportLiveExcel}
                className="btn-game-green text-xs py-2 px-4 flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>โหลดคะแนน Real-time (Excel .xls)</span>
              </button>
              <button
                type="button"
                onClick={handleExportLiveCSV}
                className="px-3 py-2 rounded-xl bg-white border-2 border-slate-900 font-bold text-xs flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
          </div>

          {liveReport.rows.length === 0 ? (
            <p className="text-sm font-bold text-slate-600 py-4">ยังไม่มีนักเรียนเข้าสอบในห้องนี้</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-game">
                    <th className="p-2.5">ชื่อนักเรียน (#รหัส 3 ตัวหลัง)</th>
                    <th className="p-2.5 text-center">สถานะ</th>
                    {liveReport.questions.map((q, qIdx) => (
                      <th key={q.id} className="p-2 text-center">
                        ข้อ {qIdx + 1}
                      </th>
                    ))}
                    <th className="p-2.5 text-center">คะแนนสอบจริง</th>
                  </tr>
                </thead>
                <tbody>
                  {liveReport.rows.map((st) => {
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

                        {isExpanded && (
                          <tr className="bg-amber-50/70">
                            <td
                              colSpan={liveReport.questions.length + 3}
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
  );
};
