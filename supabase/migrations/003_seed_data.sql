-- ============================================================================
-- KNOWLEDGE WORLD — INITIAL CATALOG & LEVEL CURVE SEED DATA
-- Migration: 003_seed_data.sql
-- ============================================================================

-- 1. Seed Levels 1 to 100
INSERT INTO public.player_levels (level, required_exp, reward_coins, title_badge)
SELECT
  lvl,
  CASE WHEN lvl = 1 THEN 0 ELSE FLOOR(100 * POWER(lvl - 1, 1.35))::int END AS required_exp,
  (lvl * 25) AS reward_coins,
  CASE
    WHEN lvl < 10 THEN 'Rookie Jumper'
    WHEN lvl < 25 THEN 'Block Breaker'
    WHEN lvl < 50 THEN 'Star Runner'
    WHEN lvl < 75 THEN 'Castle Champion'
    ELSE 'Grand Knowledge Hero'
  END AS title_badge
FROM generate_series(1, 100) AS lvl
ON CONFLICT (level) DO NOTHING;

-- 2. Seed 6 RPG Powers
INSERT INTO public.powers (power_type, name, description, rarity, drop_weight, effect_value, cooldown_seconds, is_enabled)
VALUES
  ('lightning', 'Lightning Power', 'เพิ่มคะแนนโบนัสสายฟ้า +350 คะแนนทันทีเมื่อตอบถูก', 'common', 300, 350, 10, true),
  ('fire', 'Fire Power', 'ลูกไฟเพิ่มตัวคูณคะแนนพื้นฐานและโบนัสความเร็ว 1.5 เท่า', 'uncommon', 220, 1.5, 15, true),
  ('shield', 'Shield Power', 'โล่พลังงานป้องกันการเสียคอมโบ (Streak) เมื่อตอบผิด 1 ครั้ง', 'rare', 180, 1.0, 20, true),
  ('lucky', 'Lucky Power', 'ดาวนำโชคเพิ่มโอกาสสุ่มได้พลังพิเศษถึง 80% และโบนัส +250 คะแนน', 'rare', 140, 250, 20, true),
  ('star', 'Star Power', 'พลังแห่งดาวรับ EXP พิเศษเพิ่มขึ้นจากการตอบคำถาม', 'epic', 100, 2.0, 25, true),
  ('diamond', 'Diamond Power', 'เพชรประกายแสงรับเหรียญทองโบนัสพิเศษเมื่อจบเกม', 'legendary', 60, 2.5, 30, true)
ON CONFLICT (power_type) DO NOTHING;

-- 3. Seed Original Avatar Items (No Nintendo IP — Original Knowledge World Heroes)
INSERT INTO public.avatar_items (code, name, slot, rarity, price_coins, required_level, preview_color, svg_key, is_starter)
VALUES
  -- Base Characters
  ('explorer_red', 'Blaze Jumper (Red)', 'base_character', 'common', 0, 1, '#E52521', 'base_red', true),
  ('explorer_blue', 'Aqua Dasher (Blue)', 'base_character', 'common', 0, 1, '#049CD8', 'base_blue', true),
  ('explorer_green', 'Forest Hopper (Green)', 'base_character', 'uncommon', 250, 2, '#43B047', 'base_green', false),
  ('explorer_gold', 'Solar Champion (Gold)', 'base_character', 'legendary', 1200, 10, '#FBD000', 'base_gold', false),

  -- Hair
  ('spiky_brown', 'Spiky Adventurer Hair', 'hair', 'common', 0, 1, '#78350F', 'hair_spiky_brown', true),
  ('twin_gold', 'Sunny Twin Tails', 'hair', 'common', 0, 1, '#F59E0B', 'hair_twin_gold', true),
  ('cyber_blue', 'Electric Blue Wave', 'hair', 'rare', 350, 3, '#0284C7', 'hair_cyber_blue', false),
  ('flame_orange', 'Blazing Aura Hair', 'hair', 'epic', 650, 6, '#F57D00', 'hair_flame_orange', false),

  -- Outfits
  ('overalls_blue', 'Classic Brick Explorer Suit', 'outfit', 'common', 0, 1, '#049CD8', 'outfit_overalls_blue', true),
  ('tunic_green', 'Emerald Meadow Tunic', 'outfit', 'uncommon', 200, 2, '#43B047', 'outfit_tunic_green', false),
  ('armor_crimson', 'Castle Knight Armor', 'outfit', 'rare', 500, 4, '#E52521', 'outfit_armor_crimson', false),
  ('robe_starlight', 'Grand Starlight Robe', 'outfit', 'legendary', 1500, 12, '#8B5CF6', 'outfit_robe_starlight', false),

  -- Hats
  ('cap_red', 'Adventure Dome Cap', 'hat', 'common', 0, 1, '#E52521', 'hat_cap_red', true),
  ('mushroom_beret', 'Spore Spot Beret', 'hat', 'uncommon', 220, 2, '#F57D00', 'hat_mushroom_beret', false),
  ('wizard_cone', 'Star Scholar Hat', 'hat', 'rare', 480, 5, '#049CD8', 'hat_wizard_cone', false),
  ('crown_golden', 'Royal Castle Crown', 'hat', 'legendary', 1400, 10, '#FBD000', 'hat_crown_golden', false),

  -- Accessories
  ('star_badge', 'Golden Star Emblem', 'accessory', 'common', 0, 1, '#FBD000', 'acc_star_badge', true),
  ('goggles_sky', 'Cloud Flyer Goggles', 'accessory', 'uncommon', 180, 2, '#38BDF8', 'acc_goggles_sky', false),
  ('cape_hero', 'Crimson Wind Cape', 'accessory', 'epic', 750, 7, '#E52521', 'acc_cape_hero', false),
  ('wings_rainbow', 'Prismatic Question Wings', 'accessory', 'legendary', 1800, 15, '#F59E0B', 'acc_wings_rainbow', false)
