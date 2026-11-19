import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Flame,
  Shield,
  Sparkles,
  Star,
  Diamond,
  Clock,
  Trophy,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  ShieldAlert,
  Maximize2,
  Ban,
  Palette,
  Crosshair,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AvatarRenderer, BUILTIN_AVATAR_CATALOG } from '../components/avatar/AvatarRenderer';
import { LuckyBlockCard } from '../components/luckyblock/LuckyBlockModal';
import { soundEngine } from '../lib/soundEngine';
import { buildShuffledQuestionOrder } from '../lib/securityGuard';
import {
  activatePlayerPowerRPC,
  disqualifyParticipantRPC,
  fetchGameRoomById,
  fetchParticipantPowers,
  fetchQuizQuestionCount,
  fetchRoomParticipants,
  getPublicQuestionPayloadRPC,
  joinGameRoomRPC,
  submitGameAnswerRPC,
  subscribeToGameRoomRealtime,
} from '../services/gameEngineService';
import {
  AnswerChoice,
  AvatarConfig,
  AvatarSlot,
  GameParticipant,
  GameRoom,
  PlayerPowerInstance,
  PowerType,
  PublicQuestionPayload,
  RealtimeBroadcastEvent,
  SubmitAnswerResult,
} from '../types/database';

const POWER_ICON_MAP: Record<PowerType, React.FC<{ className?: string }>> = {
  lightning: Zap,
  fire: Flame,
  shield: Shield,
  lucky: Sparkles,
  star: Star,
  diamond: Diamond,
};

const LOBBY_AVATAR_SLOTS: { key: AvatarSlot; label: string }[] = [
  { key: 'gender', label: 'เพศ' },
  { key: 'base_character', label: 'สีผิว' },
  { key: 'face', label: 'หน้าตา' },
  { key: 'hair', label: 'ทรงผม' },
  { key: 'outfit', label: 'ชุด' },
  { key: 'hat', label: 'หมวก/หู' },
  { key: 'accessory', label: 'ของแต่ง' },
];

