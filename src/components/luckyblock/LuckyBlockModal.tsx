import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Coins, Star, Gift, AlertCircle, Ticket } from 'lucide-react';
import { rollLuckyBlockRPC } from '../../services/gameEngineService';
import { ItemRarity, LuckyBlockRollResult } from '../../types/database';
import { useAuth } from '../../context/AuthContext';
import { soundEngine } from '../../lib/soundEngine';
import { BUILTIN_AVATAR_CATALOG } from '../avatar/AvatarRenderer';
import {
  creditStudentGameReward,
  getActiveStudentVaultProfile,
  spendForLuckyBlockSpin,
  unlockStudentVaultItemFree,
} from '../../lib/studentIdentityVault';

const RARITY_STYLES: Record<ItemRarity, { badge: string; border: string; label: string }> = {
  common: { badge: 'bg-slate-200 text-slate-900', border: 'border-slate-500', label: 'COMMON (45%)' },
  uncommon: { badge: 'bg-emerald-200 text-emerald-950', border: 'border-emerald-600', label: 'UNCOMMON (28%)' },
  rare: { badge: 'bg-sky-200 text-sky-950', border: 'border-sky-600', label: 'RARE (16%)' },
  epic: { badge: 'bg-purple-200 text-purple-950', border: 'border-purple-600', label: 'EPIC (8%)' },
  legendary: { badge: 'bg-amber-300 text-amber-950', border: 'border-amber-500', label: 'LEGENDARY (3%)' },
};

