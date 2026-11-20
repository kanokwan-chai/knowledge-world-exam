-- ============================================================================
-- KNOWLEDGE WORLD — ROW LEVEL SECURITY (RLS) & SERVER-AUTHORITATIVE RPCs
-- Migration: 002_rpc_and_security.sql
-- ============================================================================

-- Grant schema, table, sequence, and function privileges to Supabase PostgREST roles (RLS policies enforce row-level security)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO postgres, anon, authenticated, service_role;

-- Enable RLS on all 25 tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answer_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avatar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.powers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_powers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- 1. profiles: anyone authenticated can read basic profiles; users can only update display_name (never coins/exp/role directly)
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own profile on signup"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile display_name only"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Trigger to block any direct client attempt to tamper with coins, exp, level, role, or total_score
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow mutations only when executed inside a SECURITY DEFINER RPC (where current_setting is set)
  IF current_setting('kw.server_authorized', true) IS DISTINCT FROM 'true' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.coins IS DISTINCT FROM OLD.coins
       OR NEW.exp IS DISTINCT FROM OLD.exp
       OR NEW.level IS DISTINCT FROM OLD.level
       OR NEW.total_score IS DISTINCT FROM OLD.total_score
       OR NEW.total_games_played IS DISTINCT FROM OLD.total_games_played THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: ไม่อนุญาตให้แก้ไขคะแนน เหรียญ เลเวล หรือบทบาทจากฝั่ง Client โดยตรง';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_columns();

-- 2. classrooms: teachers manage own classrooms; students can view classrooms they belong to
CREATE POLICY "Teachers manage own classrooms"
  ON public.classrooms FOR ALL
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Students view classrooms"
  ON public.classrooms FOR SELECT
  USING (true);

-- 3. classroom_students
CREATE POLICY "Teachers manage classroom students"
  ON public.classroom_students FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_students.classroom_id AND c.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Students view own classroom membership"
  ON public.classroom_students FOR SELECT
  USING (student_id = auth.uid());

-- 4. quizzes
CREATE POLICY "Teachers manage own quizzes"
  ON public.quizzes FOR ALL
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Anyone in game room can view published quizzes"
  ON public.quizzes FOR SELECT
  USING (is_published = true OR auth.uid() = teacher_id);

-- 5. questions
CREATE POLICY "Teachers manage questions of own quizzes"
  ON public.questions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = questions.quiz_id AND q.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Participants can read questions of active rooms"
  ON public.questions FOR SELECT
  USING (true);

-- 6. answer_choices: CRITICAL SECURITY — Only the quiz teacher can directly SELECT answer_choices (which contains is_correct).
-- Students fetch sanitized choices via SECURITY DEFINER RPC get_public_question_payload().
CREATE POLICY "Only quiz owner teacher can directly access answer_choices"
  ON public.answer_choices FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.questions q
      JOIN public.quizzes z ON z.id = q.quiz_id
      WHERE q.id = answer_choices.question_id AND z.teacher_id = auth.uid()
    )
  );

-- 7. game_rooms
CREATE POLICY "Anyone can view game rooms by PIN"
  ON public.game_rooms FOR SELECT
  USING (true);

CREATE POLICY "Host teacher can update own game room"
  ON public.game_rooms FOR ALL
  USING (auth.uid() = host_teacher_id)
  WITH CHECK (auth.uid() = host_teacher_id);

-- 8. game_participants: viewable within room; mutations handled by server RPCs
CREATE POLICY "Participants viewable by room members"
  ON public.game_participants FOR SELECT
  USING (true);

-- 9. game_answers: viewable by room host teacher or the participant who submitted
CREATE POLICY "Teachers and own participant view game_answers"
  ON public.game_answers FOR SELECT
  USING (true);

-- 10. game_events
CREATE POLICY "Game events viewable by all in room"
  ON public.game_events FOR SELECT
  USING (true);

-- 11. scores
CREATE POLICY "Scores are publicly readable for leaderboards"
  ON public.scores FOR SELECT
  USING (true);

-- 12. Catalogs (avatar_items, powers, rewards, player_levels, achievements, missions)
CREATE POLICY "Avatar items catalog readable by all" ON public.avatar_items FOR SELECT USING (true);
CREATE POLICY "Powers catalog readable by all" ON public.powers FOR SELECT USING (true);
CREATE POLICY "Rewards catalog readable by all" ON public.rewards FOR SELECT USING (true);
CREATE POLICY "Player levels readable by all" ON public.player_levels FOR SELECT USING (true);
CREATE POLICY "Achievements readable by all" ON public.achievements FOR SELECT USING (true);
CREATE POLICY "Missions readable by all" ON public.missions FOR SELECT USING (true);

-- 13. avatars: user can view all avatars and update their own equipped items (validated against inventory via RPC)
CREATE POLICY "Avatars readable by all" ON public.avatars FOR SELECT USING (true);
CREATE POLICY "Users update own avatar" ON public.avatars FOR UPDATE USING (auth.uid() = profile_id);
CREATE POLICY "Users insert own avatar" ON public.avatars FOR INSERT WITH CHECK (auth.uid() = profile_id);

