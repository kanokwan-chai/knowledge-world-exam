-- ============================================================================
-- KNOWLEDGE WORLD — COMPLETE POSTGRESQL SCHEMA (25 TABLES)
-- Migration: 001_schema.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom ENUM Types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('teacher', 'student', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE question_type AS ENUM ('multiple_choice', 'true_false', 'image_quiz', 'text_quiz');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE game_room_status AS ENUM ('lobby', 'question_active', 'question_reveal', 'leaderboard', 'finished');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE item_rarity AS ENUM ('common', 'uncommon', 'rare', 'epic', 'legendary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE avatar_slot AS ENUM ('base_character', 'hair', 'outfit', 'hat', 'accessory');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE power_type AS ENUM ('lightning', 'fire', 'shield', 'lucky', 'star', 'diamond');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 1. profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  display_name TEXT NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 2 AND 50),
  role user_role NOT NULL DEFAULT 'student',
  coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
  exp INTEGER NOT NULL DEFAULT 0 CHECK (exp >= 0),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
  total_games_played INTEGER NOT NULL DEFAULT 0 CHECK (total_games_played >= 0),
  total_score BIGINT NOT NULL DEFAULT 0 CHECK (total_score >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. classrooms
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 100),
  grade_level TEXT NOT NULL DEFAULT 'General',
  class_code VARCHAR(10) NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. classroom_students
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.classroom_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_number TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, student_id)
);

-- ============================================================================
-- 4. quizzes
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  classroom_id UUID REFERENCES public.classrooms(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 150),
  description TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT 'General',
  game_mode TEXT NOT NULL DEFAULT 'adventure_standard' CHECK (game_mode IN ('adventure_standard', 'speed_rush', 'boss_castle', 'survival')),
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. questions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_type question_type NOT NULL DEFAULT 'multiple_choice',
  prompt TEXT NOT NULL CHECK (char_length(trim(prompt)) > 0),
  image_url TEXT,
  explanation TEXT NOT NULL DEFAULT '',
  time_limit_seconds INTEGER NOT NULL DEFAULT 20 CHECK (time_limit_seconds BETWEEN 5 AND 180),
  base_points INTEGER NOT NULL DEFAULT 1000 CHECK (base_points BETWEEN 100 AND 10000),
  speed_bonus_max INTEGER NOT NULL DEFAULT 500 CHECK (speed_bonus_max BETWEEN 0 AND 5000),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, sort_order)
);

-- ============================================================================
-- 6. answer_choices
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.answer_choices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  choice_label VARCHAR(4) NOT NULL DEFAULT 'A',
  choice_text TEXT NOT NULL CHECK (char_length(trim(choice_text)) > 0),
  image_url TEXT,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 7. game_rooms
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.game_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_code VARCHAR(6) NOT NULL UNIQUE CHECK (pin_code ~ '^[0-9]{6}$'),
  host_teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  classroom_id UUID REFERENCES public.classrooms(id) ON DELETE SET NULL,
  game_mode TEXT NOT NULL DEFAULT 'adventure_standard',
  status game_room_status NOT NULL DEFAULT 'lobby',
  current_question_index INTEGER NOT NULL DEFAULT -1,
  current_question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
  question_started_at TIMESTAMPTZ,
  question_ends_at TIMESTAMPTZ,
  max_players INTEGER NOT NULL DEFAULT 60 CHECK (max_players BETWEEN 2 AND 200),
  allow_guest BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- ============================================================================
-- 8. game_participants
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.game_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  guest_session_token TEXT,
  nickname TEXT NOT NULL CHECK (char_length(trim(nickname)) BETWEEN 2 AND 30),
  avatar_config JSONB NOT NULL DEFAULT '{"base":"explorer_red","hat":"cap_red","outfit":"overalls_blue","hair":"spiky_brown","accessory":"star_badge"}'::jsonb,
  current_score INTEGER NOT NULL DEFAULT 0 CHECK (current_score >= 0),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  streak_count INTEGER NOT NULL DEFAULT 0 CHECK (streak_count >= 0),
  max_streak INTEGER NOT NULL DEFAULT 0 CHECK (max_streak >= 0),
  total_response_ms BIGINT NOT NULL DEFAULT 0 CHECK (total_response_ms >= 0),
  active_power power_type,
  shield_active BOOLEAN NOT NULL DEFAULT false,
  is_disqualified BOOLEAN NOT NULL DEFAULT false,
  disqualified_reason TEXT,
  is_connected BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, nickname)
);