function pickWeightedRarity(): ItemRarity {
  const r = Math.random() * 100;
  if (r < 3) return 'legendary';
  if (r < 11) return 'epic';
  if (r < 27) return 'rare';
  if (r < 55) return 'uncommon';
  return 'common';
}

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
  const [vaultSnapshot, setVaultSnapshot] = useState(() => getActiveStudentVaultProfile());

  const canSpin = Boolean(user || vaultSnapshot);

  const handleOpenLuckyBlock = async () => {
    if (isRolling) return;
    soundEngine.playJumpSound();
    setError(null);
    setIsRolling(true);

    try {
      // Path A: Logged-in Supabase Student
      if (user) {
        const rollData = await rollLuckyBlockRPC(claimToken, roomId);
        soundEngine.playLuckyBlockSound();
        setResult(rollData);
        await refreshProfile();
        onRewardClaimed?.(rollData);
        return;
      }

      // Path B: Student Identity Vault (Real Name + Last 3 Digits)
      const activeVault = getActiveStudentVaultProfile();
      if (!activeVault) {
        setError('กรุณาใส่ชื่อจริงและเลข 3 ตัวหลังที่หน้าแรกก่อนเปิดกล่องสุ่มรางวัล');
        return;
      }

      const spent = spendForLuckyBlockSpin(activeVault.identityKey, 120);
      if (!spent.ok || !spent.profile) {
        soundEngine.playWrongSound();
        setError(spent.error || 'เหรียญหรือตั๋วสุ่มไม่พอ');
        return;
      }

      await new Promise((r) => setTimeout(r, 550));

      const rarity = pickWeightedRarity();
      const lockedPool = BUILTIN_AVATAR_CATALOG.filter(
        (it) => !it.is_starter && !spent.profile!.ownedItemCodes.includes(it.code)
      );
      const rarityPool = lockedPool.filter((it) => it.rarity === rarity);
      const chosenItem =
        rarityPool.length > 0
          ? rarityPool[Math.floor(Math.random() * rarityPool.length)]
          : lockedPool.length > 0 && Math.random() < 0.65
            ? lockedPool[Math.floor(Math.random() * lockedPool.length)]
            : null;

      let rollData: LuckyBlockRollResult;

      if (chosenItem) {
        const unlockedProfile = unlockStudentVaultItemFree(activeVault.identityKey, chosenItem.code);
        const bonusExp = rarity === 'legendary' ? 200 : rarity === 'epic' ? 120 : 60;
        const credited = creditStudentGameReward(activeVault.identityKey, {
          dedupeKey: `lb_item_${claimToken}`,
          coins: 0,
          exp: bonusExp,
        });
        setVaultSnapshot(credited.profile || unlockedProfile);
        rollData = {
          reward_id: chosenItem.id,
          name: `ปลดล็อกไอเทมใหม่: ${chosenItem.name}!`,
          rarity: chosenItem.rarity,
          reward_type: 'avatar_item',
          coin_amount: 0,
          exp_amount: bonusExp,
          item_id: chosenItem.id,
        };
      } else {
        const coinPrizeMap: Record<ItemRarity, number> = {
          common: 80,
          uncommon: 150,
          rare: 240,
          epic: 360,
          legendary: 600,
        };
        const expPrizeMap: Record<ItemRarity, number> = {
          common: 40,
          uncommon: 80,
          rare: 140,
          epic: 220,
          legendary: 350,
        };
        const coinsWon = coinPrizeMap[rarity];
        const expWon = expPrizeMap[rarity];
        const credited = creditStudentGameReward(activeVault.identityKey, {
          dedupeKey: `lb_coin_${claimToken}`,
          coins: coinsWon,
          exp: expWon,
        });
        setVaultSnapshot(credited.profile);
        rollData = {
          reward_id: `coin_${Date.now()}`,
          name: `ถุงเหรียญนำโชค (+${coinsWon} เหรียญ!)`,
          rarity,
          reward_type: 'coins',
          coin_amount: coinsWon,
          exp_amount: expWon,
          item_id: null,
        };
      }

      soundEngine.playLuckyBlockSound();
      setResult(rollData);
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
    setVaultSnapshot(getActiveStudentVaultProfile());
  };

  return (
    <div className="card-game p-4 sm:p-6 relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-kw-yellow border-2 border-slate-900 text-xs font-extrabold">
            <Sparkles className="w-3.5 h-3.5" /> LUCKY QUESTION BLOCK
          </span>
          <h3 className="font-game text-2xl font-bold mt-1">
            กล่องสุ่มของแต่งตัวละคร &amp; เหรียญรางวัล
          </h3>
          <p className="text-xs text-slate-600">
            ใช้ตั๋วสุ่มฟรี (ได้เมื่อเล่นจบเกม) หรือ 120 เหรียญ เพื่อสุ่มปลดล็อกทรงผม ชุด และเครื่องประดับหายาก!
          </p>
        </div>

        {vaultSnapshot && !user && (
          <div className="flex items-center gap-2 text-xs font-extrabold">
            <span className="px-2.5 py-1 rounded-xl bg-amber-100 border-2 border-slate-900 inline-flex items-center gap-1">
              <Ticket className="w-3.5 h-3.5 text-kw-red" /> ตั๋วฟรี: {vaultSnapshot.luckyTickets}
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-kw-yellow border-2 border-slate-900 inline-flex items-center gap-1">
              <Coins className="w-3.5 h-3.5 text-amber-800" /> {vaultSnapshot.walletCoins.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center justify-center py-6 bg-gradient-to-b from-sky-100 to-amber-50 rounded-2xl border-4 border-slate-900">
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.button
              key="block-closed"
              type="button"
              disabled={isRolling || !canSpin}
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
                <Gift className="w-7 h-7 text-kw-red shrink-0" />
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
                สุ่มกล่องถัดไป!
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!result && (
          <p className="mt-4 text-sm font-bold text-slate-800 text-center px-3">
            {isRolling
              ? 'กำลังสุ่มรางวัล...'
              : canSpin
                ? vaultSnapshot && vaultSnapshot.luckyTickets > 0
                  ? 'คลิกที่บล็อกคำถาม (?) เพื่อใช้ตั๋วสุ่มฟรี 1 ใบ!'
                  : 'คลิกที่บล็อกคำถาม (?) เพื่อสุ่มรางวัล (120 เหรียญ)!'
                : 'ใส่ชื่อจริงและเลข 3 ตัวหลังที่หน้าแรกก่อน เพื่อเปิดกล่องสุ่มและสะสมของแต่งตัวละคร'}
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