ON CONFLICT (code) DO NOTHING;

-- 4. Seed Lucky Block Rewards Pool
INSERT INTO public.rewards (name, reward_type, rarity, probability_weight, coin_amount, exp_amount, is_active)
VALUES
  ('Gold Coin Pouch (+50 Coins)', 'coins', 'common', 350, 50, 10, true),
  ('Scholar Star Dust (+80 EXP)', 'exp', 'common', 300, 10, 80, true),
  ('Brick Treasure Chest (+120 Coins)', 'coins', 'uncommon', 180, 120, 25, true),
  ('Super Knowledge Mushroom (+180 EXP)', 'exp', 'uncommon', 150, 25, 180, true),
  ('Emerald Castle Vault (+300 Coins)', 'coins', 'rare', 90, 300, 60, true),
  ('Starlight Tome (+400 EXP)', 'exp', 'epic', 45, 80, 400, true),
  ('Legendary Grand Jackpot (+800 Coins & +500 EXP)', 'coins', 'legendary', 15, 800, 500, true);

-- 5. Seed Missions (All 6 required mission archetypes)
INSERT INTO public.missions (code, title, description, mission_type, target_value, reward_coins, reward_exp, is_repeatable)
VALUES
  ('streak_5', 'จอมคอมโบสายฟ้า', 'ตอบคำถามถูก 5 ข้อติดต่อกันในการแข่งขัน', 'streak_5', 5, 150, 200, false),
  ('join_3_games', 'นักผจญภัยหน้าใหม่', 'เข้าร่วมเล่นเกมตอบคำถามครบ 3 ครั้ง', 'join_3_games', 3, 120, 150, false),
  ('perfect_score', 'แชมป์ไร้พ่าย', 'ทำคะแนนความแม่นยำ 100% ในการแข่งขัน 1 เกม', 'perfect_score', 1, 250, 300, false),
  ('use_power_5', 'จอมเวทไอเทมพลัง', 'กดใช้งาน RPG Power ครบ 5 ครั้ง', 'use_power_5', 5, 180, 220, false),
  ('level_up', 'ก้าวข้ามขีดจำกัด', 'เลื่อนระดับผู้เล่นถึง Level 5', 'level_up', 5, 200, 250, false),
  ('play_10_games', 'ตำนานแห่งปราสาทความรู้', 'เล่นเกมตอบคำถามสะสมครบ 10 เกม', 'play_10_games', 10, 400, 500, false)
ON CONFLICT (code) DO NOTHING;

-- 6. Seed Achievements
INSERT INTO public.achievements (code, title, description, icon_name, condition_type, condition_target, reward_coins, reward_exp)
VALUES
  ('ach_first_streak', 'Combo Igniter', 'ทำ Streak ตอบถูกติดต่อกัน 5 ข้อสำเร็จ', 'zap', 'streak', 5, 100, 150),
  ('ach_veteran_3', 'World Explorer', 'เข้าร่วมการแข่งขันครบ 3 เกม', 'compass', 'games_played', 3, 120, 160),
  ('ach_sharpshooter', 'Golden Accuracy', 'ทำคะแนนเต็ม ตอบถูกครบทุกข้อในห้องเกม', 'award', 'perfect_score', 1, 300, 350),
  ('ach_power_master', 'Power Alchemist', 'เปิดใช้งาน RPG Power ครบ 5 ครั้ง', 'flame', 'power_used', 5, 200, 240),
  ('ach_level_10', 'Castle Knight', 'อัปเลเวลตัวละครถึง Level 10', 'shield', 'level_reached', 10, 500, 600),
  ('ach_grand_10', 'Hero of Knowledge World', 'เล่นเกมสะสมครบ 10 ครั้ง', 'crown', 'games_played', 10, 600, 750)
ON CONFLICT (code) DO NOTHING;