// Deterministic per-student choice shuffler to prevent side-by-side copying in the classroom
function shuffleChoicesForStudent(
  choices: AnswerChoice[],
  seedString: string
): AnswerChoice[] {
  const arr = [...choices];
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    hash = (hash * 1664525 + 1013904223) | 0;
    const j = Math.abs(hash) % (i + 1);
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

export const StudentGamePlayPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { avatarConfig, setLocalAvatarConfig, profile, isOnline } = useAuth();

  const [room, setRoom] = useState<GameRoom | null>(null);
  const [participant, setParticipant] = useState<GameParticipant | null>(() => {
    if (!roomId) return null;
    const saved = window.sessionStorage.getItem(`kw_participant_${roomId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [leaderboard, setLeaderboard] = useState<GameParticipant[]>([]);
  const [questionPayload, setQuestionPayload] = useState<PublicQuestionPayload | null>(null);
  const [totalQuestions, setTotalQuestions] = useState<number>(0);
  const [powers, setPowers] = useState<PlayerPowerInstance[]>([]);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState<string>('');
  const [submittedForQuestionId, setSubmittedForQuestionId] = useState<string | null>(null);
  const [lastSubmitResult, setLastSubmitResult] = useState<SubmitAnswerResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [powerNotice, setPowerNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [localDisqualifiedReason, setLocalDisqualifiedReason] = useState<string | null>(null);

  // In-Lobby Avatar Customizer state
  const [showLobbyCustomizer, setShowLobbyCustomizer] = useState<boolean>(false);
  const [lobbyAvatarSlot, setLobbyAvatarSlot] = useState<AvatarSlot>('gender');
  const [savingLobbyAvatar, setSavingLobbyAvatar] = useState<boolean>(false);

  // Activity Mode: Target Friend Selector for PvP Attack
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [battleToast, setBattleToast] = useState<string | null>(null);

  const broadcastRef = useRef<((event: RealtimeBroadcastEvent) => Promise<void>) | null>(null);
  const disqualifyingRef = useRef<boolean>(false);
  const advancingRef = useRef<boolean>(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionMountedAtRef = useRef<number>(Date.now());
  const questionOrderRef = useRef<number[]>([]);
  const questionOrderSeedRef = useRef<string>('');
  const participantRef = useRef<GameParticipant | null>(participant);
  const roomRef = useRef<GameRoom | null>(room);
  const questionPayloadRef = useRef<PublicQuestionPayload | null>(questionPayload);

  const isSeriousExam = room?.game_mode === 'serious_exam';

  useEffect(() => {
    participantRef.current = participant;
  }, [participant]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    questionPayloadRef.current = questionPayload;
  }, [questionPayload]);

  // Cleanup any pending auto-advance timer on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  // Build deterministic unique shuffled question order for this student in this room
  const ensureQuestionOrder = useCallback(async (targetRoom: GameRoom, partId: string): Promise<number[]> => {
    const seed = `${targetRoom.id}_${partId}`;
    if (questionOrderRef.current.length > 0 && questionOrderSeedRef.current === seed) {
      return questionOrderRef.current;
    }
    const count = await fetchQuizQuestionCount(targetRoom.quiz_id).catch(() => 0);
    const safeCount = Math.max(1, count);
    const order = buildShuffledQuestionOrder(safeCount, seed);
    questionOrderRef.current = order;
    questionOrderSeedRef.current = seed;
    setTotalQuestions(safeCount);
    return order;
  }, []);

  const loadStudentQuestionStep = useCallback(
    async (targetRoom: GameRoom, stepIdx: number, partId: string): Promise<boolean> => {
      const order = await ensureQuestionOrder(targetRoom, partId);
      if (stepIdx >= order.length) {
        if (targetRoom.game_mode !== 'serious_exam') {
          soundEngine.playVictoryFanfare();
        }
        setRoom({ ...targetRoom, status: 'finished' });
        setQuestionPayload(null);
        return false;
      }

      const realQuestionIdx = order[stepIdx];
      const qPay = await getPublicQuestionPayloadRPC(targetRoom.id, realQuestionIdx).catch(() => null);
      if (!qPay) {
        setRoom({ ...targetRoom, status: 'finished' });
        setQuestionPayload(null);
        return false;
      }

      if (qPay.total_questions && qPay.total_questions > totalQuestions) {
        setTotalQuestions(qPay.total_questions);
      }

      window.sessionStorage.setItem(`kw_step_${targetRoom.id}`, String(stepIdx));
      questionMountedAtRef.current = Date.now();
      setSelectedChoiceId(null);
      setTextAnswer('');
      setLastSubmitResult(null);
      setSubmittedForQuestionId(null);
      setRoom({
        ...targetRoom,
        status: 'question_active',
        current_question_index: stepIdx,
        current_question_id: qPay.question.id,
        question_started_at: qPay.question_started_at,
        question_ends_at: qPay.question_ends_at,
      });
      setQuestionPayload(qPay);
      return true;
    },
    [ensureQuestionOrder, totalQuestions]
  );

  const applyServerRoomUpdate = useCallback(
    async (incomingRoom: GameRoom) => {
      const prevRoom = roomRef.current;
      const curPart = participantRef.current;

      // Never pull a finished student back into earlier questions unless room itself reset to lobby
      if (prevRoom?.status === 'finished' && incomingRoom.status !== 'finished' && incomingRoom.status !== 'lobby') {
        return;
      }

      if (incomingRoom.status === 'lobby') {
        window.sessionStorage.removeItem(`kw_step_${incomingRoom.id}`);
        if (
          !prevRoom ||
          prevRoom.status !== 'lobby' ||
          prevRoom.pin_code !== incomingRoom.pin_code ||
          prevRoom.game_mode !== incomingRoom.game_mode
        ) {
          setRoom(incomingRoom);
        }
        setQuestionPayload(null);
        return;
      }

      if (incomingRoom.status === 'finished') {
        if (prevRoom?.status !== 'finished') {
          setRoom(incomingRoom);
          setQuestionPayload(null);
        }
        return;
      }

      if (incomingRoom.status === 'question_active') {
        // First time entering active exam from lobby or reload
        if (!prevRoom || prevRoom.status === 'lobby' || !questionPayloadRef.current) {
          if (prevRoom?.status === 'lobby' && incomingRoom.game_mode !== 'serious_exam') {
            soundEngine.playPowerUpSound();
          }
          const partId = curPart?.id || 'guest';
          const savedStepRaw = window.sessionStorage.getItem(`kw_step_${incomingRoom.id}`);
          const savedStep = savedStepRaw ? Math.max(0, Number(savedStepRaw) || 0) : 0;
          await loadStudentQuestionStep(incomingRoom, savedStep, partId);
          return;
        }
        // Student already progressing independently through their own shuffled question order — do NOT overwrite their timer or question!
        return;
      }

      // If teacher manually switches to leaderboard on host, only sync if student has finished or in activity mode
      if (incomingRoom.status === 'leaderboard' && prevRoom?.status !== 'question_active') {
        setRoom(incomingRoom);
      }
    },
    [loadStudentQuestionStep]
  );

  const syncGameState = useCallback(async () => {
    if (!roomId) return;

    try {
      const rm = await fetchGameRoomById(roomId);
      if (!rm) {
        setError('ไม่พบห้องสอบนี้');
        return;
      }

      const parts = await fetchRoomParticipants(roomId).catch(() => []);
      setLeaderboard(parts);

      let currentPart = participantRef.current;
      if (!currentPart && searchParams.get('pin')) {
        const nick = profile?.display_name || `Student_${Math.floor(100 + Math.random() * 899)}`;
        currentPart = await joinGameRoomRPC(searchParams.get('pin')!, nick, avatarConfig);
        setParticipant(currentPart);
        participantRef.current = currentPart;
        window.sessionStorage.setItem(`kw_participant_${roomId}`, JSON.stringify(currentPart));
      } else if (currentPart) {
        const refreshedMe = parts.find((p) => p.id === currentPart!.id);
        if (refreshedMe) {
          setParticipant((prev) => ({
            ...refreshedMe,
            // Preserve local game EXP adjustments in activity mode if server hasn't changed
            current_score: Math.max(0, refreshedMe.current_score),
            avatar_config: prev?.avatar_config || refreshedMe.avatar_config,
          }));
          participantRef.current = refreshedMe;
          if (!refreshedMe.is_disqualified) {
            setLocalDisqualifiedReason(null);
            disqualifyingRef.current = false;
          }
          window.sessionStorage.setItem(`kw_participant_${roomId}`, JSON.stringify(refreshedMe));
        }
      }

      if (currentPart) {
        const pws = await fetchParticipantPowers(currentPart.id).catch(() => []);
        setPowers(pws);
      }

      await applyServerRoomUpdate(rm);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถซิงค์สถานะห้องสอบได้');
    }
  }, [roomId, searchParams, profile?.display_name, avatarConfig, applyServerRoomUpdate]);

  useEffect(() => {
    syncGameState();
  }, [syncGameState]);

  useEffect(() => {
    if (isOnline) {
      syncGameState();
    }
  }, [isOnline, syncGameState]);

  // Keep default PvP target synced with classmates
  const attackablePeers = useMemo(
    () =>
      leaderboard.filter(
        (p) => p.id !== participant?.id && !p.is_disqualified
      ),
    [leaderboard, participant?.id]
  );

  useEffect(() => {
    if (!selectedTargetId && attackablePeers.length > 0) {
      setSelectedTargetId(attackablePeers[0].id);
    } else if (
      selectedTargetId &&
      attackablePeers.length > 0 &&
      !attackablePeers.some((p) => p.id === selectedTargetId)
    ) {
      setSelectedTargetId(attackablePeers[0].id);
    }
  }, [attackablePeers, selectedTargetId]);

  // In-Lobby Avatar Switcher (stays inside /play/:roomId without leaving the game!)
  const handleSelectLobbyAvatarItem = async (slot: AvatarSlot, code: string) => {
    if (!room || !participant || room.status !== 'lobby') return;

    const fieldMap: Record<AvatarSlot, keyof AvatarConfig> = {
      gender: 'gender',
      face: 'face',
      base_character: 'base',
      hair: 'hair',
      outfit: 'outfit',
      hat: 'hat',
      accessory: 'accessory',
    };

    const nextConfig: AvatarConfig = {
      ...participant.avatar_config,
      [fieldMap[slot]]: code,
    };

    const updatedPart: GameParticipant = {
      ...participant,
      avatar_config: nextConfig,
    };

    setParticipant(updatedPart);
    participantRef.current = updatedPart;
    setLocalAvatarConfig(nextConfig);
    window.sessionStorage.setItem(`kw_participant_${room.id}`, JSON.stringify(updatedPart));
    soundEngine.playCoinSound();

    setSavingLobbyAvatar(true);
    try {
      await joinGameRoomRPC(room.pin_code, participant.nickname, nextConfig);
    } catch {
      // Keep local update smoothly even if network is slow
    } finally {
      setSavingLobbyAvatar(false);
    }
  };

  // Immediate Zero-Tolerance Disqualification Handler
  const triggerImmediateDisqualification = useCallback(
    async (reason: string) => {
      const curRoom = roomRef.current;
      const curPart = participantRef.current;
      if (!curRoom || !curPart || disqualifyingRef.current) return;
      if (curPart.is_disqualified) return;
      if (curRoom.status !== 'question_active') return;
      // Grace window right after loading a question so layout shifts/focus transitions never false-trigger
      if (Date.now() - questionMountedAtRef.current < 1500) return;

      disqualifyingRef.current = true;
      soundEngine.playWrongSound();
      setLocalDisqualifiedReason(reason);

      try {
        const updated = await disqualifyParticipantRPC(curRoom.id, curPart.id, reason);
        setParticipant(updated);
        participantRef.current = updated;
        window.sessionStorage.setItem(`kw_participant_${curRoom.id}`, JSON.stringify(updated));

        await broadcastRef.current?.({
          type: 'CHEATING_DISQUALIFIED',
          participant_id: curPart.id,
          nickname: curPart.nickname,
          reason,
        });
      } catch (err) {
        console.error('Disqualification RPC error:', err);
      }
    },
    []
  );

  // Careful, Mobile-Safe Anti-Cheat Proctoring (Item 19):
  // - Prevents false kicks on mobile keyboard/notification/render transitions
  // - Catches genuine tab switches, window switches, and forbidden shortcuts accurately
  useEffect(() => {
    if (!room || room.status !== 'question_active') return;

    const isMobileDevice =
      typeof window !== 'undefined' &&
      (window.matchMedia('(pointer: coarse)').matches ||
        /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));

    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    let visibilityTimer: ReturnType<typeof setTimeout> | null = null;

    const clearAllTimers = () => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
      if (visibilityTimer) {
        clearTimeout(visibilityTimer);
        visibilityTimer = null;
      }
    };

    const handleVisibilityChange = () => {
      if (roomRef.current?.status !== 'question_active') return;
      if (document.visibilityState === 'hidden') {
        if (!isMobileDevice) {
          clearAllTimers();
          triggerImmediateDisqualification('สลับแท็บหรือพับหน้าจอระหว่างทำข้อสอบ (Anti-Cheat)');
        } else {
          if (visibilityTimer) clearTimeout(visibilityTimer);
          visibilityTimer = setTimeout(() => {
            if (document.visibilityState === 'hidden' && roomRef.current?.status === 'question_active') {
              triggerImmediateDisqualification('สลับแอปหรือพับหน้าจอบนมือถือระหว่างทำข้อสอบ');
            }
          }, 400);
        }
      } else {
        clearAllTimers();
      }
    };

    const handlePageHide = () => {
      if (roomRef.current?.status === 'question_active') {
        clearAllTimers();
        triggerImmediateDisqualification('ออกจากหน้าเว็บระหว่างทำข้อสอบ (Anti-Cheat)');
      }
    };

    const handleWindowBlur = () => {
      if (roomRef.current?.status !== 'question_active') return;
      if (!isMobileDevice) {
        triggerImmediateDisqualification('คลิกออกนอกหน้าต่างห้องสอบไปเปิดโปรแกรมอื่นหรือ AI');
        return;
      }
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (
          roomRef.current?.status === 'question_active' &&
          (document.visibilityState === 'hidden' || !document.hasFocus())
        ) {
          triggerImmediateDisqualification('สลับหน้าจอออกจากห้องสอบบนมือถือระหว่างทำข้อสอบ');
        }
      }, 1500);
    };

    const handleWindowFocus = () => {
      clearAllTimers();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (roomRef.current?.status !== 'question_active') return;
      const key = e.key.toLowerCase();
      if (
        e.key === 'F12' ||
        e.key === 'PrintScreen' ||
        (e.ctrlKey && e.shiftKey && (key === 'i' || key === 'j' || key === 'c')) ||
        (e.ctrlKey && (key === 'c' || key === 'v' || key === 'f' || key === 'u' || key === 'p'))
      ) {
        e.preventDefault();
        triggerImmediateDisqualification(`กดปุ่มลัดต้องห้ามระหว่างสอบ (${e.key})`);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearAllTimers();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [room?.status, triggerImmediateDisqualification]);

  // Track Fullscreen State
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Realtime Subscription
  useEffect(() => {
    if (!roomId || !participant) return;

    const sub = subscribeToGameRoomRealtime(
      roomId,
      {
        id: participant.id,
        nickname: participant.nickname,
        role: 'student',
      },
      {
        onRoomUpdated: (updatedRoom) => {
          applyServerRoomUpdate(updatedRoom);
          fetchRoomParticipants(roomId)
            .then((parts) => {
              setLeaderboard(parts);
              const me = parts.find((p) => p.id === participant.id);
              if (me) {
                setParticipant((prev) => ({
                  ...me,
                  avatar_config: prev?.avatar_config || me.avatar_config,
                }));
                if (!me.is_disqualified) {
                  setLocalDisqualifiedReason(null);
                  disqualifyingRef.current = false;
                }
              }
            })
            .catch(() => {});
        },
        onParticipantsChanged: () => {
          fetchRoomParticipants(roomId)
            .then((parts) => {
              setLeaderboard(parts);
              const me = parts.find((p) => p.id === participant.id);
              if (me) {
                setParticipant((prev) => ({
                  ...me,
                  avatar_config: prev?.avatar_config || me.avatar_config,
                }));
                if (!me.is_disqualified) {
                  setLocalDisqualifiedReason(null);
                  disqualifyingRef.current = false;
                }
              }
            })
            .catch(() => {});
        },
        onBroadcastEvent: (ev) => {
          if (
            ev.type === 'ROOM_STATUS_CHANGED' ||
            ev.type === 'GAME_FINISHED' ||
            ev.type === 'STUDENT_PARDONED'
          ) {
            syncGameState();
          } else if (ev.type === 'BATTLE_ATTACK' && roomRef.current?.game_mode !== 'serious_exam') {
            if (ev.target_id === participant.id) {
              soundEngine.playAttackHitSound();
              setParticipant((prev) =>
                prev
                  ? { ...prev, current_score: Math.max(0, prev.current_score - ev.amount) }
                  : prev
              );
              const attackLabel =
                ev.action === 'steal' ? 'ดูดแย่งแต้มเกม' : 'ยิงลูกไฟโจมตี';
              setBattleToast(
                `💥 ${ev.attacker_name} ${attackLabel}คุณ! (-${ev.amount} EXP เกม • คะแนนสอบจริงไม่ลด)`
              );
              setTimeout(() => setBattleToast(null), 4000);
            }
          }
        },
      }
    );

    broadcastRef.current = sub.broadcast;
    return () => sub.unsubscribe();
  }, [roomId, participant?.id, participant?.nickname, syncGameState, applyServerRoomUpdate]);

  // Polling Fallback so Lobby -> Active transitions work reliably even if Realtime is busy
  useEffect(() => {
    if (!roomId || !room || room.status === 'finished') return;
    const pollMs = room.status === 'lobby' ? 2500 : 5000;

    const interval = setInterval(async () => {
      try {
        const [latestRoom, parts] = await Promise.all([
          fetchGameRoomById(roomId),
          fetchRoomParticipants(roomId),
        ]);
        setLeaderboard(parts);
        const curPart = participantRef.current;
        if (curPart) {
          const me = parts.find((p) => p.id === curPart.id);
          if (me) {
            setParticipant((prev) => ({
              ...me,
              avatar_config: prev?.avatar_config || me.avatar_config,
            }));
            if (!me.is_disqualified) {
              setLocalDisqualifiedReason(null);
              disqualifyingRef.current = false;
            }
          }
        }
        if (latestRoom) {
          await applyServerRoomUpdate(latestRoom);
        }
      } catch {
        // Ignore transient network poll error
      }
    }, pollMs);

    return () => clearInterval(interval);
  }, [roomId, room?.status, applyServerRoomUpdate]);

  // Auto-advance directly to the next shuffled question!
  const advanceToNextQuestionAuto = useCallback(
    async (currentRoom: GameRoom) => {
      if (advancingRef.current) return;
      advancingRef.current = true;
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }

      try {
        const nextStepIdx = currentRoom.current_question_index + 1;
        const partId = participantRef.current?.id || 'guest';
        await loadStudentQuestionStep(currentRoom, nextStepIdx, partId);
      } catch {
        if (currentRoom.game_mode !== 'serious_exam') {
          soundEngine.playVictoryFanfare();
        }
        setRoom({ ...currentRoom, status: 'finished' });
      } finally {
        advancingRef.current = false;
      }
    },
    [loadStudentQuestionStep]
  );

  // Countdown Timer (Per-Question Time Limit + Auto-Advance on Timeout with 0 pts)
  useEffect(() => {
    if (!room || room.status !== 'question_active' || !room.question_ends_at) {
      setSecondsLeft(0);
      return;
    }

    let prevSec = -1;
    let advancedOnTimeout = false;
    const tick = () => {
      const diffMs = new Date(room.question_ends_at!).getTime() - Date.now();
      const secs = Math.max(0, Math.ceil(diffMs / 1000));
      setSecondsLeft(secs);
      if (secs !== prevSec && secs > 0 && secs <= 5 && room.game_mode !== 'serious_exam') {
        soundEngine.playCountdownTick(secs <= 3);
      }
      if (secs <= 0 && !advancedOnTimeout) {
        advancedOnTimeout = true;
        if (room.game_mode !== 'serious_exam') {
          soundEngine.playWrongSound();
        }
        advanceToNextQuestionAuto(room);
      }
      prevSec = secs;
    };
    tick();
    const interval = setInterval(tick, 300);
    return () => clearInterval(interval);
  }, [room, advanceToNextQuestionAuto]);

  // Shuffle choices uniquely for this student so sitting next to each other cannot copy option positions
  const shuffledChoices = useMemo(() => {
    if (!questionPayload?.choices || !participant) return [];
    return shuffleChoicesForStudent(
      questionPayload.choices,
      `${participant.id}_${questionPayload.question.id}`
    );
  }, [questionPayload?.choices, questionPayload?.question.id, participant?.id]);

  const handleEnterFullscreenExamMode = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignore if browser blocks fullscreen
    }
  };

  const handleSubmitAnswer = async (choiceId?: string) => {
    if (!room || !participant || !questionPayload || submitting) return;
    if (participant.is_disqualified || localDisqualifiedReason) return;
    if (submittedForQuestionId === questionPayload.question.id) return;

    setSubmitting(true);
    setError(null);
    setSelectedChoiceId(choiceId ?? null);
    const isFemale = participant.avatar_config.gender === 'female';
    const serious = room.game_mode === 'serious_exam';

    try {
      const res = await submitGameAnswerRPC({
        roomId: room.id,
        questionId: questionPayload.question.id,
        participantId: participant.id,
        choiceId: choiceId ?? null,
        textAnswer: textAnswer.trim() || null,
      });

      // In Serious Exam mode: NEVER reveal whether answer is right/wrong or play right/wrong sounds
      if (!serious) {
        if (res.is_correct) {
          soundEngine.playCorrectSound();
          soundEngine.speakCharacterVoice('เย้! ตอบถูกแล้ว!', isFemale);
          if (res.dropped_power) {
            setTimeout(() => soundEngine.playPowerUpSound(), 320);
          }
        } else {
          soundEngine.playWrongSound();
          soundEngine.speakCharacterVoice('ยังไม่ถูกนะ เอาใหม่ข้อถัดไป!', isFemale);
        }
      }

      setSubmittedForQuestionId(questionPayload.question.id);
      setLastSubmitResult(res);

      await broadcastRef.current
        ?.({
          type: 'ANSWER_SUBMITTED',
          participant_id: participant.id,
          nickname: participant.nickname,
        })
        .catch(() => {});

      const [parts, pws] = await Promise.all([
        fetchRoomParticipants(room.id).catch(() => leaderboard),
        fetchParticipantPowers(participant.id).catch(() => powers),
      ]);
      setLeaderboard(parts);
      const me = parts.find((p) => p.id === participant.id);
      if (me) setParticipant(me);
      setPowers(pws);

      // Serious exam: fast neutral advance (650ms). Activity game: show mini podium (2200ms) or click button.
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = setTimeout(() => {
        advanceToNextQuestionAuto(room);
      }, serious ? 650 : 2200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ส่งคำตอบไม่สำเร็จ';
      if (msg.includes('ส่งคำตอบของข้อนี้ไปแล้ว')) {
        setTimeout(() => advanceToNextQuestionAuto(room), 350);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivatePower = async (pw: PlayerPowerInstance) => {
    if (!room || !participant || participant.is_disqualified || isSeriousExam) return;
    setError(null);
    try {
      const res = await activatePlayerPowerRPC(room.id, participant.id, pw.id);
      soundEngine.playPowerUpSound();
      setPowerNotice(`เปิดใช้งาน ${res.name} สำเร็จ! มีผลเพิ่ม EXP เกมในข้อนี้ทันที!`);
      setTimeout(() => setPowerNotice(null), 4000);

      await broadcastRef.current?.({
        type: 'POWER_USED',
        participant_id: participant.id,
        nickname: participant.nickname,
        power_type: pw.power_type,
      });

      const [parts, pws] = await Promise.all([
        fetchRoomParticipants(room.id),
        fetchParticipantPowers(participant.id),
      ]);
      const me = parts.find((p) => p.id === participant.id);
      if (me) setParticipant(me);
      setPowers(pws);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถใช้พลังนี้ได้');
    }
  };

  // Activity Mode: Targeted Friend Attack
  const handleTargetAttack = async (kind: 'fireball' | 'steal') => {
    if (!room || !participant || isSeriousExam) return;
    const target = attackablePeers.find((p) => p.id === selectedTargetId) || attackablePeers[0];
    if (!target) {
      setPowerNotice('ยังไม่มีเพื่อนคนอื่นในห้องให้เลือกโจมตี');
      setTimeout(() => setPowerNotice(null), 2500);
      return;
    }

    const amount = kind === 'fireball' ? 350 : 250;
    if (kind === 'fireball') {
      soundEngine.playAttackHitSound();
      soundEngine.speakCharacterVoice(
        `ย๊ากกก! ยิงลูกไฟใส่เพื่อนลดแต้มเกม!`,
        participant.avatar_config.gender === 'female'
      );
      setPowerNotice(
        `🔥 ยิงลูกไฟใส่ ${target.nickname} ลดแต้มเกม -${amount} EXP สำเร็จ! (คะแนนสอบจริงไม่ลด)`
      );
    } else {
      soundEngine.playStealExpSound();
      soundEngine.speakCharacterVoice(
        `ดูดแย่งแต้มเกมจากเพื่อนสองร้อยห้าสิบแต้ม!`,
        participant.avatar_config.gender === 'female'
      );
      setParticipant((prev) =>
        prev ? { ...prev, current_score: prev.current_score + amount } : prev
      );
      setPowerNotice(
        `🧲 แย่งแต้มเกมจาก ${target.nickname} +${amount} EXP สำเร็จ! (คะแนนสอบจริงไม่ลด)`
      );
    }
    setTimeout(() => setPowerNotice(null), 3500);

    // Broadcast live attack to the targeted classmate!
    await broadcastRef.current
      ?.({
        type: 'BATTLE_ATTACK',
        attacker_id: participant.id,
        attacker_name: participant.nickname,
        target_id: target.id,
        target_name: target.nickname,
        action: kind,
        amount,
      })
      .catch(() => {});
  };

  if (!room || !participant) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="card-game p-8 space-y-4">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-kw-blue" />
          <h2 className="font-game text-2xl font-bold">กำลังเข้าสู่ห้องสอบ...</h2>
          {error && <p className="text-sm font-bold text-red-700">{error}</p>}
        </div>
      </div>
    );
  }

  const isDisqualified = Boolean(participant.is_disqualified || localDisqualifiedReason);
  const disqualifyReasonText =
    participant.disqualified_reason ||
    localDisqualifiedReason ||
    'ตรวจพบการสลับแท็บหรือออกจากหน้าจอระหว่างการสอบ';

  // ============================================================================
  // IMMEDIATE DISQUALIFICATION LOCK SCREEN (ANTI-CHEAT)
  // ============================================================================
  if (isDisqualified) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="card-game p-8 bg-red-50 border-4 border-red-700 text-center space-y-5"
        >
          <div className="w-20 h-20 mx-auto rounded-3xl bg-kw-red text-white border-4 border-slate-900 flex items-center justify-center shadow-block">
            <Ban className="w-12 h-12" />
          </div>

          <span className="inline-flex items-center gap-1.5 px-4 py-1 rounded-full bg-red-700 text-white font-game font-extrabold text-xs">
            🚨 CHEATING DETECTED — DISQUALIFIED
          </span>

          <h1 className="font-game text-3xl md:text-4xl font-extrabold text-red-900">
            คุณถูกปรับทุจริตทันที! (0 คะแนน)
          </h1>

          <div className="p-4 rounded-2xl bg-white border-3 border-red-700 text-left space-y-2 text-sm">
            <div className="font-bold text-slate-900">
              ชื่อผู้เข้าสอบ: <span className="text-kw-red">{participant.nickname}</span>
            </div>
            <div className="font-bold text-slate-900">
              สาเหตุที่ระบบตรวจพบ: <span className="text-red-700">{disqualifyReasonText}</span>
            </div>
            <div className="font-bold text-slate-900">
              ผลคะแนนสอบจริง:{' '}
              <span className="text-red-700 font-extrabold">0 คะแนน (ตัดสิทธิ์การส่งคำตอบ)</span>
            </div>
          </div>

          <p className="text-xs font-bold text-slate-700">
            ระบบได้ส่งแจ้งเตือนไปยังหน้าจอของคุณครูผู้คุมสอบเรียบร้อยแล้ว
            หากเกิดจากเครื่องค้างหรือเหตุสุดวิสัย กรุณายกมือแจ้งคุณครูเพื่อขอปลดล็อกอนุโลม
          </p>
        </motion.div>
      </div>
    );
  }

  const myRank = leaderboard.findIndex((p) => p.id === participant.id) + 1;
  const availablePowers = powers.filter((p) => p.status === 'in_inventory');
  const hasSubmittedThisQ =
    questionPayload && submittedForQuestionId === questionPayload.question.id;
  const canUseFullscreen =
    typeof document !== 'undefined' && Boolean(document.documentElement.requestFullscreen);
  const top3Leaderboard = [...leaderboard]
    .filter((p) => !p.is_disqualified)
    .sort((a, b) => b.correct_count - a.correct_count || b.current_score - a.current_score)
    .slice(0, 3);
  const displayTotalQ = totalQuestions || questionPayload?.total_questions || 0;

  return (
    <div
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onPaste={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      className="max-w-4xl mx-auto px-2.5 sm:px-4 py-3 sm:py-6 pb-10 sm:pb-24 space-y-3 sm:space-y-5 select-none"
    >
      {/* Strict Exam Proctoring Warning Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 sm:px-4 sm:py-2.5 rounded-2xl bg-slate-900 text-white border-2 border-slate-700 text-[11px] sm:text-xs font-bold">
        <span className="flex items-center gap-1.5 text-amber-300">
          <ShieldAlert className="w-4 h-4 text-kw-red shrink-0" />
          <span>
            {isSeriousExam
              ? '📝 โหมดสอบวัดความรู้จริง (สลับข้อรายคน • ไม่เฉลย): ห้ามสลับแท็บหรือออกจากหน้าจอเด็ดขาด!'
              : '🏆 โหมดกิจกรรมเก็บคะแนนสั้นๆ: ห้ามสลับแท็บหรือเปิด AI ระหว่างตอบคำถาม!'}
          </span>
        </span>
        {!isFullscreen && canUseFullscreen && (
          <button
            type="button"
            onClick={handleEnterFullscreenExamMode}
            className="px-2.5 py-1 rounded-xl bg-kw-yellow text-slate-900 font-extrabold text-[11px] flex items-center gap-1"
          >
            <Maximize2 className="w-3.5 h-3.5" /> เปิดโหมดเต็มจอ
          </button>
        )}
      </div>

      {/* Live Incoming Attack Toast (Activity Mode only) */}
      <AnimatePresence>
        {battleToast && !isSeriousExam && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="p-3 rounded-2xl bg-kw-red text-white border-3 border-slate-900 font-game font-extrabold text-sm text-center shadow-block"
          >
            {battleToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Student Status HUD */}
      <div className="card-game p-3 sm:p-4 bg-gradient-to-r from-kw-cream via-amber-50 to-sky-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <AvatarRenderer
            config={participant.avatar_config}
            size="sm"
            shieldActive={!isSeriousExam && participant.shield_active}
          />
          <div className="min-w-0">
            <div className="font-game text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2 truncate">
              <span className="truncate">{participant.nickname}</span>
              {!isSeriousExam && participant.active_power && (
                <span className="px-2 py-0.5 rounded-full bg-kw-yellow border border-slate-900 text-[10px] sm:text-xs shrink-0">
                  ⚡ {participant.active_power.toUpperCase()}
                </span>
              )}
            </div>
            <div className="text-[11px] sm:text-xs font-bold text-slate-600">
              PIN: {room.pin_code}
              {!isSeriousExam ? ` • คอมโบ: 🔥 ${participant.streak_count}` : ' • สอบวัดความรู้จริง'}
            </div>
          </div>
        </div>

        {/* Serious Exam HUD vs Activity Game Dual-Score HUD */}
        {isSeriousExam ? (
          <div className="flex items-center gap-2">
            <div className="px-3.5 py-1.5 rounded-2xl bg-slate-900 text-kw-yellow border-2 border-slate-900 text-center">
              <span className="block text-[9px] font-extrabold uppercase">โหมดการสอบ</span>
              <span className="font-game text-xs sm:text-sm font-extrabold">
                📝 สอบวัดความรู้จริง (ไม่เฉลย)
              </span>
            </div>
            {room.status === 'question_active' && displayTotalQ > 0 && (
              <div className="px-3.5 py-1.5 rounded-2xl bg-kw-blue text-white border-2 border-slate-900 text-center">
                <span className="block text-[9px] font-extrabold uppercase">ความคืบหน้า</span>
                <span className="font-game text-sm sm:text-base font-extrabold">
                  ข้อ {room.current_question_index + 1} / {displayTotalQ}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 w-full sm:w-auto sm:flex sm:items-center sm:gap-2.5">
            <div className="px-2 sm:px-4 py-1 sm:py-1.5 rounded-xl sm:rounded-2xl bg-kw-green text-white border-2 border-slate-900 text-center shadow-sm">
              <span className="block text-[9px] sm:text-[10px] font-extrabold uppercase">📝 สอบจริง</span>
              <span className="font-game text-sm sm:text-xl font-extrabold">
                {participant.correct_count} คะแนน
              </span>
            </div>

            <div className="px-2 sm:px-4 py-1 sm:py-1.5 rounded-xl sm:rounded-2xl bg-kw-yellow text-slate-900 border-2 border-slate-900 text-center shadow-sm">
              <span className="block text-[9px] sm:text-[10px] font-extrabold uppercase">⭐ EXP เกม</span>
              <span className="font-game text-sm sm:text-xl font-extrabold">
                {participant.current_score.toLocaleString()}
              </span>
            </div>

            <div className="px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-xl sm:rounded-2xl bg-kw-blue text-white border-2 border-slate-900 text-center shadow-sm">
              <span className="block text-[9px] sm:text-[10px] font-extrabold uppercase">🏆 อันดับ</span>
              <span className="font-game text-sm sm:text-xl font-extrabold">#{myRank || '-'}</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-2xl bg-red-100 border-2 border-red-600 text-red-900 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* STATE 1: WAITING IN LOBBY + IN-LOBBY AVATAR SWITCHER (Item 3) */}
      {room.status === 'lobby' && (
        <div className="card-game p-4 sm:p-7 text-center space-y-4 sm:space-y-5">
          <div className="max-w-lg mx-auto p-3.5 sm:p-4 rounded-2xl bg-slate-900 text-kw-yellow border-3 border-slate-900 shadow-block-sm animate-pulse space-y-1">
            <div className="font-game text-sm sm:text-lg font-extrabold">
              ⏳ ห้องสอบล็อกอยู่ — รอคุณครูกดปุ่ม &quot;เริ่มสอบ&quot; เพื่อเปิดข้อสอบพร้อมกัน
            </div>
            <div className="text-xs font-bold text-amber-200">
              รหัสข้อสอบ PIN: {room.pin_code} • เพื่อนที่เข้ามารอในห้องแล้ว: {leaderboard.length} คน
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <AvatarRenderer config={participant.avatar_config} size="lg" />
            <h2 className="font-game text-2xl sm:text-3xl font-extrabold text-slate-900">
              พร้อมเข้าสอบแล้ว, {participant.nickname}!
            </h2>

            {/* Toggle In-Lobby Avatar Customizer without leaving the room! */}
            <button
              type="button"
              onClick={() => setShowLobbyCustomizer((prev) => !prev)}
              className="btn-game-yellow text-xs sm:text-sm py-2 px-4 inline-flex items-center gap-1.5"
            >
              <Palette className="w-4 h-4" />
              <span>
                {showLobbyCustomizer
                  ? 'ซ่อนเมนูเปลี่ยนตัวละคร'
                  : 'เปลี่ยนตัวละครระหว่างรอเริ่มเกม (ไม่ออกจากหน้าเกม)'}
              </span>
            </button>
          </div>

          {/* Inline Lobby Avatar Customizer */}
          <AnimatePresence>
            {showLobbyCustomizer && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="max-w-2xl mx-auto p-4 rounded-2xl bg-white border-3 border-slate-900 text-left space-y-3 overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-game text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Palette className="w-4 h-4 text-kw-blue" /> แต่งตัวละครในห้องรอ (อัปเดตสดทันที)
                  </span>
                  {savingLobbyAvatar && (
                    <span className="text-[11px] font-bold text-kw-blue flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> กำลังซิงค์...
                    </span>
                  )}
                </div>

                {/* Slot Tabs */}
                <div className="flex overflow-x-auto no-scrollbar gap-1.5 pb-1">
                  {LOBBY_AVATAR_SLOTS.map((sl) => (
                    <button
                      key={sl.key}
                      type="button"
                      onClick={() => setLobbyAvatarSlot(sl.key)}
                      className={`shrink-0 px-3 py-1.5 rounded-xl border-2 border-slate-900 font-game text-xs font-extrabold ${
                        lobbyAvatarSlot === sl.key
                          ? 'bg-kw-blue text-white'
                          : 'bg-slate-100 text-slate-800 hover:bg-amber-100'
                      }`}
                    >
                      {sl.label}
                    </button>
                  ))}
                </div>

                {/* Starter Items Grid for Selected Slot */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
                  {BUILTIN_AVATAR_CATALOG.filter(
                    (it) => it.slot === lobbyAvatarSlot && it.is_starter
                  ).map((item) => {
                    const fieldMap: Record<AvatarSlot, keyof AvatarConfig> = {
                      gender: 'gender',
                      face: 'face',
                      base_character: 'base',
                      hair: 'hair',
                      outfit: 'outfit',
                      hat: 'hat',
                      accessory: 'accessory',
                    };
                    const isEquipped = participant.avatar_config[fieldMap[item.slot]] === item.code;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectLobbyAvatarItem(item.slot, item.code)}
                        className={`p-2.5 rounded-xl border-2 border-slate-900 text-left flex items-center gap-2 transition ${
                          isEquipped
                            ? 'bg-kw-yellow ring-2 ring-slate-900'
                            : 'bg-slate-50 hover:bg-amber-50'
                        }`}
                      >
                        <span
                          className="w-5 h-5 rounded-full border-2 border-slate-900 shrink-0"
                          style={{ backgroundColor: item.preview_color }}
                        />
                        <span className="text-xs font-bold text-slate-900 leading-tight">
                          {item.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="max-w-lg mx-auto p-4 rounded-2xl bg-amber-50 border-3 border-slate-900 text-left space-y-2 text-xs font-bold text-slate-800">
            <div className="font-game text-sm font-extrabold text-kw-red flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />{' '}
              {isSeriousExam
                ? 'กติกาโหมดสอบวัดความรู้จริง:'
                : 'กติกาโหมดกิจกรรมเก็บคะแนนสั้นๆ:'}
            </div>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>สุ่มสลับข้อสอบและตัวเลือกรายคน:</strong> ในเวลาเดียวกันคุณจะได้ทำคนละข้อกับเพื่อนข้างๆ
              </li>
              <li>
                <strong>หมดเวลาไปข้อถัดไปอัตโนมัติ:</strong> หากหมดเวลาแล้วยังไม่ตอบ จะได้ 0 คะแนนในข้อนั้นและไปข้อถัดไปทันที
              </li>
              {isSeriousExam ? (
                <li>
                  <strong>โหมดสอบจริงไม่เฉลยคำตอบ:</strong> นับเฉพาะคะแนนสอบจริง (1 คะแนน/ข้อ) ไม่มีการโจมตีเพื่อน
                </li>
              ) : (
                <li>
                  <strong>โหมดกิจกรรมสนุกสุดมันส์:</strong> มีโพเดียมหลังตอบแต่ละข้อ และเลือกเพื่อนโจมตีแต้มเกมได้ (ไม่ลดคะแนนสอบจริง)
                </li>
              )}
              <li className="text-red-700">
                <strong>ห้ามสลับแท็บ / ห้ามย่อหน้าจอ / ห้ามเปิด AI:</strong> ระบบตรวจจับการทุจริตทำงานตลอดเวลา!
              </li>
            </ul>
          </div>

          {canUseFullscreen && (
            <button
              type="button"
              onClick={handleEnterFullscreenExamMode}
              className="btn-game-blue w-full sm:w-auto text-sm py-3 px-6 inline-flex items-center justify-center gap-2"
            >
              <Maximize2 className="w-4 h-4" />
              <span>เปิดโหมดเต็มจอเตรียมพร้อมสอบ (Fullscreen Mode)</span>
            </button>
          )}
        </div>
      )}

      {/* STATE 2: ACTIVE QUESTION */}
      {room.status === 'question_active' && questionPayload && (
        <div className="card-game p-4 sm:p-6 space-y-4 sm:space-y-6 relative overflow-hidden">
          {/* Anti-Photo / Anti-AI Dynamic Student Watermark */}
          <div className="pointer-events-none select-none absolute inset-0 flex flex-wrap items-center justify-around opacity-[0.055] -rotate-12 text-slate-900 font-mono font-extrabold text-sm overflow-hidden">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="p-4">
                {participant.nickname} • PIN:{room.pin_code} • NO-AI-EXAM
              </span>
            ))}
          </div>

          {/* Visual Countdown Progress Bar */}
          {(() => {
            const totalSec = Math.max(1, questionPayload.question.time_limit_seconds || 20);
            const timerPct = Math.min(100, Math.max(0, Math.round((secondsLeft / totalSec) * 100)));
            const timerBarColor =
              secondsLeft <= 5
                ? 'bg-kw-red animate-pulse'
                : timerPct <= 50
                  ? 'bg-kw-yellow'
                  : 'bg-kw-green';
            return (
              <div className="relative z-10 h-2.5 w-full rounded-full bg-slate-200 border border-slate-900 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${timerBarColor}`}
                  style={{ width: `${timerPct}%` }}
                />
              </div>
            );
          })()}

          <div className="relative z-10 flex items-center justify-between border-b-2 border-slate-200 pb-2.5 sm:pb-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 sm:px-3 py-1 rounded-full bg-kw-yellow border-2 border-slate-900 font-game font-extrabold text-xs">
                ข้อที่ {room.current_question_index + 1}
                {displayTotalQ > 0 ? ` / ${displayTotalQ}` : ''}
              </span>
              <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[11px] font-bold">
                เวลาข้อนี้: {questionPayload.question.time_limit_seconds} วินาที
              </span>
            </div>

            <div
              className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-2xl border-2 border-slate-900 font-game text-lg sm:text-xl font-extrabold flex items-center gap-1.5 ${
                secondsLeft <= 5 ? 'bg-kw-red text-white animate-pulse' : 'bg-white text-slate-900'
              }`}
            >
              <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>{secondsLeft}s</span>
            </div>
          </div>

          <div className="relative z-10 text-center space-y-2.5 sm:space-y-3">
            <h2 className="font-game text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 leading-snug">
              {questionPayload.question.prompt}
            </h2>
            {questionPayload.question.image_url && (
              <img
                src={questionPayload.question.image_url}
                alt="Question"
                draggable={false}
                className="max-h-40 sm:max-h-56 mx-auto rounded-2xl border-3 border-slate-900 bg-white object-contain pointer-events-none"
              />
            )}
          </div>

          {/* Answer Input or Shuffled Multiple Choice Buttons */}
          {questionPayload.question.question_type === 'text_quiz' ? (
            <div className="relative z-10 space-y-3 max-w-md mx-auto">
              <input
                type="text"
                autoComplete="off"
                enterKeyHint="send"
                disabled={Boolean(hasSubmittedThisQ) || secondsLeft <= 0}
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !hasSubmittedThisQ &&
                    secondsLeft > 0 &&
                    textAnswer.trim()
                  ) {
                    e.preventDefault();
                    handleSubmitAnswer();
                  }
                }}
                placeholder="พิมพ์คำตอบของคุณที่นี่..."
                className="w-full rounded-2xl border-4 border-slate-900 px-4 py-3 font-bold text-center text-base sm:text-lg bg-white"
              />
              <button
                type="button"
                disabled={Boolean(hasSubmittedThisQ) || secondsLeft <= 0 || !textAnswer.trim()}
                onClick={() => handleSubmitAnswer()}
                className="btn-game-green w-full py-3.5 text-base sm:text-lg"
              >
                ส่งคำตอบข้อนี้!
              </button>
            </div>
          ) : (
            <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
              {shuffledChoices.map((ch, idx) => {
                const btnStyles = [
                  'btn-game-red',
                  'btn-game-blue',
                  'btn-game-yellow',
                  'btn-game-green',
                ];
                const displayLabels = ['1', '2', '3', '4'];
                const isSelected = selectedChoiceId === ch.id;

                return (
                  <button
                    key={ch.id}
                    type="button"
                    disabled={Boolean(hasSubmittedThisQ) || secondsLeft <= 0 || submitting}
                    onClick={() => handleSubmitAnswer(ch.id)}
                    className={`${btnStyles[idx % btnStyles.length]} min-h-[58px] sm:min-h-[72px] p-3.5 sm:p-5 text-left flex items-center justify-between gap-2.5 sm:gap-3 text-base sm:text-lg leading-snug active:scale-[0.98] ${
                      isSelected ? 'ring-4 ring-slate-900 scale-[0.99]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-black/20 border-2 border-slate-900 font-game font-extrabold flex items-center justify-center shrink-0">
                        {displayLabels[idx] || ch.choice_label}
                      </span>
                      <span className="font-bold">{ch.choice_text}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Answer Feedback: Neutral in Serious Exam vs Mini-Podium in Activity Game */}
          {lastSubmitResult && (
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`relative z-10 p-4 sm:p-5 rounded-2xl border-4 border-slate-900 space-y-3 ${
                isSeriousExam
                  ? 'bg-sky-100'
                  : lastSubmitResult.is_correct
                    ? 'bg-emerald-100'
                    : 'bg-red-100'
              }`}
            >
              {isSeriousExam ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-game text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-kw-blue" />
                    <span>บันทึกคำตอบข้อนี้เรียบร้อยแล้ว (ไม่เฉลยคำตอบ)</span>
                  </div>
                  <span className="px-3 py-1 rounded-xl bg-slate-900 text-white font-game font-bold text-xs animate-pulse">
                    ⏩ กำลังไปข้อถัดไปอัตโนมัติ...
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-game text-lg sm:text-xl font-extrabold flex items-center gap-2">
                      {lastSubmitResult.is_correct ? (
                        <>
                          <CheckCircle2 className="w-6 h-6 text-emerald-700" />
                          <span className="text-emerald-950">ตอบถูกต้อง! (+1 คะแนน)</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-6 h-6 text-red-700" />
                          <span className="text-red-950">ข้อนี้ยังไม่ถูก (+0 คะแนน)</span>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="px-2.5 py-1 rounded-xl bg-kw-yellow text-slate-900 border-2 border-slate-900 font-game font-extrabold text-xs">
                        ⭐ +{lastSubmitResult.total_points_awarded.toLocaleString()} EXP
                      </span>
                      <button
                        type="button"
                        onClick={() => advanceToNextQuestionAuto(room)}
                        className="px-3 py-1 rounded-xl bg-slate-900 text-kw-yellow font-game font-extrabold text-xs flex items-center gap-1"
                      >
                        <span>ไปข้อถัดไป</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Mini Top-3 Podium Between Every Question (Activity Mode - Item 2) */}
                  {top3Leaderboard.length > 0 && (
                    <div className="p-3 rounded-xl bg-white/90 border-2 border-slate-900 space-y-2">
                      <div className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1">
                        <Trophy className="w-3.5 h-3.5 text-kw-orange" /> โพเดียมผู้นำ Top 3 ล่าสุด
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {top3Leaderboard.map((p, idx) => (
                          <div
                            key={p.id}
                            className={`p-2 rounded-xl border-2 border-slate-900 ${
                              idx === 0
                                ? 'bg-kw-yellow'
                                : idx === 1
                                  ? 'bg-slate-200'
                                  : 'bg-amber-200'
                            }`}
                          >
                            <div className="font-game text-xs font-extrabold">
                              {idx === 0 ? '🥇 #1' : idx === 1 ? '🥈 #2' : '🥉 #3'}
                            </div>
                            <div className="text-[11px] font-bold truncate">{p.nickname}</div>
                            <div className="text-[10px] font-extrabold text-slate-800">
                              {p.correct_count} ข้อ • {p.current_score.toLocaleString()} EXP
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </div>
      )}

      {/* ACTIVITY MODE ONLY: Targetable PvP Battle & RPG Powers Bar (Hidden completely in Serious Exam) */}
      {!isSeriousExam && room.status === 'question_active' && (
        <div className="card-game p-3 sm:p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-extrabold uppercase text-slate-700 flex items-center gap-1">
              <Crosshair className="w-4 h-4 text-kw-red shrink-0" /> เลือกเพื่อนเพื่อโจมตีแต้มเกม & พลัง RPG (ไม่กระทบคะแนนสอบจริง!)
            </span>
          </div>

          {/* Target Friend Picker */}
          {attackablePeers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-extrabold text-slate-700 shrink-0">
                🎯 เป้าหมาย:
              </label>
              <select
                value={selectedTargetId}
                onChange={(e) => setSelectedTargetId(e.target.value)}
                className="flex-1 min-w-[180px] rounded-xl border-2 border-slate-900 px-3 py-1.5 text-xs font-bold bg-white"
              >
                {attackablePeers.map((peer) => (
                  <option key={peer.id} value={peer.id}>
                    {peer.nickname} ({peer.current_score.toLocaleString()} EXP)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex overflow-x-auto no-scrollbar gap-2 pb-1 sm:flex-wrap sm:pb-0">
            <button
              type="button"
              onClick={() => handleTargetAttack('fireball')}
              className="shrink-0 whitespace-nowrap px-3 py-2 rounded-xl bg-kw-red text-white border-2 border-slate-900 font-bold text-xs flex items-center gap-1 shadow-sm"
            >
              <Flame className="w-3.5 h-3.5 fill-kw-yellow" />
              <span>ยิงลูกไฟใส่เพื่อนที่เลือก (-350 EXP)</span>
            </button>

            <button
              type="button"
              onClick={() => handleTargetAttack('steal')}
              className="shrink-0 whitespace-nowrap px-3 py-2 rounded-xl bg-kw-orange text-white border-2 border-slate-900 font-bold text-xs flex items-center gap-1 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>แย่งแต้มเพื่อนที่เลือก (+250 EXP)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playPowerUpSound();
                soundEngine.speakCharacterVoice(
                  'เพิ่มพลังแต้มเกมให้ตัวเองสี่ร้อยแต้ม!',
                  participant.avatar_config.gender === 'female'
                );
                setParticipant((prev) =>
                  prev ? { ...prev, current_score: prev.current_score + 400 } : prev
                );
                setPowerNotice('✨ บัฟเพิ่มแต้มเกมให้ตัวเอง +400 EXP สำเร็จ!');
                setTimeout(() => setPowerNotice(null), 3500);
              }}
              className="shrink-0 whitespace-nowrap px-3 py-2 rounded-xl bg-kw-green text-white border-2 border-slate-900 font-bold text-xs flex items-center gap-1 shadow-sm"
            >
              <Star className="w-3.5 h-3.5 fill-kw-yellow" />
              <span>บัฟเพิ่มแต้มตัวเอง (+400 EXP)</span>
            </button>

            {availablePowers.map((pw) => {
              const Icon = POWER_ICON_MAP[pw.power_type] || Zap;
              return (
                <button
                  key={pw.id}
                  type="button"
                  disabled={Boolean(hasSubmittedThisQ)}
                  onClick={() => handleActivatePower(pw)}
                  className="shrink-0 whitespace-nowrap px-3 py-2 rounded-xl bg-amber-100 hover:bg-kw-yellow border-2 border-slate-900 font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Icon className="w-4 h-4 text-kw-red" />
                  <span>{pw.powers?.name || pw.power_type}</span>
                </button>
              );
            })}
          </div>

          <AnimatePresence>
            {powerNotice && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-2 rounded-xl bg-emerald-100 border-2 border-emerald-600 text-emerald-900 text-xs font-bold"
              >
                {powerNotice}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* STATE 3: FINISHED OR LEADERBOARD */}
      {(room.status === 'leaderboard' || room.status === 'finished') && (
        <div className="space-y-4 sm:space-y-6">
          {isSeriousExam ? (
            <div className="card-game p-6 sm:p-8 text-center space-y-4 bg-emerald-50">
              <CheckCircle2 className="w-14 h-14 mx-auto text-kw-green" />
              <h2 className="font-game text-2xl sm:text-3xl font-extrabold text-slate-900">
                ส่งข้อสอบครบทุกข้อเรียบร้อยแล้ว!
              </h2>
              <p className="text-sm font-bold text-slate-700 max-w-md mx-auto">
                ระบบได้บันทึกคำตอบของ <strong>{participant.nickname}</strong> ลงฐานข้อมูลเรียบร้อยแล้ว
                (โหมดสอบวัดความรู้จริงจะไม่เฉลยคำตอบบนหน้าจอนักเรียน — คุณครูสามารถตรวจและประกาศผลได้ทันที)
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="btn-game-blue text-sm py-3 px-6"
                >
                  กลับหน้าแรก
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="card-game p-4 sm:p-6 text-center space-y-4">
                <Trophy className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-kw-yellow drop-shadow" />
                <h2 className="font-game text-2xl sm:text-3xl font-extrabold">
                  {room.status === 'finished' ? 'สรุปผลคะแนนกิจกรรมและโพเดียม!' : 'อันดับคะแนนปัจจุบัน'}
                </h2>
                <p className="text-sm font-bold text-slate-700">
                  คะแนนสอบจริงของคุณ:{' '}
                  <span className="text-kw-green text-xl font-extrabold">
                    {participant.correct_count} คะแนน
                  </span>{' '}
                  | คะแนนเกมสะสม:{' '}
                  <span className="text-kw-blue text-xl font-extrabold">
                    {participant.current_score.toLocaleString()} EXP
                  </span>
                </p>

                <div className="space-y-2 text-left max-w-xl mx-auto pt-2">
                  {leaderboard.slice(0, 10).map((p, idx) => (
                    <div
                      key={p.id}
                      className={`p-3 rounded-2xl border-2 border-slate-900 flex items-center justify-between ${
                        p.is_disqualified
                          ? 'bg-red-100 opacity-75'
                          : p.id === participant.id
                            ? 'bg-kw-yellow font-extrabold'
                            : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-lg bg-slate-900 text-white font-game text-xs font-bold flex items-center justify-center">
                          #{idx + 1}
                        </span>
                        <AvatarRenderer config={p.avatar_config} size="sm" animate={false} />
                        <div>
                          <span className="text-sm font-bold">{p.nickname}</span>
                          {p.is_disqualified && (
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-extrabold">
                              ถูกปรับทุจริต (0 คะแนน)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-game text-base font-extrabold text-emerald-800">
                          สอบจริง: {p.is_disqualified ? 0 : p.correct_count} คะแนน
                        </div>
                        <div className="text-xs font-bold text-slate-600">
                          เกม: {p.is_disqualified ? 0 : p.current_score.toLocaleString()} EXP
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {room.status === 'finished' && (
                  <div className="pt-4 flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('/student')}
                      className="btn-game-green text-sm py-3 px-6"
                    >
                      ไปยังหน้าโปรไฟล์นักเรียน ดูเลเวล & แต่งตัวละคร
                    </button>
                  </div>
                )}
              </div>

              {room.status === 'finished' && <LuckyBlockCard roomId={room.id} />}
            </>
          )}
        </div>
      )}
    </div>
  );
};