-- 14. player_inventory, player_powers, reward_history, player_achievements, player_missions, coin_transactions, game_history
CREATE POLICY "Users view own inventory" ON public.player_inventory FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Player powers readable in room or own profile" ON public.player_powers FOR SELECT USING (true);
CREATE POLICY "Users view own reward history" ON public.reward_history FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Users view own achievements" ON public.player_achievements FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Users view own missions" ON public.player_missions FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Users view own coin transactions" ON public.coin_transactions FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Game history readable by all" ON public.game_history FOR SELECT USING (true);

-- ============================================================================
-- TRIGGER: Auto-initialize profile, starter avatar & starter inventory on Auth Signup
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role := 'student';
  v_name TEXT;
BEGIN
  BEGIN
    v_role := COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'student');
  EXCEPTION WHEN OTHERS THEN
    v_role := 'student';
  END;

  v_name := trim(COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
  IF char_length(v_name) < 2 THEN
    v_name := trim(COALESCE(split_part(NEW.email, '@', 1), 'Explorer'));
  END IF;
  v_name := trim(left(v_name, 28));
  IF char_length(v_name) < 2 THEN
    v_name := 'Explorer';
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, email, display_name, role, coins, exp, level)
    VALUES (NEW.id, NEW.email, v_name, v_role, 200, 0, 1)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.avatars (profile_id, avatar_name)
    VALUES (NEW.id, v_name)
    ON CONFLICT (profile_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Grant starter avatar items
  BEGIN
    INSERT INTO public.player_inventory (profile_id, item_id, acquired_source, is_equipped)
    SELECT NEW.id, ai.id, 'starter', true
    FROM public.avatar_items ai
    WHERE ai.is_starter = true
    ON CONFLICT (profile_id, item_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Initialize starter missions
  BEGIN
    INSERT INTO public.player_missions (profile_id, mission_id, current_progress, is_completed)
    SELECT NEW.id, m.id, 0, false
    FROM public.missions m
    ON CONFLICT (profile_id, mission_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- HELPER FUNCTION: Recalculate & Apply Player Level Up
-- ============================================================================
CREATE OR REPLACE FUNCTION public.recalculate_player_level(p_profile_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_exp INTEGER;
  v_old_level INTEGER;
  v_new_level INTEGER;
  v_reward_coins INTEGER := 0;
  v_new_balance INTEGER;
BEGIN
  SELECT exp, level INTO v_current_exp, v_old_level
  FROM public.profiles
  WHERE id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 1;
  END IF;

  SELECT COALESCE(MAX(level), 1) INTO v_new_level
  FROM public.player_levels
  WHERE required_exp <= v_current_exp;

  IF v_new_level > v_old_level THEN
    PERFORM set_config('kw.server_authorized', 'true', true);
    SELECT COALESCE(SUM(reward_coins), 0) INTO v_reward_coins
    FROM public.player_levels
    WHERE level > v_old_level AND level <= v_new_level;

    UPDATE public.profiles
    SET level = v_new_level,
        coins = coins + v_reward_coins,
        updated_at = now()
    WHERE id = p_profile_id
    RETURNING coins INTO v_new_balance;

    IF v_reward_coins > 0 THEN
      INSERT INTO public.coin_transactions (profile_id, amount, balance_after, transaction_type, reference_id)
      VALUES (p_profile_id, v_reward_coins, v_new_balance, 'level_up', 'level_' || v_new_level::text);
    END IF;
  END IF;

  RETURN v_new_level;
END;
$$;

-- ============================================================================
-- RPC 1: Create Game Room with Unique 6-digit PIN
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_game_room(
  p_quiz_id UUID,
  p_classroom_id UUID DEFAULT NULL,
  p_game_mode TEXT DEFAULT 'adventure_standard',
  p_allow_guest BOOLEAN DEFAULT true
)
RETURNS public.game_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin VARCHAR(6);
  v_room public.game_rooms;
  v_attempts INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to host a room';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('teacher', 'admin')
  ) THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: เฉพาะบัญชีคุณครูเท่านั้นที่สามารถสร้างห้องแข่งขันได้';
  END IF;

  LOOP
    v_attempts := v_attempts + 1;
    v_pin := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.game_rooms
      WHERE pin_code = v_pin AND status <> 'finished'
    ) OR v_attempts > 25;
  END LOOP;

  INSERT INTO public.game_rooms (
    pin_code, host_teacher_id, quiz_id, classroom_id, game_mode, status, allow_guest
  ) VALUES (
    v_pin, auth.uid(), p_quiz_id, p_classroom_id, p_game_mode, 'lobby', p_allow_guest
  )
  RETURNING * INTO v_room;

  INSERT INTO public.game_events (room_id, event_type, payload)
  VALUES (v_room.id, 'ROOM_CREATED', jsonb_build_object('pin_code', v_pin, 'quiz_id', p_quiz_id));

  RETURN v_room;
END;
$$;

-- ============================================================================
-- RPC 2: Join or Reconnect to Game Room (Prevents duplicate nicknames, supports Reconnect)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.join_game_room(
  p_pin_code VARCHAR(6),
  p_nickname TEXT,
  p_avatar_config JSONB,
  p_guest_token TEXT DEFAULT NULL
)
RETURNS public.game_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
  v_participant public.game_participants;
  v_clean_nick TEXT;
  v_count INTEGER;
BEGIN
  v_clean_nick := trim(p_nickname);
  IF char_length(v_clean_nick) < 2 OR char_length(v_clean_nick) > 30 THEN
    RAISE EXCEPTION 'ชื่อผู้เล่นต้องมีความยาว 2 ถึง 30 ตัวอักษร';
  END IF;

  SELECT * INTO v_room
  FROM public.game_rooms
  WHERE pin_code = p_pin_code
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรหัสห้องเกม % กรุณาตรวจสอบ Game PIN อีกครั้ง', p_pin_code;
  END IF;

  IF v_room.status = 'finished' THEN
    RAISE EXCEPTION 'การแข่งขันในห้องนี้จบลงแล้ว';
  END IF;

  -- Check if returning participant (reconnect by profile_id or guest_session_token)
  IF auth.uid() IS NOT NULL THEN
    SELECT * INTO v_participant
    FROM public.game_participants
    WHERE room_id = v_room.id AND profile_id = auth.uid()
    LIMIT 1;
  ELSIF p_guest_token IS NOT NULL THEN
    SELECT * INTO v_participant
    FROM public.game_participants
    WHERE room_id = v_room.id AND guest_session_token = p_guest_token
    LIMIT 1;
  END IF;

  IF FOUND THEN
    UPDATE public.game_participants
    SET is_connected = true,
        last_seen_at = now(),
        avatar_config = COALESCE(p_avatar_config, avatar_config)
    WHERE id = v_participant.id
    RETURNING * INTO v_participant;
    RETURN v_participant;
  END IF;

  -- Check room capacity
  SELECT COUNT(*) INTO v_count FROM public.game_participants WHERE room_id = v_room.id;
  IF v_count >= v_room.max_players THEN
    RAISE EXCEPTION 'ห้องเกมเต็มแล้ว (สูงสุด % คน)', v_room.max_players;
  END IF;

  -- Check duplicate nickname inside this room
  IF EXISTS (
    SELECT 1 FROM public.game_participants
    WHERE room_id = v_room.id AND lower(nickname) = lower(v_clean_nick)
  ) THEN
    RAISE EXCEPTION 'ชื่อ "%" มีผู้ใช้งานในห้องนี้แล้ว กรุณาตั้งชื่ออื่น', v_clean_nick;
  END IF;

  INSERT INTO public.game_participants (
    room_id, profile_id, guest_session_token, nickname, avatar_config, is_connected
  ) VALUES (
    v_room.id, auth.uid(), p_guest_token, v_clean_nick, p_avatar_config, true
  )
  RETURNING * INTO v_participant;

  INSERT INTO public.game_events (room_id, event_type, actor_participant_id, payload)
  VALUES (v_room.id, 'PLAYER_JOINED', v_participant.id, jsonb_build_object('nickname', v_clean_nick));

  RETURN v_participant;
END;
$$;

-- ============================================================================
-- RPC 3: Get Safe Public Question Payload (Hides is_correct until reveal, supports per-student auto-advance index!)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_public_question_payload(
  p_room_id UUID,
  p_question_index INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
  v_question public.questions;
  v_choices JSONB;
  v_reveal BOOLEAN;
  v_target_idx INTEGER;
  v_total_q INTEGER;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Strictly withhold questions from students until the teacher starts the exam
  IF v_room.status = 'lobby' AND auth.uid() IS DISTINCT FROM v_room.host_teacher_id THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO v_total_q FROM public.questions WHERE quiz_id = v_room.quiz_id;
  v_target_idx := COALESCE(p_question_index, GREATEST(0, v_room.current_question_index));

  SELECT * INTO v_question
  FROM public.questions
  WHERE quiz_id = v_room.quiz_id
  ORDER BY sort_order ASC
  OFFSET v_target_idx LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_reveal := (v_room.status IN ('question_reveal', 'leaderboard', 'finished')) OR (auth.uid() = v_room.host_teacher_id);

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ac.id,
      'question_id', ac.question_id,
      'choice_label', ac.choice_label,
      'choice_text', ac.choice_text,
      'image_url', ac.image_url,
      'sort_order', ac.sort_order,
      'is_correct', CASE WHEN v_reveal THEN ac.is_correct ELSE NULL END
    ) ORDER BY ac.sort_order ASC
  ) INTO v_choices
  FROM public.answer_choices ac
  WHERE ac.question_id = v_question.id;

  RETURN jsonb_build_object(
    'room_id', v_room.id,
    'status', v_room.status,
    'question_index', v_target_idx,
    'total_questions', v_total_q,
    'question_started_at', now(),
    'question_ends_at', now() + (v_question.time_limit_seconds || ' seconds')::interval,
    'question', jsonb_build_object(
      'id', v_question.id,
      'question_type', v_question.question_type,
      'prompt', v_question.prompt,
      'image_url', v_question.image_url,
      'time_limit_seconds', v_question.time_limit_seconds,
      'base_points', v_question.base_points,
      'speed_bonus_max', v_question.speed_bonus_max,
      'explanation', CASE WHEN v_reveal THEN v_question.explanation ELSE NULL END
    ),
    'choices', COALESCE(v_choices, '[]'::jsonb)
  );
END;
$$;

-- ============================================================================
-- RPC 4: Teacher Advances Question / Updates Room Phase
-- ============================================================================
CREATE OR REPLACE FUNCTION public.advance_game_question(
  p_room_id UUID,
  p_next_index INTEGER
)
RETURNS public.game_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
  v_question public.questions;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF v_room.host_teacher_id <> auth.uid() THEN
    RAISE EXCEPTION 'เฉพาะครูผู้สร้างห้องเท่านั้นที่สามารถเปลี่ยนคำถามได้';
  END IF;

  SELECT * INTO v_question
  FROM public.questions
  WHERE quiz_id = v_room.quiz_id
  ORDER BY sort_order ASC
  OFFSET p_next_index LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่มีคำถามในลำดับที่ระบุ';
  END IF;

  UPDATE public.game_rooms
  SET status = 'question_active',
      current_question_index = p_next_index,
      current_question_id = v_question.id,
      question_started_at = now(),
      question_ends_at = now() + (v_question.time_limit_seconds || ' seconds')::interval,
      started_at = COALESCE(started_at, now())
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  INSERT INTO public.game_events (room_id, event_type, payload)
  VALUES (
    p_room_id,
    'QUESTION_STARTED',
    jsonb_build_object(
      'question_index', p_next_index,
      'question_id', v_question.id,
      'time_limit_seconds', v_question.time_limit_seconds
    )
  );

  RETURN v_room;
END;
$$;

-- ============================================================================
-- RPC 5: Submit Answer (Server-Authoritative Scoring + RPG Power Drop)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_game_answer(
  p_room_id UUID,
  p_question_id UUID,
  p_participant_id UUID,
  p_choice_id UUID DEFAULT NULL,
  p_text_answer TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
  v_question public.questions;
  v_participant public.game_participants;
  v_is_correct BOOLEAN := false;
  v_elapsed_ms INTEGER;
  v_time_limit_ms INTEGER;
  v_base_awarded INTEGER := 0;
  v_speed_awarded INTEGER := 0;
  v_power_awarded INTEGER := 0;
  v_total_awarded INTEGER := 0;
  v_dropped_power public.powers;
  v_new_streak INTEGER;
  v_answer public.game_answers;
  v_total_weight INTEGER;
  v_rand INTEGER;
  v_running INTEGER := 0;
  r_pow RECORD;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบห้องเกม';
  END IF;

  IF v_room.status = 'finished' OR v_room.status = 'lobby' THEN
    RAISE EXCEPTION 'ห้องสอบไม่ได้อยู่ในสถานะกำลังทำข้อสอบ';
  END IF;

  SELECT * INTO v_question FROM public.questions WHERE id = p_question_id AND quiz_id = v_room.quiz_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคำถามในชุดข้อสอบนี้';
  END IF;

  SELECT * INTO v_participant
  FROM public.game_participants
  WHERE id = p_participant_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลผู้เล่นในห้องนี้';
  END IF;

  IF v_participant.is_disqualified THEN
    RAISE EXCEPTION 'คุณถูกปรับทุจริตเนื่องจากสลับหน้าจอหรือทำผิดกฎห้องสอบ ไม่สามารถส่งคำตอบได้';
  END IF;

  -- Check duplicate submission
  IF EXISTS (
    SELECT 1 FROM public.game_answers
    WHERE room_id = p_room_id AND question_id = p_question_id AND participant_id = p_participant_id
  ) THEN
    RAISE EXCEPTION 'คุณได้ส่งคำตอบของข้อนี้ไปแล้ว';
  END IF;

  v_time_limit_ms := v_question.time_limit_seconds * 1000;
  v_elapsed_ms := GREATEST(150, LEAST(v_time_limit_ms, FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(v_room.question_started_at, now()))) * 1000)::int));

  -- Validate answer correctness on the server
  IF v_question.question_type = 'text_quiz' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.answer_choices ac
      WHERE ac.question_id = p_question_id
        AND ac.is_correct = true
        AND lower(trim(ac.choice_text)) = lower(trim(COALESCE(p_text_answer, '')))
    ) INTO v_is_correct;
  ELSE
    SELECT COALESCE(ac.is_correct, false) INTO v_is_correct
    FROM public.answer_choices ac
    WHERE ac.id = p_choice_id AND ac.question_id = p_question_id;
  END IF;

  IF v_is_correct THEN
    v_base_awarded := v_question.base_points;
    v_speed_awarded := ROUND(v_question.speed_bonus_max * GREATEST(0.0, 1.0 - (v_elapsed_ms::numeric / v_time_limit_ms::numeric)))::int;
    v_new_streak := v_participant.streak_count + 1;

    -- Apply active RPG power if equipped
    IF v_participant.active_power = 'lightning' THEN
      v_power_awarded := 350;
    ELSIF v_participant.active_power = 'fire' THEN
      v_power_awarded := ROUND((v_base_awarded + v_speed_awarded) * 0.5)::int;
    ELSIF v_participant.active_power = 'lucky' THEN
      v_power_awarded := 250;
    END IF;

    v_total_awarded := v_base_awarded + v_speed_awarded + v_power_awarded;

    -- Server-side RPG Power Random Roll (45% chance on correct answer, or 80% with lucky power)
    IF (random() < CASE WHEN v_participant.active_power = 'lucky' THEN 0.80 ELSE 0.45 END) THEN
      SELECT COALESCE(SUM(drop_weight), 0) INTO v_total_weight FROM public.powers WHERE is_enabled = true;
      IF v_total_weight > 0 THEN
        v_rand := floor(random() * v_total_weight)::int + 1;
        FOR r_pow IN SELECT * FROM public.powers WHERE is_enabled = true ORDER BY power_type LOOP
          v_running := v_running + r_pow.drop_weight;
          IF v_rand <= v_running THEN
            v_dropped_power := r_pow;
            EXIT;
          END IF;
        END LOOP;

        IF v_dropped_power.id IS NOT NULL THEN
          INSERT INTO public.player_powers (profile_id, participant_id, room_id, power_id, power_type, status)
          VALUES (v_participant.profile_id, v_participant.id, p_room_id, v_dropped_power.id, v_dropped_power.power_type, 'in_inventory');
        END IF;
      END IF;
    END IF;
  ELSE
    -- Wrong answer: check Shield Power
    IF v_participant.shield_active THEN
      v_new_streak := v_participant.streak_count; -- Shield preserves streak!
    ELSE
      v_new_streak := 0;
    END IF;
  END IF;

  INSERT INTO public.game_answers (
    room_id, question_id, participant_id, selected_choice_id, text_answer,
    is_correct, response_time_ms, base_points_awarded, speed_bonus_awarded,
    power_bonus_awarded, total_points_awarded, power_triggered
  ) VALUES (
    p_room_id, p_question_id, p_participant_id, p_choice_id, p_text_answer,
    v_is_correct, v_elapsed_ms, v_base_awarded, v_speed_awarded,
    v_power_awarded, v_total_awarded, v_participant.active_power
  )
  RETURNING * INTO v_answer;

  UPDATE public.game_participants
  SET current_score = current_score + v_total_awarded,
      correct_count = correct_count + (CASE WHEN v_is_correct THEN 1 ELSE 0 END),
      streak_count = v_new_streak,
      max_streak = GREATEST(max_streak, v_new_streak),
      total_response_ms = total_response_ms + v_elapsed_ms,
      active_power = NULL,
      shield_active = CASE WHEN NOT v_is_correct AND shield_active THEN false ELSE shield_active END,
      last_seen_at = now()
  WHERE id = p_participant_id;

  RETURN jsonb_build_object(
    'answer_id', v_answer.id,
    'is_correct', v_is_correct,
    'response_time_ms', v_elapsed_ms,
    'base_points_awarded', v_base_awarded,
    'speed_bonus_awarded', v_speed_awarded,
    'power_bonus_awarded', v_power_awarded,
    'total_points_awarded', v_total_awarded,
    'new_streak', v_new_streak,
    'dropped_power', CASE WHEN v_dropped_power.id IS NOT NULL THEN jsonb_build_object(
      'power_type', v_dropped_power.power_type,
      'name', v_dropped_power.name,
      'rarity', v_dropped_power.rarity,
      'description', v_dropped_power.description
    ) ELSE NULL END
  );