-- ============================================================================
-- 9. game_answers
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.game_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.game_participants(id) ON DELETE CASCADE,
  selected_choice_id UUID REFERENCES public.answer_choices(id) ON DELETE SET NULL,
  text_answer TEXT,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  response_time_ms INTEGER NOT NULL CHECK (response_time_ms >= 0),
  base_points_awarded INTEGER NOT NULL DEFAULT 0,
  speed_bonus_awarded INTEGER NOT NULL DEFAULT 0,
  power_bonus_awarded INTEGER NOT NULL DEFAULT 0,
  total_points_awarded INTEGER NOT NULL DEFAULT 0,
  power_triggered power_type,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Prevent duplicate answer submissions per participant per question in a room
  UNIQUE (room_id, question_id, participant_id)
);

-- ============================================================================
-- 10. game_events
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_participant_id UUID REFERENCES public.game_participants(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 11. scores
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.game_participants(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  classroom_id UUID REFERENCES public.classrooms(id) ON DELETE SET NULL,
  total_score INTEGER NOT NULL DEFAULT 0 CHECK (total_score >= 0),
  correct_answers INTEGER NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
  total_questions INTEGER NOT NULL DEFAULT 0 CHECK (total_questions >= 0),
  accuracy_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  avg_response_ms INTEGER NOT NULL DEFAULT 0 CHECK (avg_response_ms >= 0),
  final_rank INTEGER,
  is_disqualified BOOLEAN NOT NULL DEFAULT false,
  disqualified_reason TEXT,
  coins_earned INTEGER NOT NULL DEFAULT 0 CHECK (coins_earned >= 0),
  exp_earned INTEGER NOT NULL DEFAULT 0 CHECK (exp_earned >= 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, participant_id)
);

-- ============================================================================
-- 12. avatar_items (Catalog of equippable & unlockable items)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.avatar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slot avatar_slot NOT NULL,
  rarity item_rarity NOT NULL DEFAULT 'common',
  price_coins INTEGER NOT NULL DEFAULT 0 CHECK (price_coins >= 0),
  required_level INTEGER NOT NULL DEFAULT 1 CHECK (required_level BETWEEN 1 AND 100),
  preview_color TEXT NOT NULL DEFAULT '#E52521',
  svg_key TEXT NOT NULL,
  is_starter BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 13. avatars (Player's customized avatar state)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  avatar_name TEXT NOT NULL DEFAULT 'Super Explorer' CHECK (char_length(trim(avatar_name)) BETWEEN 2 AND 30),
  base_character_code TEXT NOT NULL DEFAULT 'explorer_red',
  hair_code TEXT NOT NULL DEFAULT 'spiky_brown',
  outfit_code TEXT NOT NULL DEFAULT 'overalls_blue',
  hat_code TEXT NOT NULL DEFAULT 'cap_red',
  accessory_code TEXT NOT NULL DEFAULT 'star_badge',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 14. player_inventory
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.player_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.avatar_items(id) ON DELETE CASCADE,
  acquired_source TEXT NOT NULL DEFAULT 'starter' CHECK (acquired_source IN ('starter', 'shop', 'lucky_block', 'level_up', 'achievement', 'mission')),
  is_equipped BOOLEAN NOT NULL DEFAULT false,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, item_id)
);

