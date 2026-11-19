import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wifi,
  WifiOff,
  Coins,
  Star,
  Shield,
  LogOut,
  Database,
  Sparkles,
  UserCheck,
  GraduationCap,
  Gamepad2,
  Copy,
  Check,
  ExternalLink,
  Volume2,
  VolumeX,
  Music,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getSupabaseConfig,
  saveRuntimeSupabaseConfig,
  clearRuntimeSupabaseConfig,
} from '../../lib/supabase';
import { soundEngine } from '../../lib/soundEngine';
import { isTeacherGateUnlocked } from '../../lib/securityGuard';

import schemaSql from '../../../supabase/migrations/001_schema.sql?raw';
import rpcSql from '../../../supabase/migrations/002_rpc_and_security.sql?raw';
import seedSql from '../../../supabase/migrations/003_seed_data.sql?raw';

export const QuestionBlockIcon: React.FC<{ size?: 'sm' | 'md' | 'lg'; animate?: boolean }> = ({
  size = 'md',
  animate = true,
}) => {
  const dims =
    size === 'sm'
      ? 'w-9 h-9 text-lg'
      : size === 'lg'
        ? 'w-20 h-20 text-4xl'
        : 'w-12 h-12 text-2xl';

  return (
    <motion.div
      animate={animate ? { y: [0, -5, 0] } : undefined}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      onClick={() => soundEngine.playCoinSound()}
      className={`${dims} cursor-pointer relative inline-flex items-center justify-center rounded-xl bg-kw-yellow border-4 border-slate-900 shadow-block-sm font-game font-bold text-slate-900 select-none`}
    >
      <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-amber-700" />
      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-700" />
      <span className="absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full bg-amber-700" />
      <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-700" />
      ?
    </motion.div>
  );
};

export const CoinBadge: React.FC<{ amount: number }> = ({ amount }) => (
  <div className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-kw-yellow border-2 border-slate-900 font-game font-bold text-xs sm:text-sm text-slate-900 shadow-sm">
    <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-700 fill-amber-400" />
    <span>{amount.toLocaleString()}</span>
  </div>
);

export const LevelBadge: React.FC<{ level: number; exp: number }> = ({ level, exp }) => (
  <div className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-kw-blue border-2 border-slate-900 font-game font-bold text-xs sm:text-sm text-white shadow-sm">
    <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-kw-yellow fill-kw-yellow" />
    <span>Lv.{level}</span>
    <span className="hidden sm:inline text-xs opacity-90">({exp} EXP)</span>
  </div>
);

export const WorldBackgroundDecor: React.FC = () => (
  <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
    {/* Cartoon Clouds */}
    <motion.div
      animate={{ x: [0, 35, 0] }}
      transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      className="absolute top-16 left-[6%] w-36 h-14 bg-white/90 rounded-full border-4 border-slate-900/20 shadow-md"
    />
    <motion.div
      animate={{ x: [0, -40, 0] }}
      transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      className="absolute top-24 right-[10%] w-44 h-16 bg-white/90 rounded-full border-4 border-slate-900/20 shadow-md"
    />
    {/* Bottom Green Platform Hills & Pipes */}
    <div className="absolute bottom-0 inset-x-0 h-10 bg-kw-green border-t-4 border-slate-900" />
    <div className="hidden lg:block absolute bottom-10 left-12 w-16 h-20 pipe-green rounded-t-lg">
      <div className="-mx-2 -mt-1 h-6 pipe-green rounded-md" />
    </div>
    <div className="hidden lg:block absolute bottom-10 right-16 w-16 h-24 pipe-green rounded-t-lg">
      <div className="-mx-2 -mt-1 h-6 pipe-green rounded-md" />
    </div>
  </div>
);

