import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Trophy,
  ShoppingBag,
  Award,
  Coins,
  Star,
  Lock,
  Check,
  History,
  Gamepad2,
  AlertCircle,
  Save,
  Shuffle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AvatarRenderer, BUILTIN_AVATAR_CATALOG } from '../components/avatar/AvatarRenderer';
import { LuckyBlockCard } from '../components/luckyblock/LuckyBlockModal';
import {
  fetchAvatarItemsCatalog,
  fetchGlobalLeaderboard,
  fetchPlayerInventory,
  fetchStudentMissions,
  fetchStudentScoresHistory,
  purchaseAvatarItemRPC,
  savePlayerAvatarCustomization,
} from '../services/gameEngineService';
import {
  AvatarConfig,
  AvatarItem,
  AvatarSlot,
  PlayerInventoryItem,
  PlayerMission,
  Profile,
  ScoreRecord,
} from '../types/database';
import { soundEngine } from '../lib/soundEngine';

const SLOT_PROP_MAP: Record<AvatarSlot, keyof AvatarConfig> = {
  gender: 'gender',
  face: 'face',
  base_character: 'base',
  hair: 'hair',
  outfit: 'outfit',
  hat: 'hat',
  accessory: 'accessory',
};

export const StudentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const {
    user,
    profile,
    avatarConfig,
    avatarName,
    setLocalAvatarConfig,
    refreshProfile,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'avatar' | 'lucky' | 'missions' | 'leaderboard' | 'history'>('avatar');
  const [activeSlot, setActiveSlot] = useState<AvatarSlot>('gender');
  const [catalog, setCatalog] = useState<AvatarItem[]>(BUILTIN_AVATAR_CATALOG);
  const [inventory, setInventory] = useState<PlayerInventoryItem[]>([]);
  const [missions, setMissions] = useState<PlayerMission[]>([]);
  const [globalLeaders, setGlobalLeaders] = useState<Profile[]>([]);
  const [scoreHistory, setScoreHistory] = useState<ScoreRecord[]>([]);
  const [customAvatarName, setCustomAvatarName] = useState(avatarName);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStudentHub = useCallback(async () => {
    try {
      const [dbItems, leaders] = await Promise.all([
        fetchAvatarItemsCatalog().catch(() => []),
        fetchGlobalLeaderboard(20).catch(() => []),
      ]);

      // Merge BUILTIN_AVATAR_CATALOG with any DB items by code so all 36 visual items are always available
      const mergedMap = new Map<string, AvatarItem>();
      for (const item of BUILTIN_AVATAR_CATALOG) {
        mergedMap.set(item.code, item);
      }
      for (const dbItem of dbItems) {
        const existing = mergedMap.get(dbItem.code);
        mergedMap.set(dbItem.code, existing ? { ...existing, id: dbItem.id } : dbItem);
      }
      setCatalog(Array.from(mergedMap.values()));
      setGlobalLeaders(leaders);

      if (user) {
        const [inv, mis, hist] = await Promise.all([
          fetchPlayerInventory(user.id).catch(() => []),
          fetchStudentMissions(user.id).catch(() => []),
          fetchStudentScoresHistory(user.id).catch(() => []),
        ]);
        setInventory(inv);
        setMissions(mis);
        setScoreHistory(hist);
      }
    } catch (err) {
      console.error('Error loading student hub:', err);
    }
  }, [user]);

  useEffect(() => {
    loadStudentHub();
  }, [loadStudentHub]);

  const ownedItemCodes = new Set<string>([
    ...BUILTIN_AVATAR_CATALOG.filter((i) => i.is_starter).map((i) => i.code),
    ...inventory.map((inv) => inv.avatar_items?.code || '').filter(Boolean),
  ]);

  const handleEquipOrBuyItem = async (item: AvatarItem) => {
    setError(null);
    setNotice(null);

    const propKey = SLOT_PROP_MAP[item.slot];
    const isOwned = ownedItemCodes.has(item.code) || item.is_starter;

    if (isOwned) {
      soundEngine.playCoinSound();
      let nextConfig: AvatarConfig = {
        ...avatarConfig,
        [propKey]: item.code,
      };

      // Helpful smart preset when switching gender if still on default starter look
      if (item.slot === 'gender') {
        if (item.code === 'female' && avatarConfig.hair === 'spiky_brown') {
          nextConfig = {
            ...nextConfig,
            gender: 'female',
            hair: 'twin_gold',
            face: 'face_kawaii',
            outfit: 'dress_princess',
            hat: 'bow_ribbon',
          };
        } else if (item.code === 'male' && avatarConfig.hair === 'twin_gold') {
          nextConfig = {
            ...nextConfig,
            gender: 'male',
            hair: 'spiky_brown',
            face: 'face_happy',
            outfit: 'overalls_blue',
            hat: 'cap_red',
          };
        }
      }

      setLocalAvatarConfig(nextConfig, customAvatarName);
      if (user) {
        await savePlayerAvatarCustomization(user.id, customAvatarName, nextConfig).catch(() => null);
      }
      setNotice(`เลือก "${item.name}" เรียบร้อยแล้ว!`);
      return;
    }

    if (!user) {
      soundEngine.playWrongSound();
      setError('กรุณาเข้าสู่ระบบบัญชีนักเรียนเพื่อใช้เหรียญปลดล็อกไอเทมพิเศษในร้านค้า');
      return;
    }

    setBusy(true);
    try {
      await purchaseAvatarItemRPC(item.id);
      soundEngine.playPowerUpSound();
      await refreshProfile();
      await loadStudentHub();
      const nextConfig: AvatarConfig = { ...avatarConfig, [propKey]: item.code };
      setLocalAvatarConfig(nextConfig, customAvatarName);
      await savePlayerAvatarCustomization(user.id, customAvatarName, nextConfig);
      setNotice(`ปลดล็อกและสวมใส่ "${item.name}" สำเร็จ!`);
    } catch (err) {
      soundEngine.playWrongSound();
      setError(err instanceof Error ? err.message : 'ไม่สามารถซื้อไอเทมนี้ได้');
    } finally {
      setBusy(false);
    }
  };

  const handleRandomizeStarterLook = () => {
    soundEngine.playPowerUpSound();
    const pickRandom = (slot: AvatarSlot) => {
      const options = catalog.filter(
        (i) => i.slot === slot && (i.is_starter || ownedItemCodes.has(i.code))
      );
      return options[Math.floor(Math.random() * options.length)]?.code;
    };

    const nextConfig: AvatarConfig = {
      gender: (pickRandom('gender') as 'male' | 'female') || 'male',
      face: pickRandom('face') || 'face_happy',
      base: pickRandom('base_character') || 'explorer_red',
      hair: pickRandom('hair') || 'spiky_brown',
      outfit: pickRandom('outfit') || 'overalls_blue',
      hat: pickRandom('hat') || 'cap_red',
      accessory: pickRandom('accessory') || 'star_badge',
    };
    setLocalAvatarConfig(nextConfig, customAvatarName);
    setNotice('สุ่มสไตล์การแต่งตัวใหม่เรียบร้อย!');
  };

  const handleSaveAvatarProfile = async () => {
    soundEngine.playCoinSound();
    setError(null);
    setNotice(null);
    setLocalAvatarConfig(avatarConfig, customAvatarName);
    if (!user) {
      setNotice('บันทึก Avatar สำหรับเข้าเล่นเกมบนอุปกรณ์นี้เรียบร้อยแล้ว!');
      return;
    }
    setBusy(true);
    try {
      await savePlayerAvatarCustomization(user.id, customAvatarName, avatarConfig);
      setNotice('บันทึก Avatar ลงฐานข้อมูลสำเร็จ!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึก Avatar ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const currentLevel = profile?.level ?? 1;
  const currentExp = profile?.exp ?? 0;
  const nextLevelExp = Math.floor(100 * Math.pow(currentLevel, 1.35));
  const levelProgressPct = Math.min(100, Math.round((currentExp / Math.max(1, nextLevelExp)) * 100));

  const myGlobalRank =
    user && globalLeaders.length > 0
      ? globalLeaders.findIndex((p) => p.id === user.id) + 1
      : 0;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8 pb-28 md:pb-24 space-y-5 sm:space-y-8">
      {/* Top Student RPG Profile Card */}
      <div className="card-game p-4 sm:p-6 md:p-8 bg-gradient-to-br from-kw-cream via-sky-50 to-amber-50">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-center">
          <div className="lg:col-span-3 flex flex-col items-center space-y-2">
            <AvatarRenderer config={avatarConfig} size="xl" />
            <span className="px-3 py-1 rounded-full bg-slate-900 text-kw-yellow font-game text-xs font-extrabold">
              {customAvatarName} ({avatarConfig.gender === 'female' ? 'หญิง' : 'ชาย'})
            </span>
          </div>

          <div className="lg:col-span-9 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
              <div>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-kw-green text-white border-2 border-slate-900 text-xs font-extrabold">
                  <Gamepad2 className="w-3.5 h-3.5" /> STUDENT ADVENTURER HUB
                </span>
                <h1 className="font-game text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
                  {profile?.display_name || customAvatarName}
                </h1>
              </div>

              <button
                type="button"
                onClick={() => navigate('/')}
                className="btn-game-red w-full sm:w-auto text-sm py-2.5 px-5"
              >
                ใส่รหัส PIN เข้าร่วมห้องเกม!
              </button>
            </div>

            {/* Level 1-100 Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-extrabold">
                <span className="text-kw-blue">LEVEL {currentLevel} / 100</span>
                <span>
                  EXP: {currentExp.toLocaleString()} / {nextLevelExp.toLocaleString()} ({levelProgressPct}%)
                </span>
              </div>
              <div className="w-full h-5 rounded-full bg-slate-200 border-3 border-slate-900 overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-kw-blue via-kw-green to-kw-yellow transition-all duration-500"
                  style={{ width: `${Math.max(6, levelProgressPct)}%` }}
                />
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="p-3 rounded-2xl bg-white border-2 border-slate-900">
                <div className="text-xs font-bold text-slate-500">เหรียญสะสม (Coins)</div>
                <div className="font-game text-2xl font-extrabold text-amber-600 flex items-center gap-1">
                  <Coins className="w-5 h-5 fill-kw-yellow text-amber-700" />
                  <span>{(profile?.coins ?? 0).toLocaleString()}</span>
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-white border-2 border-slate-900">
                <div className="text-xs font-bold text-slate-500">คะแนนสะสมรวม</div>
                <div className="font-game text-2xl font-extrabold text-kw-blue">
                  {(profile?.total_score ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-white border-2 border-slate-900">
                <div className="text-xs font-bold text-slate-500">จำนวนเกมที่เล่น</div>
                <div className="font-game text-2xl font-extrabold text-kw-green">
                  {profile?.total_games_played ?? scoreHistory.length} เกม
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-white border-2 border-slate-900">
                <div className="text-xs font-bold text-slate-500">อันดับสะสม (Rank)</div>
                <div className="font-game text-2xl font-extrabold text-kw-red">
                  {myGlobalRank > 0 ? `#${myGlobalRank}` : 'Unranked'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {notice && (
        <div className="p-4 rounded-2xl bg-emerald-100 border-3 border-emerald-600 text-emerald-950 font-bold text-sm flex items-center justify-between">
          <span>✨ {notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs underline">
            ปิด
          </button>
        </div>
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

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto no-scrollbar gap-2 border-b-4 border-slate-900 pb-2 sm:flex-wrap sm:pb-3">
        {[
          { id: 'avatar', label: 'แต่งตัวละคร Avatar & ร้านค้า', icon: ShoppingBag },
          { id: 'lucky', label: 'เปิดกล่องสุ่ม Lucky Block (?)', icon: Sparkles },
          { id: 'missions', label: 'ภารกิจ & Achievement', icon: Award },
          { id: 'leaderboard', label: 'อันดับสะสม (Leaderboard)', icon: Trophy },
          { id: 'history', label: 'ประวัติการเล่นของคุณ', icon: History },
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

      {/* TAB 1: AVATAR CUSTOMIZER & ITEM SHOP */}
      {activeTab === 'avatar' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
          {/* Left Preview Studio */}
          <div className="lg:col-span-4 card-game p-4 sm:p-6 text-center space-y-4">
            <h3 className="font-game text-2xl font-bold">สตูดิโอแต่งตัวละคร</h3>
            <div className="py-2 sm:py-4 flex justify-center">
              <AvatarRenderer config={avatarConfig} size="xl" />
            </div>

            {/* Quick Gender Switch Pills */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  handleEquipOrBuyItem(catalog.find((i) => i.code === 'male')!)
                }
                className={`py-2.5 rounded-xl border-2 border-slate-900 font-game font-bold text-sm ${
                  (avatarConfig.gender || 'male') === 'male'
                    ? 'bg-kw-blue text-white shadow-sm'
                    : 'bg-white text-slate-700'
                }`}
              >
                👦 เด็กชาย (Boy)
              </button>
              <button
                type="button"
                onClick={() =>
                  handleEquipOrBuyItem(catalog.find((i) => i.code === 'female')!)
                }
                className={`py-2.5 rounded-xl border-2 border-slate-900 font-game font-bold text-sm ${
                  avatarConfig.gender === 'female'
                    ? 'bg-pink-500 text-white shadow-sm'
                    : 'bg-white text-slate-700'
                }`}
              >
                👧 เด็กหญิง (Girl)
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">ตั้งชื่อฉายา Avatar</label>
              <input
                type="text"
                maxLength={30}
                value={customAvatarName}
                onChange={(e) => setCustomAvatarName(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 text-center font-bold text-base sm:text-sm bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleRandomizeStarterLook}
                className="btn-game-yellow text-xs py-2.5 px-3 flex items-center justify-center gap-1.5"
              >
                <Shuffle className="w-4 h-4" />
                <span>สุ่มชุดแต่งตัว</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleSaveAvatarProfile}
                className="btn-game-green text-xs py-2.5 px-3 flex items-center justify-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>บันทึกชุดนี้</span>
              </button>
            </div>
          </div>

          {/* Right Slot Selector & Live Graphic Item Cards */}
          <div className="lg:col-span-8 card-game p-4 sm:p-6 space-y-4 sm:space-y-5">
            <div className="space-y-3 border-b-2 border-slate-200 pb-4">
              <h3 className="font-game text-xl sm:text-2xl font-bold">
                เลือกเพศ หน้าตา ทรงผม เสื้อผ้า หมวก และของประดับ
              </h3>
              <div className="flex overflow-x-auto no-scrollbar gap-2 pb-1 sm:flex-wrap sm:pb-0">
                {(
                  [
                    { slot: 'gender', label: '👦👧 เพศ (Gender)' },
                    { slot: 'face', label: '😊 หน้าตา / อารมณ์' },
                    { slot: 'hair', label: '💇 ทรงผม (Hair)' },
                    { slot: 'outfit', label: '👕 เสื้อผ้า / ชุด' },
                    { slot: 'hat', label: '🎩 หมวก / โบว์' },
                    { slot: 'accessory', label: '👓 แว่น / ผ้าคลุม / ปีก' },
                    { slot: 'base_character', label: '🎨 สีผิว & เสื้อใน' },
                  ] as Array<{ slot: AvatarSlot; label: string }>
                ).map((s) => (
                  <button
                    key={s.slot}
                    type="button"
                    onClick={() => setActiveSlot(s.slot)}
                    className={`shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl font-bold text-xs border-2 border-slate-900 transition ${
                      activeSlot === s.slot
                        ? 'bg-kw-blue text-white shadow-block-sm -translate-y-0.5'
                        : 'bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {catalog
                .filter((i) => i.slot === activeSlot)
                .map((item) => {
                  const isOwned = ownedItemCodes.has(item.code) || item.is_starter;
                  const propKey = SLOT_PROP_MAP[item.slot];
                  const currentVal = avatarConfig[propKey] || (item.slot === 'gender' ? 'male' : item.slot === 'face' ? 'face_happy' : '');
                  const isEquipped = currentVal === item.code;

                  // Build live preview config showing how this exact item looks on the player's avatar!
                  const previewConfig: AvatarConfig = {
                    ...avatarConfig,
                    [propKey]: item.code,
                  };

                  return (
                    <div
                      key={item.code}
                      onClick={() => handleEquipOrBuyItem(item)}
                      className={`cursor-pointer p-3 sm:p-4 rounded-2xl border-3 border-slate-900 flex items-center justify-between gap-2.5 sm:gap-3 transition hover:scale-[1.01] ${
                        isEquipped
                          ? 'bg-amber-100 ring-4 ring-kw-yellow'
                          : 'bg-white hover:bg-sky-50/60'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        {/* Real SVG Character Preview wearing this item! */}
                        <AvatarRenderer config={previewConfig} size="sm" animate={false} />

                        <div>
                          <div className="font-bold text-sm text-slate-900">{item.name}</div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-slate-200 border border-slate-900">
                              {item.rarity}
                            </span>
                            <span className="text-xs font-semibold text-slate-600">
                              {item.price_coins === 0 ? 'ฟรี' : `${item.price_coins} Coins`}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEquipOrBuyItem(item);
                        }}
                        className={`px-3.5 py-2 rounded-xl border-2 border-slate-900 font-game font-bold text-xs flex items-center gap-1 shrink-0 ${
                          isEquipped
                            ? 'bg-kw-green text-white'
                            : isOwned
                              ? 'bg-kw-yellow text-slate-900 hover:brightness-105'
                              : 'bg-kw-orange text-white hover:brightness-105'
                        }`}
                      >
                        {isEquipped ? (
                          <>
                            <Check className="w-3.5 h-3.5" /> ใส่อยู่
                          </>
                        ) : isOwned ? (
                          'เลือกใส่'
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5" /> {item.price_coins}
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LUCKY BLOCK */}
      {activeTab === 'lucky' && (
        <div className="max-w-2xl mx-auto">
          <LuckyBlockCard onRewardClaimed={() => loadStudentHub()} />
        </div>
      )}

      {/* TAB 3: MISSIONS & ACHIEVEMENTS */}
      {activeTab === 'missions' && (
        <div className="card-game p-6 space-y-4">
          <h3 className="font-game text-2xl font-bold">ภารกิจผู้กล้า & รางวัล (Missions & Achievements)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                code: 'streak_5',
                title: 'จอมคอมโบสายฟ้า',
                desc: 'ตอบคำถามถูก 5 ข้อติดต่อกันในการแข่งขัน',
                coins: 150,
                exp: 200,
                done: (profile?.total_score ?? 0) >= 2500,
              },
              {
                code: 'join_3_games',
                title: 'นักผจญภัยหน้าใหม่',
                desc: 'เข้าร่วมเล่นเกมตอบคำถามครบ 3 ครั้ง',
                coins: 120,
                exp: 150,
                done: (profile?.total_games_played ?? 0) >= 3,
              },
              {
                code: 'perfect_score',
                title: 'แชมป์ไร้พ่าย',
                desc: 'ทำคะแนนความแม่นยำ 100% ในการแข่งขัน 1 เกม',
                coins: 250,
                exp: 300,
                done: scoreHistory.some((s) => Number(s.accuracy_percent) === 100),
              },
              {
                code: 'use_power_5',
                title: 'จอมเวทไอเทมพลัง',
                desc: 'เปิดใช้งาน RPG Power ระหว่างการแข่งขัน',
                coins: 180,
                exp: 220,
                done: (profile?.total_games_played ?? 0) >= 1,
              },
              {
                code: 'level_up',
                title: 'ก้าวข้ามขีดจำกัด',
                desc: 'เลื่อนระดับผู้เล่นถึง Level 5',
                coins: 200,
                exp: 250,
                done: (profile?.level ?? 1) >= 5,
              },
              {
                code: 'play_10_games',
                title: 'ตำนานแห่งปราสาทความรู้',
                desc: 'เล่นเกมตอบคำถามสะสมครบ 10 เกม',
                coins: 400,
                exp: 500,
                done: (profile?.total_games_played ?? 0) >= 10,
              },
            ].map((m) => {
              const dbMission = missions.find((pm) => pm.missions?.code === m.code);
              const isCompleted = dbMission?.is_completed || m.done;

              return (
                <div
                  key={m.code}
                  className={`p-4 rounded-2xl border-3 border-slate-900 flex items-center justify-between gap-3 ${
                    isCompleted ? 'bg-emerald-100' : 'bg-white'
                  }`}
                >
                  <div>
                    <div className="font-game text-lg font-extrabold flex items-center gap-2">
                      <Award className="w-5 h-5 text-kw-red" />
                      <span>{m.title}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{m.desc}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs font-extrabold">
                      <span className="text-amber-700 flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5" /> +{m.coins} Coins
                      </span>
                      <span className="text-kw-blue flex items-center gap-1">
                        <Star className="w-3.5 h-3.5" /> +{m.exp} EXP
                      </span>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1.5 rounded-xl border-2 border-slate-900 font-game text-xs font-extrabold ${
                      isCompleted ? 'bg-kw-green text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isCompleted ? 'สำเร็จแล้ว!' : 'กำลังสะสม'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: GLOBAL LEADERBOARD */}
      {activeTab === 'leaderboard' && (
        <div className="card-game p-6 space-y-4">
          <h3 className="font-game text-2xl font-bold">
            อันดับสะสมสูงสุดแห่ง Knowledge World (Top Adventurers)
          </h3>
          {globalLeaders.length === 0 ? (
            <p className="text-sm text-slate-600 py-6">ยังไม่มีข้อมูลอันดับสะสมในขณะนี้</p>
          ) : (
            <div className="space-y-2">
              {globalLeaders.map((p, idx) => (
                <div
                  key={p.id}
                  className={`p-3.5 rounded-2xl border-2 border-slate-900 flex items-center justify-between ${
                    p.id === user?.id ? 'bg-kw-yellow font-extrabold' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-slate-900 text-kw-yellow font-game font-extrabold flex items-center justify-center text-sm">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="font-bold text-sm">{p.display_name}</div>
                      <div className="text-xs text-slate-600">
                        Level {p.level} | เล่นแล้ว {p.total_games_played} เกม
                      </div>
                    </div>
                  </div>
                  <div className="font-game text-xl font-extrabold text-kw-blue">
                    {Number(p.total_score).toLocaleString()} pts
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: STUDENT MATCH HISTORY */}
      {activeTab === 'history' && (
        <div className="card-game p-6 space-y-4">
          <h3 className="font-game text-2xl font-bold">ประวัติการแข่งขันของคุณ</h3>
          {scoreHistory.length === 0 ? (
            <p className="text-sm text-slate-600 py-6">ยังไม่มีประวัติการแข่งขันที่บันทึกไว้</p>
          ) : (
            <div className="space-y-2">
              {scoreHistory.map((s) => (
                <div
                  key={s.id}
                  className="p-4 rounded-2xl bg-white border-2 border-slate-900 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-game text-lg font-extrabold">
                      อันดับที่ #{s.final_rank ?? '-'} | คะแนน {s.total_score.toLocaleString()} pts
                    </div>
                    <div className="text-xs text-slate-600">
                      ตอบถูก {s.correct_answers}/{s.total_questions} ข้อ ({s.accuracy_percent}%) |
                      เวลาเฉลี่ย {s.avg_response_ms} ms
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-extrabold">
                    <span className="px-2.5 py-1 rounded-xl bg-kw-yellow border border-slate-900">
                      +{s.coins_earned} Coins
                    </span>
                    <span className="px-2.5 py-1 rounded-xl bg-kw-blue text-white border border-slate-900">
                      +{s.exp_earned} EXP
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
