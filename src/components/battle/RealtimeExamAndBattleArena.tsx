import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Swords,
  Flame,
  Sparkles,
  Magnet,
  FileSpreadsheet,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Volume2,
  RotateCcw,
  Trash2,
  Play,
} from 'lucide-react';
import { AvatarRenderer } from '../avatar/AvatarRenderer';
import { soundEngine } from '../../lib/soundEngine';
import {
  BattleLogEntry,
  QuestionByQuestionStudentRow,
  exportQuestionByQuestionExcel,
  INITIAL_DEMO_BATTLE_LOGS,
  INITIAL_DEMO_STUDENTS,
  saveDemoBattleLogs,
  saveDemoStudents,
} from '../../lib/demoDataStore';

interface RealtimeExamAndBattleArenaProps {
  quizTitle: string;
  totalQuestions: number;
  students: QuestionByQuestionStudentRow[];
  onStudentsChange: (next: QuestionByQuestionStudentRow[]) => void;
  battleLogs: BattleLogEntry[];
  onBattleLogsChange: (next: BattleLogEntry[]) => void;
  isDemoActive: boolean;
  onClearDemoData: () => void;
  onRestoreDemoData: () => void;
}

export const RealtimeExamAndBattleArena: React.FC<RealtimeExamAndBattleArenaProps> = ({
  quizTitle,
  totalQuestions,
  students,
  onStudentsChange,
  battleLogs,
  onBattleLogsChange,
  isDemoActive,
  onClearDemoData,
  onRestoreDemoData,
}) => {
  const [attackerId, setAttackerId] = useState<string>(students[0]?.participant_id || 'demo_p1');
  const [targetId, setTargetId] = useState<string>(students[2]?.participant_id || 'demo_p3');
  const [activeAttackerAnim, setActiveAttackerAnim] = useState<'idle' | 'attack_dash' | 'victory_jump'>('idle');
  const [activeTargetAnim, setActiveTargetAnim] = useState<'idle' | 'hit_shake'>('idle');
  const [projectileType, setProjectileType] = useState<'none' | 'fireball' | 'steal' | 'heal'>('none');
  const [floatingDamageText, setFloatingDamageText] = useState<string | null>(null);
  const [voiceSubtitle, setVoiceSubtitle] = useState<string | null>(null);

  const activeStudents = students.filter((s) => !s.is_disqualified);
  const attacker = students.find((s) => s.participant_id === attackerId) || activeStudents[0];
  const target = students.find((s) => s.participant_id === targetId) || activeStudents[1] || activeStudents[0];

  const triggerBattleAction = (action: 'fireball' | 'steal_exp' | 'self_heal') => {
    if (!attacker || !target) return;
    const isFemale = attacker.avatar_config.gender === 'female';
    const nowStr = new Date().toLocaleTimeString('th-TH', { hour12: false });

    if (action === 'fireball') {
      const dmg = 350;
      soundEngine.playAttackHitSound();
      const speech = `ย๊ากกก! ${attacker.nickname} พุ่งยิงลูกไฟลดแต้มเกม ${target.nickname} สามร้อยห้าสิบแต้ม! คะแนนสอบจริงไม่ลดนะจ๊ะ!`;
      soundEngine.speakCharacterVoice(speech, isFemale);
      setVoiceSubtitle(`🗣️ "${speech}"`);

      setProjectileType('fireball');
      setActiveAttackerAnim('attack_dash');
      setTimeout(() => {
        setActiveTargetAnim('hit_shake');
        setFloatingDamageText(`💥 -${dmg} Game EXP! (คะแนนสอบจริง ${target.real_exam_score}/${totalQuestions} เท่าเดิม)`);
      }, 220);

      const updated = students.map((s) => {
        if (s.participant_id === attacker.participant_id) {
          return { ...s, damage_dealt: s.damage_dealt + dmg };
        }
        if (s.participant_id === target.participant_id) {
          return {
            ...s,
            game_exp_score: Math.max(0, s.game_exp_score - dmg),
            damage_taken: s.damage_taken + dmg,
          };
        }
        return s;
      });
      onStudentsChange(updated);
      saveDemoStudents(updated);

      const newLog: BattleLogEntry = {
        id: `bl_${Date.now()}`,
        timestamp: nowStr,
        attacker_name: attacker.nickname,
        target_name: target.nickname,
        action_type: 'fireball',
        exp_delta: dmg,
        message: `🔥 ${attacker.nickname} พุ่งยิงลูกไฟ 3D ใส่ ${target.nickname} ลดแต้มเกม -${dmg} EXP! (คะแนนสอบจริง ${target.real_exam_score}/${totalQuestions} ไม่ถูกแตะต้อง!)`,
      };
      const nextLogs = [newLog, ...battleLogs];
      onBattleLogsChange(nextLogs);
      saveDemoBattleLogs(nextLogs);
    } else if (action === 'steal_exp') {
      const stolen = Math.min(250, target.game_exp_score);
      soundEngine.playStealExpSound();
      const speech = `ฮ่าๆ! ขอแย่งแต้มเกมจาก ${target.nickname} สองร้อยห้าสิบแต้ม มาอัปเลเวลให้ตัวเองหน่อยนะ!`;
      soundEngine.speakCharacterVoice(speech, isFemale);
      setVoiceSubtitle(`🗣️ "${speech}"`);

      setProjectileType('steal');
      setActiveAttackerAnim('victory_jump');
      setActiveTargetAnim('hit_shake');
      setFloatingDamageText(`🧲 แย่งแต้มเกม +${stolen} EXP สำเร็จ!`);

      const updated = students.map((s) => {
        if (s.participant_id === attacker.participant_id) {
          return {
            ...s,
            game_exp_score: s.game_exp_score + stolen,
            damage_dealt: s.damage_dealt + stolen,
          };
        }
        if (s.participant_id === target.participant_id) {
          return {
            ...s,
            game_exp_score: Math.max(0, s.game_exp_score - stolen),
            damage_taken: s.damage_taken + stolen,
          };
        }
        return s;
      });
      onStudentsChange(updated);
      saveDemoStudents(updated);

      const newLog: BattleLogEntry = {
        id: `bl_${Date.now()}`,
        timestamp: nowStr,
        attacker_name: attacker.nickname,
        target_name: target.nickname,
        action_type: 'steal_exp',
        exp_delta: stolen,
        message: `🧲 ${attacker.nickname} ดูดแย่งแต้มเกม +${stolen} EXP จาก ${target.nickname} มาเพิ่มให้ตัวเอง! (คะแนนสอบจริงไม่ลด!)`,
      };
      const nextLogs = [newLog, ...battleLogs];
      onBattleLogsChange(nextLogs);
      saveDemoBattleLogs(nextLogs);
    } else {
      const boost = 400;
      soundEngine.playPowerUpSound();
      const speech = `เย้! ตอบข้อสอบถูก ได้หนึ่งคะแนนจริง แถมเพิ่มพลังแต้มเกมให้ตัวเองสี่ร้อยแต้ม!`;
      soundEngine.speakCharacterVoice(speech, isFemale);
      setVoiceSubtitle(`🗣️ "${speech}"`);

      setProjectileType('heal');
      setActiveAttackerAnim('victory_jump');
      setFloatingDamageText(`✨ +${boost} Game EXP ให้ตัวเอง!`);

      const updated = students.map((s) =>
        s.participant_id === attacker.participant_id
          ? { ...s, game_exp_score: s.game_exp_score + boost }
          : s
      );
      onStudentsChange(updated);
      saveDemoStudents(updated);

      const newLog: BattleLogEntry = {
        id: `bl_${Date.now()}`,
        timestamp: nowStr,
        attacker_name: attacker.nickname,
        target_name: attacker.nickname,
        action_type: 'self_heal',
        exp_delta: boost,
        message: `✨ ${attacker.nickname} กดบัฟเพิ่มแต้มเกมให้ตัวเอง +${boost} EXP เพื่อเร่งอัปเลเวล!`,
      };
      const nextLogs = [newLog, ...battleLogs];
      onBattleLogsChange(nextLogs);
      saveDemoBattleLogs(nextLogs);
    }

    setTimeout(() => {
      setActiveAttackerAnim('idle');
      setActiveTargetAnim('idle');
      setProjectileType('none');
    }, 900);
    setTimeout(() => {
      setFloatingDamageText(null);
    }, 3200);
  };

  // Toggle individual question score cell in Demo mode to test real-time matrix updates
  const handleToggleQuestionCell = (studentId: string, qIndex: number) => {
    soundEngine.playCoinSound();
    const updated = students.map((s) => {
      if (s.participant_id !== studentId || s.is_disqualified) return s;
      const nextResults = [...s.question_results];
      const currentVal = nextResults[qIndex];
      const nextVal: 1 | 0 | null = currentVal === 1 ? 0 : currentVal === 0 ? null : 1;
      nextResults[qIndex] = nextVal;
      const nextRealScore = nextResults.reduce<number>((acc, v) => acc + (v === 1 ? 1 : 0), 0);
      return {
        ...s,
        question_results: nextResults,
        real_exam_score: nextRealScore,
      };
    });
    onStudentsChange(updated);
    saveDemoStudents(updated);
  };

  return (
    <div className="space-y-8">
      {students.length === 0 ? (
        <div className="card-game p-10 text-center space-y-3 bg-white">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-sky-100 border-3 border-slate-900 flex items-center justify-center">
            <Swords className="w-8 h-8 text-kw-blue" />
          </div>
          <h3 className="font-game text-2xl font-extrabold text-slate-900">
            ลบข้อมูลจำลองทั้งหมดเรียบร้อยแล้ว — ระบบพร้อมรับข้อมูลห้องสอบจริงจาก Supabase
          </h3>
          <p className="text-sm text-slate-600 max-w-xl mx-auto">
            เมื่อคุณครูสร้างชุดคำถามและเปิดห้องสอบจริง (Game PIN / QR Code) รายชื่อนักเรียน คะแนนสอบจริงรายข้อ (ข้อละ 1 คะแนน) และแต้มเกม EXP จะแสดงแบบ Real-time ที่หน้านี้ทันที พร้อมดาวน์โหลดเป็นไฟล์ Excel (.xls)
          </p>
        </div>
      ) : (
        <>
          {/* ====================================================================
              SECTION 1: 3D AVATAR BATTLE ARENA & VOICE REACTION STAGE
             ==================================================================== */}
          <div className="card-game p-6 bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 text-white space-y-5 relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-3">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-kw-yellow text-slate-900 font-game text-xs font-extrabold">
                  <Swords className="w-3.5 h-3.5" /> 3D RPG BATTLE & VOICE REACTION ARENA
                </span>
                <h3 className="font-game text-2xl font-extrabold mt-1">
                  สนามประลองตัวละคร 3D พุ่งโจมตี / แย่งแต้มเกม / เสียงพากย์โต้ตอบ
                </h3>
                <p className="text-xs text-sky-200">
                  ลดแต้มเกมเพื่อน แย่งแต้มเกมมาเป็นของตัวเอง หรือบัฟเพิ่มแต้มตัวเองเพื่ออัปเลเวล —{' '}
                  <strong className="text-kw-yellow underline">
                    โดยไม่กระทบคะแนนเก็บข้อสอบจริง (ข้อละ 1 คะแนน) แม้แต่นิดเดียว!
                  </strong>
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 text-xs font-bold">
                <Volume2 className="w-4 h-4 text-kw-yellow animate-pulse" />
                <span>มีเสียงพากย์ภาษาไทย + เอฟเฟกต์ดาเมจ 3D</span>
              </div>
            </div>

            {/* 3D Combat Stage */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center py-4 px-4 rounded-3xl bg-gradient-to-b from-sky-900/50 to-emerald-950/60 border-3 border-slate-700 relative">
              {/* Attacker 3D Figurine */}
              <div className="md:col-span-4 flex flex-col items-center space-y-2 z-10">
                <span className="px-3 py-0.5 rounded-full bg-kw-blue text-white text-xs font-extrabold border border-slate-900">
                  ⚔️ ผู้ใช้สกิล (Attacker)
                </span>
                {attacker && (
                  <>
                    <AvatarRenderer
                      config={attacker.avatar_config}
                      size="xl"
                      combatAction={activeAttackerAnim}
                    />
                    <select
                      value={attacker.participant_id}
                      onChange={(e) => setAttackerId(e.target.value)}
                      className="rounded-xl bg-slate-900 text-white border-2 border-kw-yellow px-3 py-1.5 text-xs font-bold"
                    >
                      {activeStudents.map((s) => (
                        <option key={s.participant_id} value={s.participant_id}>
                          {s.nickname} (สอบจริง {s.real_exam_score}/{totalQuestions} | {s.game_exp_score} EXP)
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              {/* Center Projectile & Action Controls */}
              <div className="md:col-span-4 flex flex-col items-center justify-center space-y-3 relative min-h-[160px]">
                <AnimatePresence>
                  {projectileType === 'fireball' && (
                    <motion.div
                      initial={{ x: -110, scale: 0.5, opacity: 1 }}
                      animate={{ x: 110, scale: 1.5, opacity: 1, rotate: 360 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.38 }}
                      className="absolute z-20 w-14 h-14 rounded-full bg-gradient-to-r from-kw-yellow via-kw-orange to-kw-red border-3 border-white shadow-[0_0_24px_#f97316] flex items-center justify-center"
                    >
                      <Flame className="w-8 h-8 text-white fill-kw-yellow" />
                    </motion.div>
                  )}
                  {projectileType === 'steal' && (
                    <motion.div
                      initial={{ x: 110, scale: 0.7, opacity: 1 }}
                      animate={{ x: -110, scale: 1.3, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.45 }}
                      className="absolute z-20 px-3 py-1.5 rounded-full bg-purple-600 text-kw-yellow border-2 border-white font-game font-extrabold text-xs shadow-lg"
                    >
                      🧲 +250 EXP!
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="w-full space-y-2">
                  <button
                    type="button"
                    onClick={() => triggerBattleAction('fireball')}
                    className="btn-game-red w-full py-2.5 text-xs flex items-center justify-center gap-2"
                  >
                    <Flame className="w-4 h-4 fill-kw-yellow" />
                    <span>พุ่งยิงลูกไฟลดแต้มเกมเพื่อน (-350 EXP)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerBattleAction('steal_exp')}
                    className="btn-game-orange w-full py-2.5 text-xs flex items-center justify-center gap-2"
                  >
                    <Magnet className="w-4 h-4" />
                    <span>ดูดแย่งแต้มเกมเพื่อน (+250 EXP มาให้เรา)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerBattleAction('self_heal')}
                    className="btn-game-green w-full py-2.5 text-xs flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>บัฟเพิ่มแต้มเกมให้ตัวเอง (+400 EXP)</span>
                  </button>
                </div>
              </div>

              {/* Target 3D Figurine */}
              <div className="md:col-span-4 flex flex-col items-center space-y-2 z-10">
                <span className="px-3 py-0.5 rounded-full bg-kw-red text-white text-xs font-extrabold border border-slate-900">
                  🎯 เป้าหมาย (Target Rival)
                </span>
                {target && (
                  <>
                    <AvatarRenderer
                      config={target.avatar_config}
                      size="xl"
                      combatAction={activeTargetAnim}
                    />
                    <select
                      value={target.participant_id}
                      onChange={(e) => setTargetId(e.target.value)}
                      className="rounded-xl bg-slate-900 text-white border-2 border-kw-red px-3 py-1.5 text-xs font-bold"
                    >
                      {activeStudents.map((s) => (
                        <option key={s.participant_id} value={s.participant_id}>
                          {s.nickname} (สอบจริง {s.real_exam_score}/{totalQuestions} | {s.game_exp_score} EXP)
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </div>

            {/* Live Voice Subtitle & Damage Pop-up */}
            <AnimatePresence>
              {(voiceSubtitle || floatingDamageText) && (
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-3.5 rounded-2xl bg-kw-yellow text-slate-900 border-3 border-white font-bold text-sm flex flex-wrap items-center justify-between gap-2"
                >
                  <span>{voiceSubtitle}</span>
                  {floatingDamageText && (
                    <span className="px-3 py-1 rounded-xl bg-slate-900 text-kw-yellow font-game font-extrabold text-xs">
                      {floatingDamageText}
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Recent 3D Battle Feed */}
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 text-xs">
              {battleLogs.slice(0, 4).map((log) => (
                <div
                  key={log.id}
                  className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 flex items-center justify-between"
                >
                  <span>{log.message}</span>
                  <span className="text-slate-400 font-mono ml-2">{log.timestamp}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ====================================================================
              SECTION 2: REAL-TIME QUESTION-BY-QUESTION SCORE MATRIX & EXCEL EXPORT
             ==================================================================== */}
          <div className="card-game p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b-4 border-slate-900 pb-4">
              <div>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-kw-green text-white border-2 border-slate-900 text-xs font-extrabold">
                  📊 REAL-TIME QUESTION-BY-QUESTION MATRIX
                </span>
                <h3 className="font-game text-2xl font-extrabold text-slate-900 mt-1">
                  แดชบอร์ดแสดงคะแนนสอบจริงแบบเรียลไทม์ข้อต่อข้อ ({quizTitle})
                </h3>
                <p className="text-xs text-slate-600 font-semibold">
                  ตอบถูกได้ <strong>ข้อละ 1 คะแนน</strong> (คลิกที่ช่องคะแนนรายข้อเพื่อจำลองการเปลี่ยนผลตรวจแบบเรียลไทม์ได้ทันที)
                </p>
              </div>

              <button
                type="button"
                onClick={() => exportQuestionByQuestionExcel(students, quizTitle, totalQuestions)}
                className="btn-game-green text-sm py-3 px-5 flex items-center gap-2"
              >
                <FileSpreadsheet className="w-5 h-5" />
                <span>ดาวน์โหลดรีพอร์ตคะแนนเป็น Excel (.xls)</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-900 text-kw-yellow font-game text-xs uppercase">
                    <th className="p-3 rounded-tl-2xl text-center">เลขที่</th>
                    <th className="p-3">ชื่อ-นามสกุลนักเรียน (3D Avatar)</th>
                    <th className="p-3 text-center">สถานะห้องสอบ</th>
                    {Array.from({ length: totalQuestions }, (_, idx) => (
                      <th key={idx} className="p-3 text-center">
                        ข้อ {idx + 1}
                        <span className="block text-[10px] text-white/80">(1 คะแนน)</span>
                      </th>
                    ))}
                    <th className="p-3 text-center bg-emerald-900 text-white">
                      รวมคะแนนสอบจริง
                      <span className="block text-[10px] text-kw-yellow">(เต็ม {totalQuestions})</span>
                    </th>
                    <th className="p-3 text-right rounded-tr-2xl bg-sky-900 text-white">
                      แต้มเกมอัปเลเวล
                      <span className="block text-[10px] text-sky-200">(Game EXP)</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((st) => (
                    <tr
                      key={st.participant_id}
                      className={`border-b-2 border-slate-200 transition ${
                        st.is_disqualified ? 'bg-red-50/90' : 'hover:bg-amber-50/60 bg-white'
                      }`}
                    >
                      <td className="p-3 font-mono font-extrabold text-center">{st.student_number}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <AvatarRenderer config={st.avatar_config} size="sm" animate={false} />
                          <div>
                            <div className="font-bold text-slate-900">{st.nickname}</div>
                            <div className="text-[11px] text-slate-500">
                              เวลาเฉลี่ย {(st.avg_response_ms / 1000).toFixed(1)}s | ทำดาเมจเกม {st.damage_dealt} EXP
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {st.is_disqualified ? (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-600 text-white text-[11px] font-extrabold"
                            title={st.disqualified_reason || ''}
                          >
                            <ShieldAlert className="w-3.5 h-3.5" /> ทุจริต (สลับแท็บ)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-600 text-[11px] font-extrabold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> ปกติ
                          </span>
                        )}
                      </td>

                      {/* Question-by-Question Cells (1 point each) */}
                      {Array.from({ length: totalQuestions }, (_, qIdx) => {
                        const val = st.question_results[qIdx];
                        if (st.is_disqualified) {
                          return (
                            <td key={qIdx} className="p-2 text-center">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-red-200 text-red-900 font-bold text-xs">
                                0
                              </span>
                            </td>
                          );
                        }
                        return (
                          <td key={qIdx} className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleQuestionCell(st.participant_id, qIdx)}
                              title="คลิกเพื่อสลับผลตรวจรายข้อ (1 = ถูก, 0 = ผิด)"
                              className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border-2 border-slate-900 font-game font-extrabold text-sm transition ${
                                val === 1
                                  ? 'bg-kw-green text-white shadow-sm'
                                  : val === 0
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              {val === 1 ? '1' : val === 0 ? '0' : '-'}
                            </button>
                          </td>
                        );
                      })}

                      {/* Total Real Exam Score (Locked against game damage!) */}
                      <td className="p-3 text-center bg-emerald-50/70">
                        <span
                          className={`inline-block px-3.5 py-1 rounded-xl border-2 border-slate-900 font-game text-lg font-extrabold ${
                            st.is_disqualified
                              ? 'bg-red-600 text-white'
                              : 'bg-kw-yellow text-slate-900'
                          }`}
                        >
                          {st.is_disqualified ? 0 : st.real_exam_score} / {totalQuestions}
                        </span>
                      </td>

                      {/* Game EXP Score (Affected by 3D PvP combat) */}
                      <td className="p-3 text-right bg-sky-50/60 font-game text-base font-extrabold text-kw-blue">
                        {st.is_disqualified ? '0 EXP' : `${st.game_exp_score.toLocaleString()} EXP`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