export const TopAdventureNavbar: React.FC = () => {
  const { profile, isOnline, isSupabaseConfigured, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => soundEngine.getMuted());
  const [bgmOn, setBgmOn] = useState<boolean>(() => soundEngine.isBgmActive());

  const supaConfig = getSupabaseConfig();
  const [urlInput, setUrlInput] = useState(supaConfig.url);
  const [anonInput, setAnonInput] = useState(supaConfig.anonKey);

  // Strict Portal Separation: Teacher UI elements ONLY appear inside /teacher* routes AFTER unlocking Teacher Passcode Vault
  const isTeacherRoute = location.pathname.startsWith('/teacher');
  const isTeacherLocked = isTeacherRoute && !isTeacherGateUnlocked();
  const isTeacherPortal = isTeacherRoute && profile?.role !== 'student' && isTeacherGateUnlocked();

  const isPlayingExam = location.pathname.startsWith('/play');

  const handleCopyAllSql = async () => {
    soundEngine.playCoinSound();
    const combinedSql = [
      '-- ==========================================',
      '-- PART 1: 001_schema.sql',
      '-- ==========================================',
      schemaSql,
      '\n-- ==========================================',
      '-- PART 2: 002_rpc_and_security.sql',
      '-- ==========================================',
      rpcSql,
      '\n-- ==========================================',
      '-- PART 3: 003_seed_data.sql',
      '-- ==========================================',
      seedSql,
    ].join('\n');

    await navigator.clipboard.writeText(combinedSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3500);
  };

  return (
    <>
      {/* Offline / Reconnecting Banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-kw-red text-white border-b-4 border-slate-900 px-4 py-2 text-center font-bold flex items-center justify-center gap-2"
          >
            <WifiOff className="w-5 h-5 animate-pulse" />
            <span>สัญญาณอินเทอร์เน็ตขาดหาย — ระบบกำลังรอเชื่อมต่อกลับเข้าห้องเกมอัตโนมัติ (Auto-Reconnect)...</span>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-40 bg-kw-cream/95 backdrop-blur border-b-4 border-slate-900 px-3 py-2 sm:px-4 sm:py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <Link
            to={isTeacherPortal ? '/teacher' : '/'}
            onClick={() => soundEngine.playClickSound()}
            className="flex items-center gap-2 sm:gap-3 group min-w-0"
          >
            <QuestionBlockIcon size="sm" animate={false} />
            <div className="min-w-0">
              <span className="font-game text-lg sm:text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-1.5 truncate">
                KNOWLEDGE <span className="text-kw-red">WORLD</span>
                {isTeacherPortal && (
                  <span className="ml-1 px-2 py-0.5 rounded-lg bg-kw-orange text-white text-[10px] sm:text-xs">
                    TEACHER PORTAL
                  </span>
                )}
              </span>
              <span className="hidden sm:block text-xs font-semibold text-slate-600 -mt-1">
                {isTeacherPortal
                  ? 'ระบบจัดการห้องเรียน ข้อสอบ และการแข่งขันสำหรับคุณครู'
                  : '3D Cartoon Adventure Quiz & RPG World'}
              </span>
            </div>
          </Link>

          <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
            {/* When /teacher is locked: show ZERO nav buttons/clutter — only the clean passcode login screen */}
            {!isTeacherLocked && (
              <>
            {/* Sound Effects (SFX) Toggle */}
            <button
              type="button"
              onClick={() => {
                const nextMuted = soundEngine.toggleMute();
                setIsMuted(nextMuted);
                if (nextMuted) setBgmOn(false);
              }}
              className={`inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold border-2 border-slate-900 transition ${
                !isMuted ? 'bg-emerald-100 text-emerald-950' : 'bg-slate-200 text-slate-600'
              }`}
              title="เปิด/ปิดเสียงเอฟเฟกต์เกม (SFX)"
            >
              {!isMuted ? (
                <Volume2 className="w-4 h-4 text-emerald-700" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-500" />
              )}
              <span className="hidden md:inline">{!isMuted ? 'เสียงเกม: เปิด' : 'เสียงเกม: ปิด'}</span>
            </button>

            {/* Background Music (BGM) Toggle */}
            <button
              type="button"
              onClick={() => {
                const active = soundEngine.toggleBGM(
                  location.pathname.startsWith('/play') ? 'quiz' : 'adventure'
                );
                setBgmOn(active);
                setIsMuted(soundEngine.getMuted());
              }}
              className={`inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold border-2 border-slate-900 transition ${
                bgmOn
                  ? 'bg-kw-yellow text-slate-950 shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
              title="เปิด/ปิดเพลงประกอบโลกผจญภัย (BGM)"
            >
              <Music className={`w-4 h-4 ${bgmOn ? 'text-kw-red animate-bounce' : ''}`} />
              <span className="hidden md:inline">{bgmOn ? 'เพลง BGM: เล่นอยู่' : 'เปิดเพลง BGM'}</span>
            </button>

            {/* Network Status Pill */}
            <div
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border-2 border-slate-900 ${
                isOnline ? 'bg-sky-100 text-sky-900' : 'bg-red-100 text-red-900'
              }`}
            >
              {isOnline ? (
                <Wifi className="w-3.5 h-3.5 text-sky-600" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-red-600" />
              )}
              <span>{isOnline ? 'Online' : 'Reconnecting...'}</span>
            </div>

            {/* ==============================================================
                STRICT ROLE SEPARATION:
                1) TEACHER PORTAL NAVBAR (/teacher*)
                2) STUDENT PORTAL NAVBAR (/, /student, /play*) — ZERO TEACHER ITEMS!
               ============================================================== */}
            {isTeacherPortal ? (
              <>
                {!isSupabaseConfigured && (
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playClickSound();
                      setShowConfigModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border-2 border-slate-900 transition bg-amber-300 text-slate-950 animate-pulse shadow-sm"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>⚙️ ตั้งค่าเชื่อม Supabase DB</span>
                  </button>
                )}

                <Link
                  to="/teacher"
                  onClick={() => soundEngine.playClickSound()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-kw-orange text-white font-bold text-xs sm:text-sm border-2 border-slate-900 shadow-sm hover:brightness-105"
                >
                  <GraduationCap className="w-4 h-4" />
                  <span>จัดการข้อสอบ & ห้องเรียน</span>
                </Link>

                {profile && (
                  <button
                    type="button"
                    onClick={async () => {
                      soundEngine.playClickSound();
                      await signOut();
                      navigate('/teacher');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-900 font-bold text-sm border-2 border-slate-900"
                    title="ออกจากระบบครู"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </>
            ) : (
              /* STUDENT-ONLY NAVBAR — ZERO TEACHER REFERENCES */
              <>
                <Link
                  to="/"
                  onClick={() => soundEngine.playClickSound()}
                  className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-kw-green text-white font-bold text-xs sm:text-sm border-2 border-slate-900 shadow-sm hover:brightness-105"
                >
                  <Gamepad2 className="w-4 h-4" />
                  <span>ใส่รหัสเข้าเล่นเกม</span>
                </Link>

                <Link
                  to="/student"
                  onClick={() => soundEngine.playClickSound()}
                  className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-kw-yellow text-slate-900 font-bold text-xs sm:text-sm border-2 border-slate-900 shadow-sm hover:brightness-105"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>แต่ง Avatar & ร้านค้า</span>
                </Link>

                {profile && (
                  <>
                    <CoinBadge amount={profile.coins} />
                    <LevelBadge level={profile.level} exp={profile.exp} />
                    {!isPlayingExam && (
                      <button
                        type="button"
                        onClick={async () => {
                          soundEngine.playClickSound();
                          await signOut();
                          navigate('/');
                        }}
                        className="inline-flex items-center gap-1 p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-900 font-bold text-sm border-2 border-slate-900"
                        title="ออกจากระบบนักเรียน"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </>
            )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Fixed Mobile Bottom Navigation Bar (Students only, hidden during live /play exam & /teacher*) */}
      {!isTeacherRoute && !isPlayingExam && (
        <nav
          aria-label="Mobile Student Navigation"
          className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-kw-cream/95 backdrop-blur border-t-4 border-slate-900 px-3 pt-2 safe-bottom"
        >
          <div className="max-w-md mx-auto grid grid-cols-2 gap-2.5">
            <Link
              to="/"
              onClick={() => soundEngine.playClickSound()}
              className={`min-h-[48px] px-3 py-2 rounded-2xl border-3 border-slate-900 font-game font-extrabold text-xs flex items-center justify-center gap-1.5 transition ${
                location.pathname === '/'
                  ? 'bg-kw-green text-white shadow-block-sm'
                  : 'bg-white text-slate-800'
              }`}
            >
              <Gamepad2 className="w-4 h-4 shrink-0" />
              <span>ใส่รหัสเข้าเล่นเกม</span>
            </Link>
            <Link
              to="/student"
              onClick={() => soundEngine.playClickSound()}
              className={`min-h-[48px] px-3 py-2 rounded-2xl border-3 border-slate-900 font-game font-extrabold text-xs flex items-center justify-center gap-1.5 transition ${
                location.pathname.startsWith('/student')
                  ? 'bg-kw-yellow text-slate-900 shadow-block-sm'
                  : 'bg-white text-slate-800'
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>แต่ง Avatar & ร้านค้า</span>
            </Link>
          </div>
        </nav>
      )}

      {/* Supabase Environment Connection Modal (Teacher Portal Only) */}
      <AnimatePresence>
        {showConfigModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card-game max-w-xl w-full p-6 space-y-4 my-8"
            >
              <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-6 h-6 text-kw-blue" />
                  <h3 className="font-game text-xl font-bold">
                    วิธีเชื่อมต่อฐานข้อมูล Supabase (สำหรับผู้ดูแลระบบ / ครู)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="text-slate-500 hover:text-slate-900 font-bold text-lg"
                >
                  ✕
                </button>
              </div>

              <div className="bg-amber-50 border-3 border-slate-900 rounded-2xl p-4 space-y-3">
                <div className="font-bold text-sm text-slate-900 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-kw-red" />
                    ขั้นตอนที่ 1: สร้างตารางฐานข้อมูลทั้ง 25 ตารางในคลิกเดียว
                  </span>
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-kw-blue underline font-extrabold"
                  >
                    เปิดเว็บ Supabase <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <ol className="list-decimal list-inside text-xs text-slate-700 space-y-1">
                  <li>เข้าเว็บ <strong>Supabase Dashboard</strong> แล้วกด <strong>New Project</strong></li>
                  <li>ไปที่เมนูซ้ายมือชื่อ <strong>SQL Editor</strong> แล้วกด <strong>New Query</strong></li>
                  <li>กดปุ่มด้านล่างเพื่อคัดลอกโค้ด SQL ทั้งหมดไปวาง แล้วกดปุ่ม <strong>RUN</strong></li>
                </ol>

                <button
                  type="button"
                  onClick={handleCopyAllSql}
                  className="btn-game-yellow w-full py-2.5 text-xs flex items-center justify-center gap-2"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-700" />
                      <span>คัดลอกโค้ด SQL ทั้ง 3 ไฟล์แล้ว! นำไปวางใน Supabase SQL Editor ได้เลย</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>📋 คัดลอกโค้ด SQL ทั้งหมด (25 ตาราง + RLS + 9 RPCs + ข้อมูลเริ่มต้น)</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-3">
                <div className="font-bold text-sm text-slate-900">
                  ขั้นตอนที่ 2: นำค่าจากเมนู Project Settings → API มาใส่ด้านล่าง
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    1. Project URL (VITE_SUPABASE_URL)
                  </label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://xxxxxxxxxxxx.supabase.co"
                    className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-sm font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    2. Project API Keys → anon public (VITE_SUPABASE_ANON_KEY)
                  </label>
                  <input
                    type="password"
                    value={anonInput}
                    onChange={(e) => setAnonInput(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-sm font-mono bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                {supaConfig.isConfigured && (
                  <button
                    type="button"
                    onClick={clearRuntimeSupabaseConfig}
                    className="px-4 py-2 rounded-xl border-2 border-slate-900 bg-slate-200 text-xs font-bold"
                  >
                    ล้างค่าที่บันทึก
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 rounded-xl border-2 border-slate-900 bg-white text-xs font-bold"
                >
                  ปิดหน้าต่าง
                </button>
                <button
                  type="button"
                  onClick={() => saveRuntimeSupabaseConfig(urlInput, anonInput)}
                  className="btn-game-green text-sm py-2.5 px-5"
                >
                  บันทึกและเชื่อมต่อทันที
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