-- ============================================================================
-- 15. powers (RPG Power definitions & Admin-adjustable drop rates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.powers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  power_type power_type NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  rarity item_rarity NOT NULL DEFAULT 'common',
  drop_weight INTEGER NOT NULL DEFAULT 100 CHECK (drop_weight >= 0),
  effect_value NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  cooldown_seconds INTEGER NOT NULL DEFAULT 15 CHECK (cooldown_seconds >= 0),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 16. player_powers (Power Inventory & History)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.player_powers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES public.game_participants(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  power_id UUID NOT NULL REFERENCES public.powers(id) ON DELETE CASCADE,
  power_type power_type NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_inventory' CHECK (status IN ('in_inventory', 'activated', 'expired')),
  obtained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,
  cooldown_until TIMESTAMPTZ
);

-- ============================================================================
-- 17. rewards (Lucky Block Reward Pool & Probabilities)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('coins', 'exp', 'avatar_item', 'power')),
  rarity item_rarity NOT NULL DEFAULT 'common',
  probability_weight INTEGER NOT NULL DEFAULT 100 CHECK (probability_weight > 0),
  coin_amount INTEGER NOT NULL DEFAULT 0,
  exp_amount INTEGER NOT NULL DEFAULT 0,
  item_id UUID REFERENCES public.avatar_items(id) ON DELETE SET NULL,
  power_id UUID REFERENCES public.powers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 18. reward_history (Audit log + Idempotency key to prevent double-claim)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reward_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES public.rewards(id) ON DELETE RESTRICT,
  room_id UUID REFERENCES public.game_rooms(id) ON DELETE SET NULL,
  claim_token TEXT NOT NULL UNIQUE,
  rarity item_rarity NOT NULL,
  reward_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 19. player_levels (Level 1-100 Curve & Level-Up Rewards)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.player_levels (
  level INTEGER PRIMARY KEY CHECK (level BETWEEN 1 AND 100),
  required_exp INTEGER NOT NULL CHECK (required_exp >= 0),
  reward_coins INTEGER NOT NULL DEFAULT 50 CHECK (reward_coins >= 0),
  reward_item_id UUID REFERENCES public.avatar_items(id) ON DELETE SET NULL,
  title_badge TEXT NOT NULL DEFAULT 'Novice Explorer'
);

-- ============================================================================
-- 20. achievements
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_name TEXT NOT NULL DEFAULT 'trophy',
  condition_type TEXT NOT NULL CHECK (condition_type IN ('streak', 'games_played', 'perfect_score', 'power_used', 'level_reached', 'coins_collected')),
  condition_target INTEGER NOT NULL CHECK (condition_target > 0),
  reward_coins INTEGER NOT NULL DEFAULT 100,
  reward_exp INTEGER NOT NULL DEFAULT 150,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 21. player_achievements
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.player_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, achievement_id)
);

-- ============================================================================
-- 22. missions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  mission_type TEXT NOT NULL CHECK (mission_type IN ('streak_5', 'join_3_games', 'perfect_score', 'use_power_5', 'level_up', 'play_10_games')),
  target_value INTEGER NOT NULL CHECK (target_value > 0),
  reward_coins INTEGER NOT NULL DEFAULT 100 CHECK (reward_coins >= 0),
  reward_exp INTEGER NOT NULL DEFAULT 120 CHECK (reward_exp >= 0),
  is_repeatable BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 23. player_missions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.player_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  current_progress INTEGER NOT NULL DEFAULT 0 CHECK (current_progress >= 0),
  is_completed BOOLEAN NOT NULL DEFAULT false,
  reward_claimed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, mission_id)
);

-- ============================================================================
-- 24. coin_transactions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount <> 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('quiz_reward', 'mission_reward', 'achievement_reward', 'lucky_block', 'level_up', 'shop_purchase')),
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 25. game_history
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.game_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL UNIQUE REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  classroom_id UUID REFERENCES public.classrooms(id) ON DELETE SET NULL,
  total_participants INTEGER NOT NULL DEFAULT 0,
  average_score NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  average_accuracy NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  top_player_nickname TEXT,
  top_player_score INTEGER DEFAULT 0,
  summary_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON public.classrooms(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classroom_students_class ON public.classroom_students(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_students_student ON public.classroom_students(student_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_teacher ON public.quizzes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_questions_quiz_order ON public.questions(quiz_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_choices_question ON public.answer_choices(question_id);
CREATE INDEX IF NOT EXISTS idx_game_rooms_pin ON public.game_rooms(pin_code);
CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON public.game_rooms(status);
CREATE INDEX IF NOT EXISTS idx_participants_room_score ON public.game_participants(room_id, current_score DESC, correct_count DESC, total_response_ms ASC);
CREATE INDEX IF NOT EXISTS idx_game_answers_room_question ON public.game_answers(room_id, question_id);
CREATE INDEX IF NOT EXISTS idx_scores_room_rank ON public.scores(room_id, total_score DESC, correct_answers DESC, avg_response_ms ASC);
CREATE INDEX IF NOT EXISTS idx_scores_profile ON public.scores(profile_id);
CREATE INDEX IF NOT EXISTS idx_scores_classroom ON public.scores(classroom_id);
CREATE INDEX IF NOT EXISTS idx_reward_history_profile ON public.reward_history(profile_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_tx_profile ON public.coin_transactions(profile_id, created_at DESC);
