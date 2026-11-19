import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Gamepad2,
  QrCode,
  Sparkles,
  ArrowRight,
  AlertCircle,
  Loader2,
  IdCard,
  User,
  Coins,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AvatarRenderer, BUILTIN_AVATAR_CATALOG } from '../components/avatar/AvatarRenderer';
import { QuestionBlockIcon } from '../components/ui/WorldDecorations';
import { joinGameRoomRPC } from '../services/gameEngineService';
import { formatStudentExamIdentity } from '../lib/securityGuard';
import {
  ensureStudentVaultProfile,
  fetchStudentVaultFromCloud,
  getStudentVaultProfile,
  saveStudentVaultAvatar,
  StudentVaultProfile,
} from '../lib/studentIdentityVault';
import { AvatarSlot } from '../types/database';
import { soundEngine } from '../lib/soundEngine';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { avatarConfig, setLocalAvatarConfig, isSupabaseConfigured } = useAuth();

  // Join Game PIN State (Real Name + Last 3 Digits of Student ID — No Student Account needed!)
  const [pinCode, setPinCode] = useState(searchParams.get('pin') || '');
  const [realName, setRealName] = useState(() => {
    try {
      return window.localStorage.getItem('kw_student_real_name') || '';
    } catch {
      return '';
    }
  });
  const [studentIdLast3, setStudentIdLast3] = useState(() => {
    try {
      return window.localStorage.getItem('kw_student_id_last3') || '';
    } catch {
      return '';
    }
  });
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<AvatarSlot>('hat');

  const [cloudVault, setCloudVault] = useState<StudentVaultProfile | null>(null);

  // Auto-recognize returning student by Real Name + Last 3 Digits (Local + Supabase Cloud across ANY device!)
  const localVault = useMemo(() => {
    if (realName.trim().length >= 2 && /^\d{3}$/.test(studentIdLast3.trim())) {
      return getStudentVaultProfile(realName, studentIdLast3);
    }
    return null;
  }, [realName, studentIdLast3]);

  const matchedVault = cloudVault || localVault;

  useEffect(() => {
    if (realName.trim().length < 2 || !/^\d{3}$/.test(studentIdLast3.trim())) {
      setCloudVault(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchStudentVaultFromCloud(realName.trim(), studentIdLast3.trim())
        .then((res) => {
          if (!cancelled && res) {
            setCloudVault(res);
            setLocalAvatarConfig(res.avatarConfig, res.displayIdentity);
          }
        })
        .catch(() => {});
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [realName, studentIdLast3]);

  useEffect(() => {
    if (matchedVault) {
      setLocalAvatarConfig(matchedVault.avatarConfig, matchedVault.displayIdentity);
    }
  }, [matchedVault?.identityKey]);

  const handleQuickJoinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    soundEngine.playJumpSound();
    setJoinError(null);

    const cleanPin = pinCode.trim();
    if (!/^[0-9]{6}$/.test(cleanPin)) {
      soundEngine.playWrongSound();
      setJoinError('กรุณากรอกรหัสเข้าสอบ (PIN) เป็นตัวเลข 6 หลัก');
      return;
    }

    const identity = formatStudentExamIdentity(realName, studentIdLast3);
    if (!identity.valid) {
      soundEngine.playWrongSound();
      setJoinError(identity.error || 'กรุณากรอกชื่อจริงและเลข 3 ตัวหลังของรหัสนักเรียน');
      return;
    }

    setJoinLoading(true);
    try {
      try {
        window.localStorage.setItem('kw_student_real_name', realName.trim());
        window.localStorage.setItem('kw_student_id_last3', studentIdLast3.trim());
      } catch {
        // Ignore storage errors
      }

      // Load from Supabase Cloud first (works across ANY phone/computer!), else create new vault
      const fromCloud = await fetchStudentVaultFromCloud(realName.trim(), studentIdLast3.trim()).catch(
        () => null
      );
      const vault =
        fromCloud || ensureStudentVaultProfile(realName.trim(), studentIdLast3.trim(), avatarConfig);
      const activeAvatar = fromCloud ? fromCloud.avatarConfig : avatarConfig;
      saveStudentVaultAvatar(vault.identityKey, activeAvatar);

      const participant = await joinGameRoomRPC(cleanPin, identity.formatted, activeAvatar);
      soundEngine.playPowerUpSound();
      window.sessionStorage.setItem(
        `kw_participant_${participant.room_id}`,
        JSON.stringify(participant)
      );
      navigate(`/play/${participant.room_id}?pin=${cleanPin}`);
    } catch (err) {
      soundEngine.playWrongSound();
      setJoinError(err instanceof Error ? err.message : 'ไม่สามารถเข้าร่วมห้องสอบได้');
    } finally {
      setJoinLoading(false);
    }
  };

  const starterItemsForSlot = BUILTIN_AVATAR_CATALOG.filter(
    (item) => item.slot === activeSlot && item.is_starter
  );

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8 pb-28 md:pb-20 flex flex-col gap-6 sm:gap-8">
      {/* Main Instant Exam / Game PIN Join Card (First above the fold on both Mobile & Desktop!) */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="card-game p-4 sm:p-6 md:p-8 space-y-5"
      >
        <div className="flex items-center justify-between border-b-4 border-slate-900 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-kw-green border-3 border-slate-900 flex items-center justify-center text-white shadow-block-sm shrink-0">
              <Gamepad2 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="font-game text-2xl sm:text-3xl font-extrabold text-slate-900">
                เข้าร่วมห้องสอบ / กิจกรรม
              </h1>
              <p className="text-xs sm:text-sm font-semibold text-slate-600">
                กรอกรหัส 6 หลัก, ชื่อจริง และเลข 3 ตัวหลังของรหัสนักเรียนเพื่อเข้าห้องรอครูเริ่ม
              </p>
            </div>
          </div>
          <QrCode className="w-8 h-8 text-slate-800 hidden sm:block shrink-0" />
        </div>

        <form onSubmit={handleQuickJoinGame} className="space-y-4">
          <div>
            <label className="block text-sm font-extrabold text-slate-800 mb-1">
              รหัสห้องสอบ (PIN 6 หลัก)
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={pinCode}
              onChange={(e) => {
                soundEngine.playClickSound();
                setPinCode(e.target.value.replace(/\D/g, ''));
              }}
              placeholder="000000"
              className="w-full text-center font-game text-3xl tracking-[0.25em] font-extrabold rounded-2xl border-4 border-slate-900 bg-white py-3 px-4 focus:outline-none focus:ring-4 focus:ring-kw-yellow"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8">
              <label className="block text-sm font-extrabold text-slate-800 mb-1 flex items-center gap-1.5">
                <User className="w-4 h-4 text-kw-blue" />
                <span>ชื่อ-นามสกุลจริงของนักเรียน</span>
              </label>
              <input
                type="text"
                maxLength={22}
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                placeholder="เช่น สมชาย ใจดี"
                className="w-full rounded-2xl border-4 border-slate-900 bg-white py-3 px-4 font-bold text-base text-slate-900 focus:outline-none focus:ring-4 focus:ring-kw-blue"
                required
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-sm font-extrabold text-slate-800 mb-1 flex items-center gap-1.5">
                <IdCard className="w-4 h-4 text-kw-red" />
                <span>เลข 3 ตัวหลังรหัสนักเรียน</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={studentIdLast3}
                onChange={(e) => setStudentIdLast3(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="เช่น 045"
                className="w-full text-center font-game text-2xl tracking-[0.2em] font-extrabold rounded-2xl border-4 border-slate-900 bg-white py-2.5 px-4 text-slate-900 focus:outline-none focus:ring-4 focus:ring-kw-yellow"
                required
              />
            </div>
          </div>

          {/* Quick Starter Avatar Selector (Also changeable inside Lobby while waiting!) */}
          <div className="bg-sky-50 border-3 border-slate-900 rounded-2xl p-3 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="text-xs font-extrabold uppercase text-slate-800">
                แต่งตัวละครก่อนเข้าห้อง (เปลี่ยนเพิ่มในห้องรอสอบได้ตลอด)
              </span>
              <div className="flex overflow-x-auto no-scrollbar gap-1.5 pb-1 sm:flex-wrap sm:pb-0">
                {(
                  [
                    { slot: 'gender', label: '👦👧 เพศ' },
                    { slot: 'face', label: '😊 หน้าตา' },
                    { slot: 'hair', label: '💇 ทรงผม' },
                    { slot: 'outfit', label: '👕 เสื้อผ้า' },
                    { slot: 'hat', label: '🎩 หมวก/โบว์' },
                    { slot: 'accessory', label: '👓 ของแต่ง' },
                  ] as Array<{ slot: AvatarSlot; label: string }>
                ).map((s) => (
                  <button
                    key={s.slot}
                    type="button"
                    onClick={() => {
                      soundEngine.playClickSound();
                      setActiveSlot(s.slot);
                    }}
                    className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-[11px] font-bold border-2 border-slate-900 ${
                      activeSlot === s.slot
                        ? 'bg-kw-yellow text-slate-900'
                        : 'bg-white text-slate-700'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
              <AvatarRenderer config={avatarConfig} size="lg" animate={false} />
              <div className="flex-1 grid grid-cols-2 gap-2 w-full">
                {starterItemsForSlot.map((item) => {
                  const keyMap: Record<AvatarSlot, keyof typeof avatarConfig> = {
                    gender: 'gender',
                    face: 'face',
                    base_character: 'base',
                    hair: 'hair',
                    outfit: 'outfit',
                    hat: 'hat',
                    accessory: 'accessory',
                  };
                  const propKey = keyMap[activeSlot];
                  const isSelected = avatarConfig[propKey] === item.code;
                  const itemPreviewConfig = {
                    ...avatarConfig,
                    [propKey]: item.code,
                  };

                  return (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => {
                        soundEngine.playCoinSound();
                        setLocalAvatarConfig({
                          ...avatarConfig,
                          [propKey]: item.code,
                        });
                      }}
                      className={`p-2 rounded-xl border-2 border-slate-900 text-left text-xs font-bold flex items-center gap-2.5 transition ${
                        isSelected ? 'bg-kw-yellow shadow-sm ring-2 ring-slate-900' : 'bg-white hover:bg-slate-100'
                      }`}
                    >
                      <AvatarRenderer config={itemPreviewConfig} size="sm" animate={false} />
                      <span className="truncate">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {matchedVault && (
            <div className="p-3 rounded-2xl bg-amber-100 border-3 border-slate-900 flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-slate-900">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-kw-orange shrink-0" />
                <span>ยินดีต้อนรับกลับมา, {matchedVault.displayIdentity}! โหลดตัวละครเดิมให้แล้ว</span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-lg bg-kw-yellow border border-slate-900 inline-flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-amber-800" /> {matchedVault.walletCoins.toLocaleString()} เหรียญ
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-kw-blue text-white border border-slate-900">
                  Lv.{matchedVault.level}
                </span>
              </span>
            </div>
          )}

          {joinError && (
            <div className="p-3 rounded-xl bg-red-100 border-2 border-red-600 text-red-900 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{joinError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={joinLoading || !isSupabaseConfigured}
            className="btn-game-green w-full text-lg sm:text-xl py-3.5 sm:py-4 flex items-center justify-center gap-2"
          >
            {joinLoading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>กำลังเข้าสู่ห้องรอสอบ...</span>
              </>
            ) : (
              <>
                <span>เข้าสู่ห้องสอบ / กิจกรรม!</span>
                <ArrowRight className="w-6 h-6" />
              </>
            )}
          </button>
        </form>
      </motion.div>

      {/* Compact Welcome & Avatar Studio Shortcut Banner */}
      <div className="card-game p-4 sm:p-6 bg-gradient-to-br from-kw-cream via-amber-50 to-sky-50 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <QuestionBlockIcon size="md" />
          <div>
            <h2 className="font-game text-xl sm:text-2xl font-extrabold text-slate-900">
              Knowledge World
            </h2>
            <p className="text-xs sm:text-sm text-slate-700 font-medium">
              อยากแต่งตัวละครแบบละเอียดเพิ่มเติมก่อนเข้าห้องสอบ?
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            soundEngine.playCoinSound();
            navigate('/student');
          }}
          className="btn-game-yellow w-full sm:w-auto text-sm px-5 py-3 flex items-center justify-center gap-2 shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          <span>เปิดสตูดิโอแต่งตัวละคร</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
