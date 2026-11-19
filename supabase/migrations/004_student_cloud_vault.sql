-- ============================================================================
-- 004_student_cloud_vault.sql
-- Cross-Device Student Identity Cloud Vault (Real Name + Last 3 Digits)
-- Enables any student on ANY phone/device to recall their exact Avatar,
-- Coins, Level, Lucky Tickets, and Owned Items simply by typing their
-- Real Name + Last 3 Digits of Student ID — no email/password required!
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.student_identities (
  identity_key TEXT PRIMARY KEY,
  display_identity TEXT NOT NULL,
  real_name TEXT NOT NULL,
  last_3_digits TEXT NOT NULL CHECK (last_3_digits ~ '^[0-9]{3}$'),
  avatar_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  wallet_coins INTEGER NOT NULL DEFAULT 100 CHECK (wallet_coins >= 0),
  total_accumulated_exp INTEGER NOT NULL DEFAULT 0 CHECK (total_accumulated_exp >= 0),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  lucky_tickets INTEGER NOT NULL DEFAULT 1 CHECK (lucky_tickets >= 0),
  owned_item_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  credited_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_identities_last_seen
  ON public.student_identities (last_seen_at DESC);

ALTER TABLE public.student_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers can view all student identities" ON public.student_identities;
CREATE POLICY "Teachers can view all student identities"
  ON public.student_identities
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.student_identities TO authenticated;

-- 1) Fetch student cloud profile by normalized identity_key (callable by anon & authenticated)
CREATE OR REPLACE FUNCTION public.get_student_identity_cloud(
  p_identity_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.student_identities%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.student_identities
  WHERE identity_key = lower(trim(p_identity_key));

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

-- 2) Upsert / Sync student cloud profile across any device
CREATE OR REPLACE FUNCTION public.upsert_student_identity_cloud(
  p_identity_key TEXT,
  p_display_identity TEXT,
  p_real_name TEXT,
  p_last_3_digits TEXT,
  p_avatar_config JSONB,
  p_wallet_coins INTEGER,
  p_total_accumulated_exp INTEGER,
  p_level INTEGER,
  p_lucky_tickets INTEGER,
  p_owned_item_codes TEXT[],
  p_games_played INTEGER,
  p_credited_keys TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT := lower(trim(p_identity_key));
  v_row public.student_identities%ROWTYPE;
BEGIN
  IF length(v_key) < 4 OR p_last_3_digits !~ '^[0-9]{3}$' THEN
    RAISE EXCEPTION 'Invalid student identity key or 3-digit code';
  END IF;

  INSERT INTO public.student_identities (
    identity_key,
    display_identity,
    real_name,
    last_3_digits,
    avatar_config,
    wallet_coins,
    total_accumulated_exp,
    level,
    lucky_tickets,
    owned_item_codes,
    games_played,
    credited_keys,
    last_seen_at
  )
  VALUES (
    v_key,
    trim(p_display_identity),
    trim(p_real_name),
    trim(p_last_3_digits),
    COALESCE(p_avatar_config, '{}'::jsonb),
    GREATEST(0, COALESCE(p_wallet_coins, 100)),
    GREATEST(0, COALESCE(p_total_accumulated_exp, 0)),
    GREATEST(1, COALESCE(p_level, 1)),
    GREATEST(0, COALESCE(p_lucky_tickets, 1)),
    COALESCE(p_owned_item_codes, ARRAY[]::TEXT[]),
    GREATEST(0, COALESCE(p_games_played, 0)),
    COALESCE(p_credited_keys, ARRAY[]::TEXT[]),
    NOW()
  )
  ON CONFLICT (identity_key) DO UPDATE SET
    display_identity = EXCLUDED.display_identity,
    avatar_config = EXCLUDED.avatar_config,
    wallet_coins = GREATEST(0, EXCLUDED.wallet_coins),
    total_accumulated_exp = GREATEST(public.student_identities.total_accumulated_exp, EXCLUDED.total_accumulated_exp),
    level = GREATEST(public.student_identities.level, EXCLUDED.level),
    lucky_tickets = GREATEST(0, EXCLUDED.lucky_tickets),
    owned_item_codes = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(
          COALESCE(public.student_identities.owned_item_codes, ARRAY[]::TEXT[])
          || COALESCE(EXCLUDED.owned_item_codes, ARRAY[]::TEXT[])
        )
      )
    ),
    games_played = GREATEST(public.student_identities.games_played, EXCLUDED.games_played),
    credited_keys = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(
          COALESCE(public.student_identities.credited_keys, ARRAY[]::TEXT[])
          || COALESCE(EXCLUDED.credited_keys, ARRAY[]::TEXT[])
        )
      )
    ),
    last_seen_at = NOW()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_identity_cloud(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_student_identity_cloud(
  TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], INTEGER, TEXT[]
) TO anon, authenticated;