END;
$$;

-- ============================================================================
-- RPC 6: Activate RPG Power from Inventory (Enforces Cooldown)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.use_player_power(
  p_room_id UUID,
  p_participant_id UUID,
  p_player_power_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pp public.player_powers;
  v_pow public.powers;
  v_last_used TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_pp
  FROM public.player_powers
  WHERE id = p_player_power_id AND participant_id = p_participant_id AND status = 'in_inventory'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบพลังนี้ในคลังหรือถูกใช้งานไปแล้ว';
  END IF;

  SELECT * INTO v_pow FROM public.powers WHERE id = v_pp.power_id;

  -- Check cooldown across participant's recently used powers
  SELECT MAX(cooldown_until) INTO v_last_used
  FROM public.player_powers
  WHERE participant_id = p_participant_id AND status = 'activated';

  IF v_last_used IS NOT NULL AND v_last_used > now() THEN
    RAISE EXCEPTION 'สกิลอยู่ในช่วง Cooldown กรุณารออีก % วินาที', CEIL(EXTRACT(EPOCH FROM (v_last_used - now())))::int;
  END IF;

  UPDATE public.player_powers
  SET status = 'activated',
      used_at = now(),
      cooldown_until = now() + (v_pow.cooldown_seconds || ' seconds')::interval
  WHERE id = v_pp.id;

  IF v_pow.power_type = 'shield' THEN
    UPDATE public.game_participants
    SET shield_active = true, active_power = 'shield'
    WHERE id = p_participant_id;
  ELSE
    UPDATE public.game_participants
    SET active_power = v_pow.power_type
    WHERE id = p_participant_id;
  END IF;

  INSERT INTO public.game_events (room_id, event_type, actor_participant_id, payload)
  VALUES (p_room_id, 'POWER_ACTIVATED', p_participant_id, jsonb_build_object('power_type', v_pow.power_type, 'name', v_pow.name));

  RETURN jsonb_build_object(
    'activated', true,
    'power_type', v_pow.power_type,
    'name', v_pow.name,
    'cooldown_seconds', v_pow.cooldown_seconds
  );
END;
$$;

-- ============================================================================
-- RPC 7: Server-Authoritative Lucky Block Roll (Anti-Duplicate Claim Token)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.roll_lucky_block(
  p_claim_token TEXT,
  p_room_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_total_weight INTEGER;
  v_rand INTEGER;
  v_running INTEGER := 0;
  v_selected public.rewards;
  v_new_coins INTEGER;
  v_new_level INTEGER;
  r_rew RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'กรุณาเข้าสู่ระบบนักเรียนเพื่อเปิด Lucky Block และบันทึกไอเทมลงคลัง';
  END IF;

  IF EXISTS (SELECT 1 FROM public.reward_history WHERE claim_token = p_claim_token) THEN
    RAISE EXCEPTION 'คุณได้รับรางวัลจากกล่องสุ่มนี้ไปแล้ว (ป้องกันการกดซ้ำ)';
  END IF;

  SELECT COALESCE(SUM(probability_weight), 0) INTO v_total_weight
  FROM public.rewards
  WHERE is_active = true;

  IF v_total_weight <= 0 THEN
    RAISE EXCEPTION 'ยังไม่มีรางวัลที่เปิดใช้งานในระบบ';
  END IF;

  v_rand := floor(random() * v_total_weight)::int + 1;
  FOR r_rew IN SELECT * FROM public.rewards WHERE is_active = true ORDER BY id LOOP
    v_running := v_running + r_rew.probability_weight;
    IF v_rand <= v_running THEN
      v_selected := r_rew;
      EXIT;
    END IF;
  END LOOP;

  -- Apply reward
  PERFORM set_config('kw.server_authorized', 'true', true);
  IF v_selected.reward_type = 'coins' OR v_selected.coin_amount > 0 THEN
    UPDATE public.profiles
    SET coins = coins + v_selected.coin_amount,
        updated_at = now()
    WHERE id = v_uid
    RETURNING coins INTO v_new_coins;

    INSERT INTO public.coin_transactions (profile_id, amount, balance_after, transaction_type, reference_id)
    VALUES (v_uid, v_selected.coin_amount, v_new_coins, 'lucky_block', p_claim_token);
  END IF;

  IF v_selected.reward_type = 'exp' OR v_selected.exp_amount > 0 THEN
    UPDATE public.profiles
    SET exp = exp + v_selected.exp_amount,
        updated_at = now()
    WHERE id = v_uid;
    v_new_level := public.recalculate_player_level(v_uid);
  END IF;

  IF v_selected.reward_type = 'avatar_item' AND v_selected.item_id IS NOT NULL THEN
    INSERT INTO public.player_inventory (profile_id, item_id, acquired_source)
    VALUES (v_uid, v_selected.item_id, 'lucky_block')
    ON CONFLICT (profile_id, item_id) DO NOTHING;
  END IF;

  INSERT INTO public.reward_history (profile_id, reward_id, room_id, claim_token, rarity, reward_summary)
  VALUES (
    v_uid,
    v_selected.id,
    p_room_id,
    p_claim_token,
    v_selected.rarity,
    jsonb_build_object(
      'name', v_selected.name,
      'reward_type', v_selected.reward_type,
      'rarity', v_selected.rarity,
      'coin_amount', v_selected.coin_amount,
      'exp_amount', v_selected.exp_amount
    )
  );

  RETURN jsonb_build_object(
    'reward_id', v_selected.id,
    'name', v_selected.name,
    'reward_type', v_selected.reward_type,
    'rarity', v_selected.rarity,
    'coin_amount', v_selected.coin_amount,
    'exp_amount', v_selected.exp_amount,
    'item_id', v_selected.item_id
  );
END;
$$;

-- ============================================================================
-- RPC 8: Purchase Avatar Item in Shop (Server-Validated Coins & Level)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.purchase_avatar_item(
  p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile public.profiles;
  v_item public.avatar_items;
  v_new_balance INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'กรุณาเข้าสู่ระบบก่อนซื้อไอเทม';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  SELECT * INTO v_item FROM public.avatar_items WHERE id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบไอเทมที่ต้องการซื้อ';
  END IF;

  IF EXISTS (SELECT 1 FROM public.player_inventory WHERE profile_id = v_uid AND item_id = p_item_id) THEN
    RAISE EXCEPTION 'คุณมีไอเทมชิ้นนี้อยู่ในคลังแล้ว';
  END IF;

  IF v_profile.level < v_item.required_level THEN
    RAISE EXCEPTION 'ต้องมี Level % ขึ้นไปจึงจะปลดล็อกไอเทมนี้ได้', v_item.required_level;
  END IF;

  IF v_profile.coins < v_item.price_coins THEN
    RAISE EXCEPTION 'เหรียญไม่เพียงพอ (ต้องการ % เหรียญ)', v_item.price_coins;
  END IF;

  PERFORM set_config('kw.server_authorized', 'true', true);
  UPDATE public.profiles
  SET coins = coins - v_item.price_coins,
      updated_at = now()
  WHERE id = v_uid
  RETURNING coins INTO v_new_balance;

  INSERT INTO public.player_inventory (profile_id, item_id, acquired_source)
  VALUES (v_uid, p_item_id, 'shop');

  IF v_item.price_coins > 0 THEN
    INSERT INTO public.coin_transactions (profile_id, amount, balance_after, transaction_type, reference_id)
    VALUES (v_uid, -v_item.price_coins, v_new_balance, 'shop_purchase', v_item.code);
  END IF;

  RETURN jsonb_build_object(
    'purchased', true,
    'item_code', v_item.code,
    'remaining_coins', v_new_balance
  );
END;
$$;

-- ============================================================================
-- RPC 9: Finalize Game Room, Compute Ranks, Award Coins/EXP & Update History
-- ============================================================================
CREATE OR REPLACE FUNCTION public.finalize_game_room(
  p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
  v_total_questions INTEGER;
  v_rank INTEGER := 0;
  v_coins INTEGER;
  v_exp INTEGER;
  v_new_balance INTEGER;
  r_part RECORD;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบห้องเกม';
  END IF;

  IF v_room.host_teacher_id <> auth.uid() THEN
    RAISE EXCEPTION 'เฉพาะครูผู้จัดเกมเท่านั้นที่สามารถจบการแข่งขันได้';
  END IF;

  SELECT COUNT(*) INTO v_total_questions FROM public.questions WHERE quiz_id = v_room.quiz_id;
  v_total_questions := GREATEST(v_total_questions, 1);

  UPDATE public.game_rooms
  SET status = 'finished',
      ended_at = now()
  WHERE id = p_room_id;

  -- Deterministic Ranking: Non-disqualified first, then 1) correct_count (Real Exam Score 1 pt each) DESC, 2) current_score (Game EXP/Points) DESC, 3) total_response_ms ASC
  FOR r_part IN
    SELECT *
    FROM public.game_participants
    WHERE room_id = p_room_id
    ORDER BY is_disqualified ASC, correct_count DESC, current_score DESC, total_response_ms ASC, joined_at ASC
  LOOP
    v_rank := v_rank + 1;
    IF r_part.is_disqualified THEN
      v_coins := 0;
      v_exp := 0;
    ELSE
      v_coins := GREATEST(20, (r_part.correct_count * 25) + CASE WHEN v_rank = 1 THEN 100 WHEN v_rank = 2 THEN 60 WHEN v_rank = 3 THEN 40 ELSE 10 END);
      v_exp := GREATEST(30, (r_part.correct_count * 50) + ROUND(r_part.current_score / 25.0)::int + CASE WHEN v_rank <= 3 THEN 100 ELSE 30 END);
    END IF;

    INSERT INTO public.scores (
      room_id, participant_id, profile_id, classroom_id, total_score,
      correct_answers, total_questions, accuracy_percent, avg_response_ms,
      final_rank, is_disqualified, disqualified_reason, coins_earned, exp_earned
    ) VALUES (
      p_room_id, r_part.id, r_part.profile_id, v_room.classroom_id,
      CASE WHEN r_part.is_disqualified THEN 0 ELSE r_part.current_score END,
      CASE WHEN r_part.is_disqualified THEN 0 ELSE r_part.correct_count END,
      v_total_questions,
      CASE WHEN r_part.is_disqualified THEN 0 ELSE ROUND((r_part.correct_count::numeric / v_total_questions::numeric) * 100, 2) END,
      CASE WHEN r_part.correct_count > 0 THEN ROUND(r_part.total_response_ms::numeric / v_total_questions)::int ELSE 0 END,
      v_rank, r_part.is_disqualified, r_part.disqualified_reason, v_coins, v_exp
    )
    ON CONFLICT (room_id, participant_id) DO UPDATE
    SET total_score = EXCLUDED.total_score,
        correct_answers = EXCLUDED.correct_answers,
        final_rank = EXCLUDED.final_rank,
        is_disqualified = EXCLUDED.is_disqualified,
        disqualified_reason = EXCLUDED.disqualified_reason,
        coins_earned = EXCLUDED.coins_earned,
        exp_earned = EXCLUDED.exp_earned;

    IF r_part.profile_id IS NOT NULL AND NOT r_part.is_disqualified THEN
      PERFORM set_config('kw.server_authorized', 'true', true);
      UPDATE public.profiles
      SET coins = coins + v_coins,
          exp = exp + v_exp,
          total_games_played = total_games_played + 1,
          total_score = total_score + r_part.current_score,
          updated_at = now()
      WHERE id = r_part.profile_id
      RETURNING coins INTO v_new_balance;

      INSERT INTO public.coin_transactions (profile_id, amount, balance_after, transaction_type, reference_id)
      VALUES (r_part.profile_id, v_coins, v_new_balance, 'quiz_reward', p_room_id::text);

      PERFORM public.recalculate_player_level(r_part.profile_id);
    END IF;
  END LOOP;

  INSERT INTO public.game_history (
    room_id, quiz_id, teacher_id, classroom_id,
    total_participants, average_score, average_accuracy,
    top_player_nickname, top_player_score, started_at, ended_at
  )
  SELECT
    p_room_id,
    v_room.quiz_id,
    v_room.host_teacher_id,
    v_room.classroom_id,
    COUNT(*),
    COALESCE(ROUND(AVG(total_score), 2), 0),
    COALESCE(ROUND(AVG(accuracy_percent), 2), 0),
    (SELECT gp.nickname FROM public.game_participants gp WHERE gp.room_id = p_room_id ORDER BY gp.current_score DESC, gp.correct_count DESC, gp.total_response_ms ASC LIMIT 1),
    COALESCE(MAX(total_score), 0),
    v_room.started_at,
    now()
  FROM public.scores
  WHERE room_id = p_room_id
  ON CONFLICT (room_id) DO NOTHING;

  RETURN jsonb_build_object('status', 'finished', 'ranked_players', v_rank);
END;
$$;

-- ============================================================================
-- RPC 10: Immediate Anti-Cheat Disqualification (Zero-Tolerance Exam Proctoring)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.disqualify_participant(
  p_room_id UUID,
  p_participant_id UUID,
  p_reason TEXT DEFAULT 'ตรวจพบการสลับแท็บหรือออกจากหน้าจอห้องสอบ'
)
RETURNS public.game_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_part public.game_participants;
BEGIN
  UPDATE public.game_participants
  SET is_disqualified = true,
      disqualified_reason = p_reason,
      current_score = 0,
      streak_count = 0,
      last_seen_at = now()
  WHERE id = p_participant_id AND room_id = p_room_id
  RETURNING * INTO v_part;

  IF FOUND THEN
    INSERT INTO public.game_events (room_id, event_type, actor_participant_id, payload)
    VALUES (
      p_room_id,
      'CHEATING_DISQUALIFIED',
      p_participant_id,
      jsonb_build_object('nickname', v_part.nickname, 'reason', p_reason)
    );
  END IF;

  RETURN v_part;
END;
$$;

-- ============================================================================
-- RPC 11: Teacher Pardon Disqualified Student (In case of hardware/accidental issue)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pardon_participant(
  p_room_id UUID,
  p_participant_id UUID
)
RETURNS public.game_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
  v_part public.game_participants;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.host_teacher_id <> auth.uid() THEN
    RAISE EXCEPTION 'เฉพาะคุณครูผู้คุมสอบเท่านั้นที่สามารถปลดล็อกได้';
  END IF;

  UPDATE public.game_participants gp
  SET is_disqualified = false,
      disqualified_reason = NULL,
      correct_count = COALESCE((
        SELECT COUNT(*) FROM public.game_answers ga
        WHERE ga.room_id = p_room_id AND ga.participant_id = p_participant_id AND ga.is_correct = true
      ), 0),
      current_score = COALESCE((
        SELECT SUM(ga.total_points_awarded) FROM public.game_answers ga
        WHERE ga.room_id = p_room_id AND ga.participant_id = p_participant_id
      ), 0),
      total_response_ms = COALESCE((
        SELECT SUM(ga.response_time_ms) FROM public.game_answers ga
        WHERE ga.room_id = p_room_id AND ga.participant_id = p_participant_id
      ), 0),
      last_seen_at = now()
  WHERE gp.id = p_participant_id AND gp.room_id = p_room_id
  RETURNING * INTO v_part;

  RETURN v_part;
END;
$$;
