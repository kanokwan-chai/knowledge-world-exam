import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Coins, Star, Gift, AlertCircle } from 'lucide-react';
import { rollLuckyBlockRPC } from '../../services/gameEngineService';
import { ItemRarity, LuckyBlockRollResult } from '../../types/database';
import { useAuth } from '../../context/AuthContext';
import { soundEngine } from '../../lib/soundEngine';

const RARITY_STYLES: Record<ItemRarity, { badge: string; border: string; label: string }> = {
  common: { badge: 'bg-slate-200 text-slate-900', border: 'border-slate-500', label: 'COMMON (45%)' },
  uncommon: { badge: 'bg-emerald-200 text-emerald-950', border: 'border-emerald-600', label: 'UNCOMMON (28%)' },
  rare: { badge: 'bg-sky-200 text-sky-950', border: 'border-sky-600', label: 'RARE (16%)' },
  epic: { badge: 'bg-purple-200 text-purple-950', border: 'border-purple-600', label: 'EPIC (8%)' },
  legendary: { badge: 'bg-amber-300 text-amber-950', border: 'border-amber-500', label: 'LEGENDARY (3%)' },
};

interface LuckyBlockModalProps {
  roomId?: string;
  onRewardClaimed?: (result: LuckyBlockRollResult) => void;
}

export const LuckyBlockCard: React.FC<LuckyBlockModalProps> = ({ roomId, onRewardClaimed }) => {
  const { user, refreshProfile } = useAuth();
  const [isRolling, setIsRolling] = useState(false);
  const [result, setResult] = useState<LuckyBlockRollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimToken, setClaimToken] = useState<string>(() => `lb_${crypto.randomUUID()}`);

  const handleOpenLuckyBlock = async () => {
    if (isRolling) return;
    soundEngine.playJumpSound();
    setError(null);
    setIsRolling(true);

    try {
      const rollData = await rollLuckyBlockRPC(claimToken, roomId);
      soundEngine.playLuckyBlockSound();
      setResult(rollData);
      await refreshProfile();
      onRewardClaimed?.(rollData);
    } catch (err) {
      soundEngine.playWrongSound();
      setError(err instanceof Error ? err.message : 'ไม่สามารถสุ่มรางวัลได้');
    } finally {
      setIsRolling(false);
    }
  };

  const handleResetForNextBlock = () => {
    setResult(null);
    setError(null);
    setClaimToken(`lb_${crypto.randomUUID()}`);
  };

  return (
    <div className="card-game p-4 sm:p-6 relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-kw-yellow border-2 border-slate-900 text-xs font-extrabold">
            <Sparkles className="w-3.5 h-3.5" /> LUCKY QUESTION BLOCK
          </span>
          <h3 className="font-game text-2xl font-bold mt-1">
            กล่องสุ่มรางวัลแห่งการเรียนรู้
          </h3>
          <p className="text-xs text-slate-600">
            สุ่มด้วยระบบ Server-side PostgreSQL RPC ปลอดภัย 100% (ไม่ใช้เงินจริง)
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-6 bg-gradient-to-b from-sky-100 to-amber-50 rounded-2xl border-4 border-slate-900">
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.button
              key="block-closed"
              type="button"
              disabled={isRolling || !user}
              onClick={handleOpenLuckyBlock}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.92, y: -12 }}
              animate={
                isRolling
                  ? {
                      rotate: [-8, 8, -8, 8, 0],
                      y: [0, -24, 0, -18, 0],
                    }
                  : { y: [0, -8, 0] }
              }
              transition={
                isRolling
                  ? { duration: 0.5, repeat: Infinity }
                  : { duration: 1.8, repeat: Infinity }
              }
              className="w-28 h-28 rounded-3xl bg-kw-yellow border-4 border-slate-900 shadow-block flex items-center justify-center font-game text-6xl font-extrabold text-slate-900 relative cursor-pointer disabled:opacity-60"
            >
              <span className="absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-amber-700" />
              <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-amber-700" />
              <span className="absolute bottom-2 left-2 w-2.5 h-2.5 rounded-full bg-amber-700" />
              <span className="absolute bottom-2 right-2 w-2.5 h-2.5 rounded-full bg-amber-700" />
              ?
            </motion.button>
          ) : (
            <motion.div
              key="block-opened"
              initial={{ scale: 0.4, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="text-center space-y-3 px-4"
            >
              <span
                className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold border-2 border-slate-900 ${
                  RARITY_STYLES[result.rarity]?.badge
                }`}
              >
                {RARITY_STYLES[result.rarity]?.label}
              </span>

              <div className="font-game text-2xl font-extrabold text-slate-900 flex items-center justify-center gap-2">
                <Gift className="w-7 h-7 text-kw-red" />
                <span>{result.name}</span>
              </div>

              <div className="flex items-center justify-center gap-3">
                {result.coin_amount > 0 && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-kw-yellow border-2 border-slate-900 font-bold text-sm">
                    <Coins className="w-4 h-4" /> +{result.coin_amount} Coins
                  </span>
                )}
                {result.exp_amount > 0 && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-kw-blue text-white border-2 border-slate-900 font-bold text-sm">
                    <Star className="w-4 h-4 fill-kw-yellow text-kw-yellow" /> +{result.exp_amount} EXP
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleResetForNextBlock}
                className="btn-game-green text-sm py-2 px-5 mt-2"
              >
                เตรียมกล่องสุ่มถัดไป
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!result && (
          <p className="mt-4 text-sm font-bold text-slate-800">
            {isRolling
              ? 'กำลังสุ่มรางวัลจาก Server...'
              : user
                ? 'คลิกที่บล็อกคำถาม (?) เพื่อกระโดดโหม่งเปิดรางวัล!'
                : 'เข้าสู่ระบบนักเรียนเพื่อเปิดกล่องสุ่มและสะสมไอเทม'}
          </p>
        )}
      </div>

      {error && (
        <div className="mt-3 p-3 rounded-xl bg-red-100 border-2 border-red-600 text-red-900 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Probability Table */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-center text-[11px] font-bold">
        <div className="p-1.5 rounded-lg bg-slate-200 border border-slate-400">Common 45%</div>
        <div className="p-1.5 rounded-lg bg-emerald-100 border border-emerald-400">Uncommon 28%</div>
        <div className="p-1.5 rounded-lg bg-sky-100 border border-sky-400">Rare 16%</div>
        <div className="p-1.5 rounded-lg bg-purple-100 border border-purple-400">Epic 8%</div>
        <div className="p-1.5 rounded-lg bg-amber-200 border border-amber-500">Legendary 3%</div>
      </div>
    </div>
  );
};
