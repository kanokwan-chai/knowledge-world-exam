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
  SkipForward,
  PlusCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AvatarRenderer, BUILTIN_AVATAR_CATALOG } from '../components/avatar/AvatarRenderer';
import { LuckyBlockCard } from '../components/luckyblock/LuckyBlockModal';
import { soundEngine } from '../lib/soundEngine';
import { buildShuffledQuestionOrder } from '../lib/securityGuard';
import {
  creditStudentGameReward,
  ensureStudentVaultProfile,
  getActiveStudentVaultProfile,
  parseFormattedIdentity,
  purchaseStudentVaultItem,
  saveStudentVaultAvatar,
  StudentVaultProfile,
} from '../lib/studentIdentityVault';
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
  const [vaultProfile, setVaultProfile] = useState<StudentVaultProfile | null>(() =>
    getActiveStudentVaultProfile()
  );
  const [lobbyShopMsg, setLobbyShopMsg] = useState<string | null>(null);

  // Activity Mode: Target Friend Selector for PvP Attack
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [battleToast, setBattleToast] = useState<string | null>(null);

  // Serious Exam: Speed Time Bank (saves leftover seconds from fast answers to redistribute to hard questions) & Skip-to-Revisit
  const [savedBonusSeconds, setSavedBonusSeconds] = useState<number>(() => {
    if (!roomId) return 0;
    return Number(window.sessionStorage.getItem(`kw_timebank_${roomId}`) || '0') || 0;
  });
  const [fastAnsweredCount, setFastAnsweredCount] = useState<number>(() => {
    if (!roomId) return 0;
    return Number(window.sessionStorage.getItem(`kw_fastcnt_${roomId}`) || '0') || 0;
  });
  const [extraTimeNotice, setExtraTimeNotice] = useState<string | null>(null);
  const skippedRealIndicesRef = useRef<Set<number>>(new Set());

  const broadcastRef = useRef<((event: RealtimeBroadcastEvent) => Promise<void>) | null>(null);
  const disqualifyingRef = useRef<boolean>(false);
  const wasDisqualifiedRef = useRef<boolean>(false);
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

  // Build question order:
  // - Serious Exam: deterministic per-student shuffled order (different questions simultaneously)
  // - Activity Mode: exact same sequential order as Teacher Host (0..N-1) so everyone shares the same question & Podium!
  const ensureQuestionOrder = useCallback(async (targetRoom: GameRoom, partId: string): Promise<number[]> => {
    const seed = `${targetRoom.id}_${partId}_${targetRoom.game_mode}`;
    if (questionOrderRef.current.length > 0 && questionOrderSeedRef.current === seed) {
      return questionOrderRef.current;
    }
    const count = await fetchQuizQuestionCount(targetRoom.quiz_id).catch(() => 0);
    const safeCount = Math.max(1, count);
    const order =
      targetRoom.game_mode === 'serious_exam'
        ? buildShuffledQuestionOrder(safeCount, seed)
        : Array.from({ length: safeCount }, (_, i) => i);
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
        // Refresh participant's final real exam score from Supabase immediately on finish
        fetchRoomParticipants(targetRoom.id)
          .then((parts) => {
            setLeaderboard(parts);
            const me = parts.find((p) => p.id === partId);
            if (me) {
              setParticipant(me);
              participantRef.current = me;
              window.sessionStorage.setItem(`kw_participant_${targetRoom.id}`, JSON.stringify(me));
            }
          })
          .catch(() => {});
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
        window.sessionStorage.removeItem(`kw_timebank_${incomingRoom.id}`);
        window.sessionStorage.removeItem(`kw_fastcnt_${incomingRoom.id}`);
        skippedRealIndicesRef.current.clear();
        setSavedBonusSeconds(0);
        setFastAnsweredCount(0);
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

      const incomingIsSerious = incomingRoom.game_mode === 'serious_exam';

      if (incomingRoom.status === 'question_active') {
        const partId = curPart?.id || 'guest';

        // Activity Mode: Teacher controls question progression (Teacher clicks Next -> students advance to that step)
        if (!incomingIsSerious) {
          const needsLoad =
            !prevRoom ||
            prevRoom.status !== 'question_active' ||
            prevRoom.current_question_index !== incomingRoom.current_question_index ||
            !questionPayloadRef.current;

          if (needsLoad) {
            if (prevRoom?.status === 'lobby' || prevRoom?.status === 'leaderboard') {
              soundEngine.playPowerUpSound();
            }
            await loadStudentQuestionStep(incomingRoom, incomingRoom.current_question_index, partId);
          }
          return;
        }

        // Serious Exam Mode: Student progresses independently through their own shuffled question order
        if (!prevRoom || prevRoom.status === 'lobby' || !questionPayloadRef.current) {
          const savedStepRaw = window.sessionStorage.getItem(`kw_step_${incomingRoom.id}`);
          const savedStep = savedStepRaw ? Math.max(0, Number(savedStepRaw) || 0) : 0;
          await loadStudentQuestionStep(incomingRoom, savedStep, partId);
          return;
        }
        return;
      }

      // Activity Mode: When teacher clicks Stop/Pause, immediately pop up the Podium!
      if (
        !incomingIsSerious &&
        (incomingRoom.status === 'leaderboard' || incomingRoom.status === 'question_reveal')
      ) {
        if (prevRoom?.status !== 'leaderboard') {
          soundEngine.playVictoryFanfare();
        }
        setRoom({ ...incomingRoom, status: 'leaderboard' });
        return;
      }

      // Serious Exam fallback: only switch to leaderboard if not actively answering
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

  // Ensure Student Identity Vault is loaded for the current participant
  useEffect(() => {
    if (!participant?.nickname) return;
    const { realName, last3Digits } = parseFormattedIdentity(participant.nickname);
    const vp = ensureStudentVaultProfile(realName, last3Digits, participant.avatar_config);
    setVaultProfile(vp);
  }, [participant?.nickname]);

  // Credit completion bonus (+100 Coins + 1 Free Lucky Block Ticket) once per finished room
  useEffect(() => {
    if (!room || room.status !== 'finished' || !vaultProfile) return;
    const res = creditStudentGameReward(vaultProfile.identityKey, {
      dedupeKey: `finish_${room.id}`,
      coins: 100,
      exp: 100,
      luckyTickets: 1,
      incrementGamesPlayed: true,
    });
    if (res.credited && res.profile) {
      setVaultProfile(res.profile);
    }
  }, [room?.status, room?.id, vaultProfile?.identityKey]);

  // In-Lobby Avatar Switcher & Mini Shop (stays inside /play/:roomId without leaving the game!)
  const handleSelectLobbyAvatarItem = async (
    slot: AvatarSlot,
    code: string,
    isStarter: boolean,
    priceCoins: number
  ) => {
    if (!room || !participant || room.status !== 'lobby') return;
    setLobbyShopMsg(null);

    const activeVault =
      vaultProfile ||
      (() => {
        const { realName, last3Digits } = parseFormattedIdentity(participant.nickname);
        return ensureStudentVaultProfile(realName, last3Digits, participant.avatar_config);
      })();

    const isOwned = isStarter || activeVault.ownedItemCodes.includes(code);
    if (!isOwned) {
      const bought = purchaseStudentVaultItem(activeVault.identityKey, code, priceCoins);
      if (!bought.ok || !bought.profile) {
        soundEngine.playWrongSound();
        setLobbyShopMsg(bought.error || 'เหรียญสะสมไม่พอสำหรับซื้อไอเทมนี้');
        return;
      }
      setVaultProfile(bought.profile);
      setLobbyShopMsg(`🎉 ปลดล็อกไอเทมสำเร็จ! (เหลือ ${bought.profile.walletCoins.toLocaleString()} เหรียญ)`);
    }

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
    const savedVault = saveStudentVaultAvatar(activeVault.identityKey, nextConfig);
    if (savedVault) setVaultProfile(savedVault);
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

  // Immediately restore interactive playability when teacher pardons a disqualified student (NO page refresh needed!)
  const handlePardonRestored = useCallback(
    (restoredMe: GameParticipant) => {
      wasDisqualifiedRef.current = false;
      disqualifyingRef.current = false;
      advancingRef.current = false;
      questionMountedAtRef.current = Date.now() + 1000; // 2.5s grace window so focus return won't re-trigger
      setLocalDisqualifiedReason(null);
      setSubmitting(false);
      setError(null);
      setParticipant((prev) => ({
        ...restoredMe,
        avatar_config: prev?.avatar_config || restoredMe.avatar_config,
      }));
      participantRef.current = restoredMe;
      if (roomId) {
        window.sessionStorage.setItem(`kw_participant_${roomId}`, JSON.stringify(restoredMe));
      }

      const curRoom = roomRef.current;
      const curPayload = questionPayloadRef.current;
      if (curRoom && curRoom.status === 'question_active') {
        if (!curPayload) {
          void loadStudentQuestionStep(curRoom, curRoom.current_question_index, restoredMe.id);
        } else {
          // Ensure timer is active (> 0s) so all choice buttons are immediately clickable!
          const endMs = curRoom.question_ends_at ? new Date(curRoom.question_ends_at).getTime() : 0;
          if (endMs <= Date.now() + 3000) {
            const freshSec = Math.max(15, curPayload.question.time_limit_seconds || 20);
            const freshEndsAt = new Date(Date.now() + freshSec * 1000).toISOString();
            setSecondsLeft(freshSec);
            setRoom({ ...curRoom, question_ends_at: freshEndsAt });
          }
        }
      }

      setExtraTimeNotice('✅ คุณครูปลดล็อกอนุโลมให้แล้ว! คะแนนเดิมกลับมาครบ สามารถกดตอบต่อได้ทันที!');
      setTimeout(() => setExtraTimeNotice(null), 4500);
    },
    [roomId, loadStudentQuestionStep]
  );

  useEffect(() => {
    if (participant?.is_disqualified || localDisqualifiedReason) {
      wasDisqualifiedRef.current = true;
    }
  }, [participant?.is_disqualified, localDisqualifiedReason]);

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
                if (!me.is_disqualified && wasDisqualifiedRef.current) {
                  handlePardonRestored(me);
                } else {
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
            })
            .catch(() => {});
        },
        onParticipantsChanged: () => {
          fetchRoomParticipants(roomId)
            .then((parts) => {
              setLeaderboard(parts);
              const me = parts.find((p) => p.id === participant.id);
              if (me) {
                if (!me.is_disqualified && wasDisqualifiedRef.current) {
                  handlePardonRestored(me);
                } else {
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
            })
            .catch(() => {});
        },
        onBroadcastEvent: (ev) => {
          if (ev.type === 'STUDENT_PARDONED') {
            if (ev.participant_id === participant.id) {
              fetchRoomParticipants(roomId)
                .then((parts) => {
                  setLeaderboard(parts);
                  const me = parts.find((p) => p.id === participant.id);
                  if (me && !me.is_disqualified) {
                    handlePardonRestored(me);
                  }
                })
                .catch(() => {});
            }
            syncGameState();
          } else if (
            ev.type === 'ROOM_STATUS_CHANGED' ||
            ev.type === 'GAME_FINISHED'
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

  // Polling Fallback so Lobby -> Active transitions & Pardons work reliably within 2s even if Realtime is busy
  useEffect(() => {
    if (!roomId || !room || room.status === 'finished') return;
    const isCurrentlyLocked = Boolean(participant?.is_disqualified || localDisqualifiedReason);
    const pollMs = room.status === 'lobby' || isCurrentlyLocked ? 2000 : 4500;

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
            if (!me.is_disqualified && wasDisqualifiedRef.current) {
              handlePardonRestored(me);
            } else {
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
        }
        if (latestRoom) {
          await applyServerRoomUpdate(latestRoom);
        }
      } catch {
        // Ignore transient network poll error
      }
    }, pollMs);

    return () => clearInterval(interval);
  }, [
    roomId,
    room?.status,
    participant?.is_disqualified,
    localDisqualifiedReason,
    applyServerRoomUpdate,
    handlePardonRestored,
  ]);

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

  // Countdown Timer (Paused while disqualified so pardoned students can immediately resume clicking!)
  useEffect(() => {
    if (
      !room ||
      room.status !== 'question_active' ||
      !room.question_ends_at ||
      Boolean(participant?.is_disqualified || localDisqualifiedReason)
    ) {
      if (!room || room.status !== 'question_active') {
        setSecondsLeft(0);
      }
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
        if (room.game_mode === 'serious_exam') {
          // Serious Exam: auto-advance immediately on timeout (0 pts)
          advanceToNextQuestionAuto(room);
        } else {
          // Activity Mode: stop accepting answers and wait for teacher to show podium or start next question
          soundEngine.playWrongSound();
        }
      }
      prevSec = secs;
    };
    tick();
    const interval = setInterval(tick, 300);
    return () => clearInterval(interval);
  }, [room, advanceToNextQuestionAuto, participant?.is_disqualified, localDisqualifiedReason]);

  // Shuffle choices uniquely per student in Serious Exam mode; keep exact teacher order in Activity Mode!
  const shuffledChoices = useMemo(() => {
    if (!questionPayload?.choices || !participant) return [];
    if (room?.game_mode !== 'serious_exam') {
      return questionPayload.choices;
    }
    return shuffleChoicesForStudent(
      questionPayload.choices,
      `${participant.id}_${questionPayload.question.id}`
    );
  }, [questionPayload?.choices, questionPayload?.question.id, participant?.id, room?.game_mode]);

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
    const serious = room.game_mode === 'serious_exam';

    try {
      const res = await submitGameAnswerRPC({
        roomId: room.id,
        questionId: questionPayload.question.id,
        participantId: participant.id,
        choiceId: choiceId ?? null,
        textAnswer: textAnswer.trim() || null,
      });

      // Subtle sound effects only in Activity Mode (NO spoken voice saying right/wrong!)
      if (!serious) {
        if (res.is_correct) {
          soundEngine.playCorrectSound();
          if (res.dropped_power) {
            setTimeout(() => soundEngine.playPowerUpSound(), 320);
          }
        } else {
          soundEngine.playWrongSound();
        }
      }

      setSubmittedForQuestionId(questionPayload.question.id);
      setLastSubmitResult(res);

      // Bank leftover seconds from fast answers into the Speed Time Bank (for redistributing to harder questions!)
      if (serious && secondsLeft > 0) {
        const nextBank = Math.min(180, savedBonusSeconds + secondsLeft);
        const nextFastCnt = fastAnsweredCount + 1;
        setSavedBonusSeconds(nextBank);
        setFastAnsweredCount(nextFastCnt);
        window.sessionStorage.setItem(`kw_timebank_${room.id}`, String(nextBank));
        window.sessionStorage.setItem(`kw_fastcnt_${room.id}`, String(nextFastCnt));
      }

      // Accumulate Coins & Total EXP into this student's persistent Identity Vault (kept across games for buying cosmetics!)
      if (res.is_correct && vaultProfile) {
        const reward = creditStudentGameReward(vaultProfile.identityKey, {
          dedupeKey: `ans_${room.id}_${questionPayload.question.id}`,
          coins: 60,
          exp: 150,
        });
        if (reward.profile) setVaultProfile(reward.profile);
      }

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

      // Serious Exam: fast neutral auto-advance (650ms).
      // Activity Mode: DO NOT auto-advance — wait for teacher to click Stop/Podium or Next Question!
      if (serious) {
        if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = setTimeout(() => {
          advanceToNextQuestionAuto(room);
        }, 650);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ส่งคำตอบไม่สำเร็จ';
      if (msg.includes('ส่งคำตอบของข้อนี้ไปแล้ว') && serious) {
        setTimeout(() => advanceToNextQuestionAuto(room), 350);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Request Extra Time using averaged leftover seconds banked from fast-answered questions
  const handleRequestExtraTime = () => {
    if (!room || !questionPayload || room.status !== 'question_active' || !room.question_ends_at) {
      return;
    }
    if (savedBonusSeconds <= 0) {
      setExtraTimeNotice('ยังไม่มีเวลาสะสม — ตอบข้อที่ทำได้ให้เร็วเพื่อเก็บเวลาไว้เติมให้ข้อที่คิดนานนะ!');
      setTimeout(() => setExtraTimeNotice(null), 3000);
      return;
    }

    // Average saved time from fast questions (clamped 5..30s per click, or all remaining if < 5s)
    const avgFromFast = Math.round(savedBonusSeconds / Math.max(1, fastAnsweredCount));
    const addSec = Math.min(savedBonusSeconds, Math.max(Math.min(savedBonusSeconds, 10), Math.min(30, avgFromFast)));
    const nextBank = Math.max(0, savedBonusSeconds - addSec);
    const currentEndMs = Math.max(Date.now(), new Date(room.question_ends_at).getTime());
    const extendedEndsAt = new Date(currentEndMs + addSec * 1000).toISOString();

    setSavedBonusSeconds(nextBank);
    window.sessionStorage.setItem(`kw_timebank_${room.id}`, String(nextBank));
    setRoom({ ...room, question_ends_at: extendedEndsAt });
    soundEngine.playCoinSound();
    setExtraTimeNotice(
      `⏱️ ขอเวลาเพิ่มสำเร็จ! เติมเวลา +${addSec} วินาที จากค่าเฉลี่ยข้อที่ตอบเร็ว (เหลือเวลาสะสม ${nextBank}s)`
    );
    setTimeout(() => setExtraTimeNotice(null), 3500);
  };

  // Skip Question (in Serious Exam: queues skipped question to revisit at the end once; clicking skip again skips permanently)
  const handleSkipQuestion = () => {
    if (!room || !questionPayload || submitting || Boolean(hasSubmittedThisQ)) return;
    soundEngine.playClickSound();

    if (room.game_mode === 'serious_exam') {
      const order = questionOrderRef.current;
      const currentRealIdx = order[room.current_question_index];
      if (currentRealIdx !== undefined && !skippedRealIndicesRef.current.has(currentRealIdx)) {
        skippedRealIndicesRef.current.add(currentRealIdx);
        questionOrderRef.current = [...order, currentRealIdx];
        setExtraTimeNotice('⏭️ ข้ามข้อนี้ไว้ก่อนแล้ว — ระบบจะนำกลับมาให้ทำอีกครั้งตอนท้ายชุด!');
        setTimeout(() => setExtraTimeNotice(null), 3000);
      } else {
        setExtraTimeNotice('⏭️ ข้ามข้อนี้แล้ว (+0 คะแนน) — กำลังไปข้อถัดไป...');
        setTimeout(() => setExtraTimeNotice(null), 2500);
      }
      advanceToNextQuestionAuto(room);
      return;
    }

    // Activity Mode: lock this question as skipped and wait for teacher
    setSubmittedForQuestionId(questionPayload.question.id);
    setExtraTimeNotice('⏭️ ข้ามข้อนี้แล้ว (+0 คะแนน) — รอคุณครูกดโชว์โพเดียม หรือเริ่มข้อถัดไป...');
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-game text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Palette className="w-4 h-4 text-kw-blue" /> แต่งตัวละครในห้องรอ (อัปเดตสดทันที)
                  </span>
                  <div className="flex items-center gap-2">
                    {vaultProfile && (
                      <span className="px-2.5 py-0.5 rounded-full bg-kw-yellow border-2 border-slate-900 text-xs font-extrabold">
                        💰 {vaultProfile.walletCoins.toLocaleString()} เหรียญ
                      </span>
                    )}
                    {savingLobbyAvatar && (
                      <span className="text-[11px] font-bold text-kw-blue flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> กำลังซิงค์...
                      </span>
                    )}
                  </div>
                </div>

                {lobbyShopMsg && (
                  <div className="p-2 rounded-xl bg-amber-100 border-2 border-slate-900 text-xs font-extrabold text-slate-900">
                    {lobbyShopMsg}
                  </div>
                )}

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

                {/* Items Grid (Free/Owned + Locked Shop Items buyable with accumulated Coins!) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
                  {BUILTIN_AVATAR_CATALOG.filter((it) => it.slot === lobbyAvatarSlot).map((item) => {
                    const fieldMap: Record<AvatarSlot, keyof AvatarConfig> = {
                      gender: 'gender',
                      face: 'face',
                      base_character: 'base',
                      hair: 'hair',
                      outfit: 'outfit',
                      hat: 'hat',
                      accessory: 'accessory',
                    };
                    const isOwned =
                      item.is_starter ||
                      Boolean(vaultProfile?.ownedItemCodes.includes(item.code));
                    const isEquipped = participant.avatar_config[fieldMap[item.slot]] === item.code;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          handleSelectLobbyAvatarItem(
                            item.slot,
                            item.code,
                            item.is_starter,
                            item.price_coins
                          )
                        }
                        className={`p-2.5 rounded-xl border-2 border-slate-900 text-left flex items-center justify-between gap-2 transition ${
                          isEquipped
                            ? 'bg-kw-yellow ring-2 ring-slate-900'
                            : isOwned
                              ? 'bg-slate-50 hover:bg-amber-50'
                              : 'bg-slate-100/90 hover:bg-amber-50 opacity-90'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-5 h-5 rounded-full border-2 border-slate-900 shrink-0"
                            style={{ backgroundColor: item.preview_color }}
                          />
                          <span className="text-xs font-bold text-slate-900 leading-tight truncate">
                            {item.name}
                          </span>
                        </div>
                        {!isOwned && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded-lg bg-slate-900 text-kw-yellow text-[10px] font-extrabold">
                            🔒 {item.price_coins}
                          </span>
                        )}
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
              {isSeriousExam ? (
                <>
                  <li>
                    <strong>สุ่มสลับข้อสอบและตัวเลือกรายคน:</strong> ในเวลาเดียวกันคุณจะได้ทำคนละข้อกับเพื่อนข้างๆ
                  </li>
                  <li>
                    <strong>หมดเวลาไปข้อถัดไปอัตโนมัติ:</strong> หากหมดเวลาแล้วยังไม่ตอบ จะได้ 0 คะแนนในข้อนั้นและไปข้อถัดไปทันที
                  </li>
                  <li>
                    <strong>โหมดสอบจริงไม่เฉลยคำตอบรายข้อ:</strong> นับเฉพาะคะแนนสอบจริง (1 คะแนน/ข้อ) และทราบคะแนนรวมทันทีเมื่อทำครบทุกข้อ
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <strong>ข้อสอบตรงกันทั้งห้องพร้อมหน้าจอคุณครู:</strong> ทุกคนทำข้อเดียวกันพร้อมกัน และรอคุณครูกดโชว์โพเดียมหรือกดเริ่มข้อถัดไป
                  </li>
                  <li>
                    <strong>โหมดกิจกรรมสนุกสุดมันส์:</strong> มีโพเดียม Top 3 และเลือกเพื่อนโจมตีแต้มเกมได้ (ไม่ลดคะแนนสอบจริง) พร้อมรับเหรียญสะสมแต่งตัวละคร!
                  </li>
                </>
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
                {displayTotalQ > 0 ? ` / ${Math.max(displayTotalQ, questionOrderRef.current.length)}` : ''}
              </span>
              {isSeriousExam &&
                questionOrderRef.current[room.current_question_index] !== undefined &&
                skippedRealIndicesRef.current.has(
                  questionOrderRef.current[room.current_question_index]
                ) && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-200 border border-slate-900 text-slate-900 text-[10px] font-extrabold">
                    🔄 ข้อที่ข้ามไว้ก่อนหน้า
                  </span>
                )}
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

          {/* Skip Question & Request Extra Time Bar (Uses averaged leftover seconds from fast answers!) */}
          {!hasSubmittedThisQ && secondsLeft > 0 && (
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 pt-2 border-t-2 border-slate-200">
              {isSeriousExam ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-sky-100 border-2 border-slate-900 text-[11px] sm:text-xs font-extrabold text-slate-900">
                    ⏳ เวลาสะสมจากข้อที่ตอบเร็ว: +{savedBonusSeconds} วิ
                  </span>
                  <button
                    type="button"
                    disabled={savedBonusSeconds <= 0}
                    onClick={handleRequestExtraTime}
                    className="px-3 py-1.5 rounded-xl bg-kw-green text-white border-2 border-slate-900 font-game font-extrabold text-xs inline-flex items-center gap-1.5 shadow-sm disabled:opacity-45"
                    title="นำเวลาที่เหลือเฉลี่ยจากข้อที่ตอบเร็วมาเพิ่มให้ข้อนี้"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>
                      ขอเวลาเพิ่ม (
                      {savedBonusSeconds > 0
                        ? `+${Math.min(
                            savedBonusSeconds,
                            Math.max(
                              Math.min(savedBonusSeconds, 10),
                              Math.min(
                                30,
                                Math.round(savedBonusSeconds / Math.max(1, fastAnsweredCount))
                              )
                            )
                          )} วิ`
                        : 'ยังไม่มีเวลาสะสม'}
                      )
                    </span>
                  </button>
                </div>
              ) : (
                <span className="text-[11px] font-bold text-slate-500">
                  หากยังคิดไม่ออกสามารถกดข้ามข้อนี้ได้
                </span>
              )}

              <button
                type="button"
                disabled={submitting}
                onClick={handleSkipQuestion}
                className="px-3.5 py-1.5 rounded-xl bg-slate-200 hover:bg-amber-100 text-slate-900 border-2 border-slate-900 font-game font-extrabold text-xs inline-flex items-center gap-1.5"
              >
                <SkipForward className="w-4 h-4" />
                <span>
                  {isSeriousExam &&
                  questionOrderRef.current[room.current_question_index] !== undefined &&
                  skippedRealIndicesRef.current.has(
                    questionOrderRef.current[room.current_question_index]
                  )
                    ? 'ข้ามเลย (ไม่ตอบข้อนี้)'
                    : isSeriousExam
                      ? 'ข้ามข้อนี้ก่อน (กลับมาทำทีหลัง)'
                      : 'ข้ามข้อนี้'}
                </span>
              </button>
            </div>
          )}

          {extraTimeNotice && (
            <div className="relative z-10 p-2.5 rounded-xl bg-sky-100 border-2 border-sky-700 text-sky-950 text-xs font-extrabold text-center">
              {extraTimeNotice}
            </div>
          )}

          {/* Activity Mode: Timeout Notice while waiting for teacher */}
          {!isSeriousExam && !lastSubmitResult && secondsLeft <= 0 && (
            <div className="relative z-10 p-4 rounded-2xl bg-amber-100 border-3 border-slate-900 text-center font-game font-extrabold text-sm text-slate-900">
              ⏰ หมดเวลาข้อนี้แล้ว (+0 คะแนน) — รอคุณครูกดหยุดโชว์โพเดียม หรือเริ่มข้อถัดไป...
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
                      <span className="px-3 py-1 rounded-xl bg-slate-900 text-kw-yellow font-game font-extrabold text-xs animate-pulse">
                        ⏳ รอคุณครูกดโชว์โพเดียม หรือเริ่มข้อถัดไป...
                      </span>
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
            <div className="card-game p-6 sm:p-8 text-center space-y-5 bg-emerald-50">
              <CheckCircle2 className="w-14 h-14 mx-auto text-kw-green" />
              <div className="space-y-1">
                <span className="inline-block px-3 py-1 rounded-full bg-slate-900 text-kw-yellow font-game text-xs font-extrabold">
                  📝 ผลการสอบวัดความรู้จริง (Real Exam Score)
                </span>
                <h2 className="font-game text-2xl sm:text-3xl font-extrabold text-slate-900 pt-1">
                  ส่งข้อสอบครบทุกข้อเรียบร้อยแล้ว!
                </h2>
              </div>

              {/* Instant Real Exam Score Summary Card (No answer reveal) */}
              <div className="max-w-md mx-auto p-5 rounded-3xl bg-white border-4 border-slate-900 shadow-block-sm space-y-2">
                <div className="text-xs font-extrabold text-slate-600">
                  ผู้เข้าสอบ: <span className="text-slate-900">{participant.nickname}</span>
                </div>
                <div className="text-xs font-extrabold uppercase text-emerald-700">
                  คะแนนสอบจริงที่คุณทำได้
                </div>
                <div className="font-game text-4xl sm:text-5xl font-extrabold text-kw-green">
                  {participant.correct_count}{' '}
                  <span className="text-2xl text-slate-600">
                    / {displayTotalQ > 0 ? displayTotalQ : '-'} คะแนน
                  </span>
                </div>
                {displayTotalQ > 0 && (
                  <div className="inline-block px-3 py-1 rounded-full bg-emerald-100 border-2 border-emerald-700 text-emerald-950 font-game font-extrabold text-sm">
                    คิดเป็น {Math.round((participant.correct_count / displayTotalQ) * 100)}%
                  </div>
                )}
              </div>

              <p className="text-xs sm:text-sm font-bold text-slate-700 max-w-md mx-auto">
                ระบบบันทึกคะแนนของ <strong>{participant.nickname}</strong> ลงฐานข้อมูลคุณครูเรียบร้อยแล้ว
                (โหมดสอบวัดความรู้จริงจะไม่เฉลยคำตอบรายข้อเพื่อป้องกันการบอกข้อสอบเพื่อน)
              </p>
              <div className="pt-1">
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
                  {room.status === 'finished' ? 'สรุปผลคะแนนกิจกรรมและโพเดียม!' : '🏆 โพเดียมผู้นำรอบนี้!'}
                </h2>
                {room.status === 'leaderboard' && (
                  <div className="inline-block px-4 py-1.5 rounded-full bg-slate-900 text-kw-yellow font-game text-xs font-extrabold animate-pulse">
                    ⏳ พักดูโพเดียม — รอคุณครูกดเริ่มข้อถัดไป...
                  </div>
                )}

                {/* Visual Top-3 Podium on Student Screen when Teacher clicks Stop/Podium */}
                {top3Leaderboard.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 items-end max-w-xl mx-auto pt-2">
                    {/* 2nd Place */}
                    <div className="p-2.5 sm:p-3 rounded-2xl bg-slate-100 border-3 border-slate-900 text-center space-y-1">
                      <div className="font-game text-xs font-extrabold text-slate-700">🥈 #2</div>
                      {top3Leaderboard[1] ? (
                        <>
                          <div className="flex justify-center">
                            <AvatarRenderer config={top3Leaderboard[1].avatar_config} size="sm" animate={false} />
                          </div>
                          <div className="text-xs font-extrabold truncate">{top3Leaderboard[1].nickname}</div>
                          <div className="text-[11px] font-bold text-kw-blue">
                            {top3Leaderboard[1].current_score.toLocaleString()} EXP
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-400 py-4">-</div>
                      )}
                    </div>

                    {/* 1st Place */}
                    <div className="p-3 sm:p-4 rounded-2xl bg-gradient-to-b from-amber-200 to-kw-yellow border-3 border-slate-900 shadow-block-sm text-center space-y-1 -translate-y-2">
                      <div className="font-game text-xs sm:text-sm font-extrabold text-kw-red">👑 #1</div>
                      <div className="flex justify-center">
                        <AvatarRenderer config={top3Leaderboard[0].avatar_config} size="md" />
                      </div>
                      <div className="text-xs sm:text-sm font-extrabold truncate">{top3Leaderboard[0].nickname}</div>
                      <div className="text-xs font-extrabold text-slate-900">
                        {top3Leaderboard[0].current_score.toLocaleString()} EXP
                      </div>
                    </div>

                    {/* 3rd Place */}
                    <div className="p-2.5 sm:p-3 rounded-2xl bg-orange-100 border-3 border-slate-900 text-center space-y-1">
                      <div className="font-game text-xs font-extrabold text-amber-800">🥉 #3</div>
                      {top3Leaderboard[2] ? (
                        <>
                          <div className="flex justify-center">
                            <AvatarRenderer config={top3Leaderboard[2].avatar_config} size="sm" animate={false} />
                          </div>
                          <div className="text-xs font-extrabold truncate">{top3Leaderboard[2].nickname}</div>
                          <div className="text-[11px] font-bold text-kw-orange">
                            {top3Leaderboard[2].current_score.toLocaleString()} EXP
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-400 py-4">-</div>
                      )}
                    </div>
                  </div>
                )}

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
