-- =====================================================================
-- TeSiMok — SETUP LENGKAP (sekali jalan)
--
-- Cara pakai:
--   1. Buka Supabase Dashboard -> SQL Editor -> New query
--   2. Paste SELURUH isi file ini
--   3. Klik Run (atau Ctrl+Enter)
--   4. Verifikasi:  npm run check
--
-- Aman dijalankan berulang kali (semua statement idempoten).
-- JANGAN edit file ini langsung — ia digenerate oleh
-- scripts/build-setup-sql.js dari:
--   1. supabase/migrations/20260925000001_v2_game_system.sql
--   2. supabase/migrations/20260925000002_guess_text_mode.sql
--   3. supabase/seed-blank-images.sql
-- =====================================================================


-- #####################################################################
-- ## SKEMA V2 — tabel, RPC, RLS, seed 10 stage / stiker / toko
-- ## sumber: supabase/migrations/20260925000001_v2_game_system.sql
-- #####################################################################

-- ============================================================
-- TeSiMok v2 — Migration
-- Run AFTER the original schema.sql
-- Adds: profiles (lives/keys/subscription), stages, progress,
--       ranked battles, taunts, daily rewards, monetization.
-- ============================================================

-- ============================================================
-- 0. Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. PROFILES — the heart of the v2 meta-game
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL DEFAULT 'Pemain',
  avatar_emoji      TEXT NOT NULL DEFAULT '😎',

  -- Economy
  coins             INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),

  -- ❤️ Lives: max 5, +1 every 2 hours
  lives             SMALLINT NOT NULL DEFAULT 5 CHECK (lives BETWEEN 0 AND 5),
  max_lives         SMALLINT NOT NULL DEFAULT 5,
  life_regen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 🔑 Answer keys
  answer_keys       SMALLINT NOT NULL DEFAULT 2 CHECK (answer_keys >= 0),
  keys_reset_on     DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,

  -- 💎 Subscription
  is_premium        BOOLEAN NOT NULL DEFAULT false,
  premium_until     TIMESTAMPTZ,
  premium_tier      TEXT,                        -- 'monthly' | 'yearly'

  -- 🎁 Daily reward
  daily_streak      SMALLINT NOT NULL DEFAULT 0,
  last_daily_claim  DATE,

  -- 🏆 Ranked
  rating            INTEGER NOT NULL DEFAULT 1000,
  ranked_wins       INTEGER NOT NULL DEFAULT 0,
  ranked_losses     INTEGER NOT NULL DEFAULT 0,
  ranked_draws      INTEGER NOT NULL DEFAULT 0,

  -- 📊 Lifetime stats
  total_score       BIGINT  NOT NULL DEFAULT 0,
  stages_cleared    SMALLINT NOT NULL DEFAULT 0,
  total_stars       SMALLINT NOT NULL DEFAULT 0,

  -- Preferences
  sound_enabled     BOOLEAN NOT NULL DEFAULT true,
  haptics_enabled   BOOLEAN NOT NULL DEFAULT true,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_rating ON profiles(rating DESC, ranked_wins DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_lives  ON profiles(lives) WHERE lives < 5;

-- ============================================================
-- 2. STAGES — 10 hand-tuned stages with rising difficulty
-- ============================================================
CREATE TABLE IF NOT EXISTS stages (
  id                SMALLINT PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  subtitle          TEXT,
  emoji             TEXT NOT NULL DEFAULT '🎯',
  question_count    SMALLINT NOT NULL DEFAULT 10,
  time_per_question SMALLINT NOT NULL DEFAULT 20,   -- seconds
  pass_percent      SMALLINT NOT NULL DEFAULT 60,   -- % correct needed for 1 star
  star2_percent     SMALLINT NOT NULL DEFAULT 80,
  star3_percent     SMALLINT NOT NULL DEFAULT 100,
  required_stars    SMALLINT NOT NULL DEFAULT 0,    -- total stars needed to unlock
  required_stage    SMALLINT,                       -- previous stage must be cleared
  category_filter   TEXT[],                         -- NULL = all categories
  is_premium        BOOLEAN NOT NULL DEFAULT false,
  reward_coins      INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. STAGE PROGRESS — per-user stars & best score
-- ============================================================
CREATE TABLE IF NOT EXISTS stage_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_id      SMALLINT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  stars         SMALLINT NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 3),
  best_score    INTEGER NOT NULL DEFAULT 0,
  best_accuracy SMALLINT NOT NULL DEFAULT 0,
  attempts      INTEGER NOT NULL DEFAULT 0,
  cleared_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, stage_id)
);

CREATE INDEX IF NOT EXISTS idx_stage_progress_user ON stage_progress(user_id);

-- ============================================================
-- 4. STAGE RUNS — one row per attempt (server-authoritative)
-- ============================================================
CREATE TABLE IF NOT EXISTS stage_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_id            SMALLINT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  question_ids        UUID[] NOT NULL,
  current_idx         SMALLINT NOT NULL DEFAULT 0,
  score               INTEGER NOT NULL DEFAULT 0,
  streak              SMALLINT NOT NULL DEFAULT 0,
  max_streak          SMALLINT NOT NULL DEFAULT 0,
  correct_count       SMALLINT NOT NULL DEFAULT 0,
  keys_used           SMALLINT NOT NULL DEFAULT 0,
  question_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','completed','abandoned')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stage_runs_user ON stage_runs(user_id, status);

-- ============================================================
-- 5. RANKED BATTLES
-- ============================================================
CREATE TABLE IF NOT EXISTS battles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_a          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_b          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  score_a           INTEGER NOT NULL DEFAULT 0,
  score_b           INTEGER NOT NULL DEFAULT 0,
  correct_a         SMALLINT NOT NULL DEFAULT 0,
  correct_b         SMALLINT NOT NULL DEFAULT 0,
  rating_a_before   INTEGER,
  rating_b_before   INTEGER,
  rating_a_delta    INTEGER NOT NULL DEFAULT 0,
  rating_b_delta    INTEGER NOT NULL DEFAULT 0,

  -- Shared question sequence (identical for both players = fair)
  question_ids      UUID[] NOT NULL,
  seed              BIGINT NOT NULL DEFAULT 0,

  status            TEXT NOT NULL DEFAULT 'waiting'
                      CHECK (status IN ('waiting','countdown','active','finished','cancelled')),
  duration_seconds  SMALLINT NOT NULL DEFAULT 60,
  started_at        TIMESTAMPTZ,
  ends_at           TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  winner            UUID,
  is_draw           BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_battles_waiting  ON battles(status, created_at) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_battles_player_a ON battles(player_a);
CREATE INDEX IF NOT EXISTS idx_battles_player_b ON battles(player_b);

-- Per-question answers inside a battle
CREATE TABLE IF NOT EXISTS battle_answers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id    UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id  UUID NOT NULL,
  is_correct   BOOLEAN NOT NULL,
  points       INTEGER NOT NULL DEFAULT 0,
  answered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (battle_id, user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_battle_answers_battle ON battle_answers(battle_id);

-- ============================================================
-- 6. TAUNT MESSAGES — realtime stickers between opponents
-- ============================================================
CREATE TABLE IF NOT EXISTS taunt_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id  UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sticker    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taunt_battle ON taunt_messages(battle_id, created_at DESC);

-- ============================================================
-- 7. COSMETIC STICKERS + OWNERSHIP (monetisation / collection)
-- ============================================================
CREATE TABLE IF NOT EXISTS stickers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  rarity      TEXT NOT NULL DEFAULT 'common'
                CHECK (rarity IN ('common','rare','epic','legendary')),
  price_coins INTEGER NOT NULL DEFAULT 0,
  price_idr   INTEGER NOT NULL DEFAULT 0,
  is_premium  BOOLEAN NOT NULL DEFAULT false,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_stickers (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sticker_id TEXT NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  source     TEXT NOT NULL DEFAULT 'shop',
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sticker_id)
);

-- ============================================================
-- 8. WEEKLY RANKED LEADERBOARD (materialised per week)
-- ============================================================
CREATE TABLE IF NOT EXISTS weekly_ranked (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start    DATE NOT NULL,
  player_name   TEXT NOT NULL,
  avatar_emoji  TEXT NOT NULL DEFAULT '😎',
  rating        INTEGER NOT NULL DEFAULT 1000,
  points        INTEGER NOT NULL DEFAULT 0,
  wins          INTEGER NOT NULL DEFAULT 0,
  losses        INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start),
  UNIQUE (week_start, user_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_ranked_board ON weekly_ranked(week_start, points DESC);

-- ============================================================
-- 9. TRANSACTIONS — purchase audit trail (monetisation)
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sku          TEXT NOT NULL,
  amount_idr   INTEGER NOT NULL DEFAULT 0,
  kind         TEXT NOT NULL,            -- 'lives' | 'keys' | 'subscription' | 'coins' | 'no_ads'
  quantity     INTEGER NOT NULL DEFAULT 1,
  provider     TEXT NOT NULL DEFAULT 'mock',
  provider_ref TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','paid','failed','refunded')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at DESC);

-- ============================================================
-- 10. SHOP CATALOGUE
-- ============================================================
CREATE TABLE IF NOT EXISTS shop_items (
  sku         TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  kind        TEXT NOT NULL,              -- lives|keys|subscription|coins|no_ads
  price_idr   INTEGER NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  badge       TEXT,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- 11. DAILY REWARD SCRIPT (7-day cycle)
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_reward_claims (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_date  DATE NOT NULL,
  day_index   SMALLINT NOT NULL,     -- 1..7 rewards cycle
  lives       SMALLINT NOT NULL DEFAULT 0,
  keys        SMALLINT NOT NULL DEFAULT 0,
  coins       INTEGER NOT NULL DEFAULT 0,
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, claim_date)
);

-- ============================================================
-- 12. updated_at trigger helper
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- 13. AUTO-CREATE PROFILE ON SIGN-UP
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_emoji, lives, answer_keys, life_regen_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1), 'Pemain'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_emoji', '😎'),
    5,
    2,
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Grant the starter sticker pack
  INSERT INTO public.user_stickers (user_id, sticker_id, source)
  SELECT NEW.id, s.id, 'starter'
  FROM public.stickers s
  WHERE s.is_premium = false AND s.price_idr = 0
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 14. LIFE REGENERATION (1 life / 2 hours, lazy evaluation)
-- ============================================================
CREATE OR REPLACE FUNCTION refill_lives(p_user UUID)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p             profiles;
  elapsed       INTERVAL;
  gained        INTEGER;
BEGIN
  SELECT * INTO p FROM profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF p.lives < p.max_lives THEN
    elapsed := now() - p.life_regen_at;
    gained  := FLOOR(EXTRACT(EPOCH FROM elapsed) / 7200)::INTEGER;   -- 2h = 7200s
    IF gained > 0 THEN
      p.lives := LEAST(p.max_lives, p.lives + gained);
      IF p.lives >= p.max_lives THEN
        p.life_regen_at := now();
      ELSE
        p.life_regen_at := p.life_regen_at + (gained * INTERVAL '2 hours');
      END IF;
      UPDATE profiles
         SET lives = p.lives, life_regen_at = p.life_regen_at
       WHERE id = p_user;
    END IF;
  ELSE
    p.life_regen_at := now();
  END IF;

  RETURN p;
END;
$$;

-- Spend one life. Returns the refreshed profile.
CREATE OR REPLACE FUNCTION spend_life(p_user UUID)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p profiles;
BEGIN
  p := refill_lives(p_user);

  IF p.lives <= 0 THEN
    RAISE EXCEPTION 'NO_LIVES';
  END IF;

  -- Restart the regen timer when going from full to 4
  IF p.lives = p.max_lives THEN
    UPDATE profiles SET lives = lives - 1, life_regen_at = now() WHERE id = p_user;
  ELSE
    UPDATE profiles SET lives = lives - 1 WHERE id = p_user;
  END IF;

  SELECT * INTO p FROM profiles WHERE id = p_user;
  RETURN p;
END;
$$;

-- ============================================================
-- 15. ANSWER KEYS — daily reset of the 2 free keys
-- ============================================================
CREATE OR REPLACE FUNCTION refill_daily_keys(p_user UUID)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p        profiles;
  today    DATE := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT * INTO p FROM profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF p.keys_reset_on < today THEN
    -- Free keys do NOT stack: you get 2 fresh ones each day.
    UPDATE profiles
       SET answer_keys = GREATEST(p.answer_keys, 2),
           keys_reset_on = today
     WHERE id = p_user;

    SELECT * INTO p FROM profiles WHERE id = p_user;
  END IF;

  RETURN p;
END;
$$;

-- ============================================================
-- 16. GET OR CREATE PROFILE (self-healing for legacy users)
-- ============================================================
CREATE OR REPLACE FUNCTION get_profile()
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p profiles;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO p FROM profiles WHERE id = auth.uid();

  IF NOT FOUND THEN
    INSERT INTO profiles (id, display_name, avatar_emoji)
    VALUES (
      auth.uid(),
      COALESCE(
        (SELECT COALESCE(raw_user_meta_data->>'display_name', split_part(email, '@', 1))
           FROM auth.users WHERE id = auth.uid()),
        'Pemain'
      ),
      '😎'
    )
    RETURNING * INTO p;
  END IF;

  -- Lazy regen on every read
  p := refill_lives(auth.uid());
  p := refill_daily_keys(auth.uid());

  RETURN p;
END;
$$;

-- ============================================================
-- 17. DAILY LOGIN REWARD
-- ============================================================
CREATE OR REPLACE FUNCTION claim_daily_reward()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid        UUID := auth.uid();
  p          profiles;
  today      DATE := (now() AT TIME ZONE 'UTC')::date;
  yesterday  DATE := today - 1;
  new_streak SMALLINT;
  cycle_day  SMALLINT;
  r_lives    SMALLINT := 0;
  r_keys     SMALLINT := 0;
  r_coins    INTEGER  := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO p FROM profiles WHERE id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  IF p.last_daily_claim = today THEN
    RAISE EXCEPTION 'ALREADY_CLAIMED_TODAY';
  END IF;

  -- Streak logic: consecutive day extends, otherwise restart
  IF p.last_daily_claim = yesterday THEN
    new_streak := p.daily_streak + 1;
  ELSE
    new_streak := 1;
  END IF;

  cycle_day := ((new_streak - 1) % 7) + 1;

  -- 7-day reward curve (lives / keys / coins)
  CASE cycle_day
    WHEN 1 THEN r_lives := 1;  r_keys := 0; r_coins := 50;
    WHEN 2 THEN r_lives := 0;  r_keys := 1; r_coins := 75;
    WHEN 3 THEN r_lives := 1;  r_keys := 0; r_coins := 100;
    WHEN 4 THEN r_lives := 0;  r_keys := 1; r_coins := 125;
    WHEN 5 THEN r_lives := 1;  r_keys := 0; r_coins := 150;
    WHEN 6 THEN r_lives := 1;  r_keys := 1; r_coins := 200;
    WHEN 7 THEN r_lives := 2;  r_keys := 2; r_coins := 500;   -- jackpot
    ELSE        r_lives := 1;  r_keys := 0; r_coins := 50;
  END CASE;

  UPDATE profiles
     SET daily_streak     = new_streak,
         last_daily_claim = today,
         lives            = LEAST(max_lives, lives + r_lives),
         answer_keys      = answer_keys + r_keys,
         coins            = coins + r_coins
   WHERE id = uid;

  INSERT INTO daily_reward_claims (user_id, claim_date, day_index, lives, keys, coins)
  VALUES (uid, today, cycle_day, r_lives, r_keys, r_coins)
  ON CONFLICT (user_id, claim_date) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'day_index', cycle_day,
    'streak', new_streak,
    'lives', r_lives,
    'keys', r_keys,
    'coins', r_coins
  );
END;
$$;

-- ============================================================
-- 18. STAGE UNLOCK CHECK
-- ============================================================
CREATE OR REPLACE FUNCTION get_stage_progress()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid     UUID := auth.uid();
  result  JSONB;
  total   INTEGER;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT COALESCE(SUM(stars), 0) INTO total FROM stage_progress WHERE user_id = uid;

  SELECT jsonb_agg(
           jsonb_build_object(
             'stage_id', s.id,
             'slug', s.slug,
             'title', s.title,
             'subtitle', s.subtitle,
             'emoji', s.emoji,
             'question_count', s.question_count,
             'time_per_question', s.time_per_question,
             'required_stars', s.required_stars,
             'required_stage', s.required_stage,
             'is_premium', s.is_premium,
             'reward_coins', s.reward_coins,
             'stars', COALESCE(sp.stars, 0),
             'best_score', COALESCE(sp.best_score, 0),
             'best_accuracy', COALESCE(sp.best_accuracy, 0),
             'attempts', COALESCE(sp.attempts, 0),
             'cleared', (sp.cleared_at IS NOT NULL),
             'unlocked', (
               total >= s.required_stars
               AND (s.required_stage IS NULL OR EXISTS (
                 SELECT 1 FROM stage_progress pr
                 WHERE pr.user_id = uid
                   AND pr.stage_id = s.required_stage
                   AND pr.cleared_at IS NOT NULL
               ))
             )
           ) ORDER BY s.id
         ) INTO result
  FROM stages s
  LEFT JOIN stage_progress sp ON sp.stage_id = s.id AND sp.user_id = uid;

  RETURN jsonb_build_object(
    'total_stars', total,
    'stages', COALESCE(result, '[]'::jsonb)
  );
END;
$$;

-- ============================================================
-- 19. RECORD STAGE RESULT
-- ============================================================
CREATE OR REPLACE FUNCTION record_stage_result(
  p_stage_id      SMALLINT,
  p_score         INTEGER,
  p_correct       SMALLINT,
  p_total         SMALLINT,
  p_max_streak    SMALLINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid          UUID := auth.uid();
  stg          stages;
  accuracy     SMALLINT;
  new_stars    SMALLINT := 0;
  prev_stars   SMALLINT := 0;
  coins_earned INTEGER := 0;
  is_new_best  BOOLEAN := false;
  cleared_now  BOOLEAN := false;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO stg FROM stages WHERE id = p_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stage not found'; END IF;

  accuracy := CASE WHEN p_total > 0
                   THEN ROUND((p_correct::NUMERIC / p_total) * 100)::SMALLINT
                   ELSE 0 END;

  IF accuracy >= stg.star3_percent THEN new_stars := 3;
  ELSIF accuracy >= stg.star2_percent THEN new_stars := 2;
  ELSIF accuracy >= stg.pass_percent THEN new_stars := 1;
  END IF;

  SELECT stars INTO prev_stars
    FROM stage_progress WHERE user_id = uid AND stage_id = p_stage_id;
  prev_stars := COALESCE(prev_stars, 0);

  -- First-clear coin bonus, plus a bonus for improving stars
  IF prev_stars = 0 AND new_stars > 0 THEN
    coins_earned := stg.reward_coins;
    cleared_now := true;
  ELSIF new_stars > prev_stars THEN
    coins_earned := stg.reward_coins / 2;
  END IF;

  INSERT INTO stage_progress (
    user_id, stage_id, stars, best_score, best_accuracy, attempts, cleared_at, updated_at
  ) VALUES (
    uid, p_stage_id, new_stars, p_score, accuracy, 1,
    CASE WHEN new_stars > 0 THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (user_id, stage_id) DO UPDATE SET
    stars         = GREATEST(stage_progress.stars, EXCLUDED.stars),
    best_score    = GREATEST(stage_progress.best_score, EXCLUDED.best_score),
    best_accuracy = GREATEST(stage_progress.best_accuracy, EXCLUDED.best_accuracy),
    attempts      = stage_progress.attempts + 1,
    cleared_at    = COALESCE(stage_progress.cleared_at, EXCLUDED.cleared_at),
    updated_at    = now()
  RETURNING (best_score = p_score) INTO is_new_best;

  UPDATE profiles
     SET coins          = coins + coins_earned,
         total_score    = total_score + p_score,
         stages_cleared = (SELECT COUNT(*) FROM stage_progress WHERE user_id = uid AND cleared_at IS NOT NULL),
         total_stars    = (SELECT COALESCE(SUM(stars), 0) FROM stage_progress WHERE user_id = uid)
   WHERE id = uid;

  RETURN jsonb_build_object(
    'stars', new_stars,
    'accuracy', accuracy,
    'coins_earned', coins_earned,
    'cleared', new_stars > 0,
    'cleared_now', cleared_now,
    'best_score', p_score
  );
END;
$$;

-- ============================================================
-- 20. RANKED MATCHMAKING
-- ============================================================
CREATE OR REPLACE FUNCTION find_or_create_battle()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid           UUID := auth.uid();
  my_rating     INTEGER;
  opponent      UUID;
  battle        battles;
  q_ids         UUID[];
  q_count       INTEGER;
  wait_seconds  INTEGER;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  -- Already in a live battle? Return it.
  SELECT * INTO battle FROM battles
   WHERE status IN ('waiting','countdown','active')
     AND (player_a = uid OR player_b = uid)
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('battle_id', battle.id, 'role', 'resumed');
  END IF;

  SELECT rating INTO my_rating FROM profiles WHERE id = uid;
  my_rating := COALESCE(my_rating, 1000);

  -- Sweep stale waiting rooms (players who abandoned the queue)
  UPDATE battles
     SET status = 'cancelled'
   WHERE status = 'waiting'
     AND created_at < now() - INTERVAL '90 seconds';

  -- Try to find an opponent — prefer close rating, widen with wait time
  SELECT b.id, CASE WHEN b.player_a = uid THEN b.player_b ELSE b.player_a END
    INTO battle.id, opponent
    FROM battles b
    JOIN profiles p ON p.id = CASE WHEN b.player_a = uid THEN b.player_b ELSE b.player_a END
   WHERE b.status = 'waiting'
     AND b.player_a <> uid
     AND b.player_b IS NULL
     AND b.created_at > now() - INTERVAL '90 seconds'
   ORDER BY ABS(p.rating - my_rating) ASC, b.created_at ASC
   LIMIT 1;

  IF opponent IS NOT NULL THEN
    -- Pair up
    SELECT COUNT(*) INTO q_count FROM questions;
    IF q_count < 20 THEN RAISE EXCEPTION 'Not enough questions'; END IF;

    SELECT ARRAY_AGG(id ORDER BY seed_order) INTO q_ids
      FROM (SELECT id, row_number() OVER (ORDER BY random()) AS seed_order
              FROM questions LIMIT 30) t;

    UPDATE battles
       SET player_b  = uid,
           status    = 'countdown',
           question_ids = q_ids,
           started_at = now(),
           ends_at   = now() + INTERVAL '60 seconds',
           rating_a_before = (SELECT rating FROM profiles WHERE id = player_a),
           rating_b_before = my_rating
     WHERE id = battle.id
     RETURNING * INTO battle;

    RETURN jsonb_build_object('battle_id', battle.id, 'role', 'player_b', 'matched', true);
  END IF;

  -- No opponent — open a waiting room
  SELECT COUNT(*) INTO q_count FROM questions;
  IF q_count < 20 THEN RAISE EXCEPTION 'Not enough questions'; END IF;

  SELECT ARRAY_AGG(id ORDER BY seed_order) INTO q_ids
    FROM (SELECT id, row_number() OVER (ORDER BY random()) AS seed_order
            FROM questions LIMIT 30) t;

  INSERT INTO battles (player_a, status, question_ids, rating_a_before)
  VALUES (uid, 'waiting', q_ids, my_rating)
  RETURNING * INTO battle;

  -- Bot fallback after 12 seconds of waiting keeps the mode playable
  RETURN jsonb_build_object('battle_id', battle.id, 'role', 'player_a', 'matched', false);
END;
$$;

-- Poll battle state (used by both players)
CREATE OR REPLACE FUNCTION get_battle_state(p_battle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid     UUID := auth.uid();
  b       battles;
  result  JSONB;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO b FROM battles WHERE id = p_battle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Battle not found'; END IF;
  IF b.player_a <> uid AND b.player_b <> uid THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  -- Auto-promote waiting -> countdown when the second player arrives (handled in find_or_create)
  -- Auto-finish when time is up
  IF b.status IN ('countdown','active') AND b.ends_at IS NOT NULL AND now() >= b.ends_at THEN
    UPDATE battles
       SET status = 'finished',
           finished_at = now(),
           winner = CASE WHEN score_a > score_b THEN player_a
                         WHEN score_b > score_a THEN player_b
                         ELSE NULL END,
           is_draw = (score_a = score_b)
     WHERE id = p_battle_id
     RETURNING * INTO b;
  END IF;

  IF b.status = 'countdown' THEN
    UPDATE battles SET status = 'active' WHERE id = p_battle_id AND status = 'countdown';
    b.status := 'active';
  END IF;

  RETURN jsonb_build_object(
    'battle_id', b.id,
    'status', b.status,
    'role', CASE WHEN b.player_a = uid THEN 'a' ELSE 'b' END,
    'my_score', CASE WHEN b.player_a = uid THEN b.score_a ELSE b.score_b END,
    'opp_score', CASE WHEN b.player_a = uid THEN b.score_b ELSE b.score_a END,
    'my_correct', CASE WHEN b.player_a = uid THEN b.correct_a ELSE b.correct_b END,
    'opp_correct', CASE WHEN b.player_a = uid THEN b.correct_b ELSE b.correct_a END,
    'opponent_joined', (b.player_b IS NOT NULL),
    'ends_at', b.ends_at,
    'seconds_left', GREATEST(0, EXTRACT(EPOCH FROM (b.ends_at - now()))::INTEGER),
    'winner', b.winner,
    'is_draw', b.is_draw,
    'rating_delta', CASE WHEN b.player_a = uid THEN b.rating_a_delta ELSE b.rating_b_delta END
  );
END;
$$;

-- ============================================================
-- 21. BATTLE ANSWER + RATING
-- ============================================================
CREATE OR REPLACE FUNCTION submit_battle_answer(p_battle_id UUID, p_question_id UUID, p_answer TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid          UUID := auth.uid();
  b            battles;
  q            questions;
  is_correct   BOOLEAN;
  pts          INTEGER := 0;
  already      BOOLEAN;
  my_score     INTEGER;
  my_correct   INTEGER;
  i_am_a       BOOLEAN;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO b FROM battles WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Battle not found'; END IF;
  IF b.status NOT IN ('active','countdown') THEN RAISE EXCEPTION 'BATTLE_NOT_ACTIVE'; END IF;
  IF b.ends_at IS NOT NULL AND now() >= b.ends_at THEN RAISE EXCEPTION 'BATTLE_ENDED'; END IF;

  i_am_a := (b.player_a = uid);
  IF NOT i_am_a AND b.player_b <> uid THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM battle_answers
     WHERE battle_id = p_battle_id AND user_id = uid AND question_id = p_question_id
  ) INTO already;
  IF already THEN RAISE EXCEPTION 'ALREADY_ANSWERED'; END IF;

  SELECT * INTO q FROM questions WHERE id = p_question_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found'; END IF;

  is_correct := (p_answer = q.correct_answer);
  pts := CASE WHEN is_correct THEN 100 ELSE 0 END;

  INSERT INTO battle_answers (battle_id, user_id, question_id, is_correct, points)
  VALUES (p_battle_id, uid, p_question_id, is_correct, pts);

  IF i_am_a THEN
    UPDATE battles
       SET score_a = score_a + pts, correct_a = correct_a + (CASE WHEN is_correct THEN 1 ELSE 0 END)
     WHERE id = p_battle_id
     RETURNING score_a, correct_a INTO my_score, my_correct;
  ELSE
    UPDATE battles
       SET score_b = score_b + pts, correct_b = correct_b + (CASE WHEN is_correct THEN 1 ELSE 0 END)
     WHERE id = p_battle_id
     RETURNING score_b, correct_b INTO my_score, my_correct;
  END IF;

  RETURN jsonb_build_object(
    'is_correct', is_correct,
    'correct_answer', q.correct_answer,
    'points', pts,
    'my_score', my_score,
    'my_correct', my_correct
  );
END;
$$;

-- Finalise a battle and settle ELO ratings
CREATE OR REPLACE FUNCTION finish_battle(p_battle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid          UUID := auth.uid();
  b            battles;
  expected_a   NUMERIC;
  s_a          NUMERIC;
  s_b          NUMERIC;
  delta_a      INTEGER;
  delta_b      INTEGER;
  k            INTEGER := 32;
  my_delta     INTEGER;
  my_rating    INTEGER;
  week_start   DATE := date_trunc('week', now())::date;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO b FROM battles WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Battle not found'; END IF;
  IF b.player_a <> uid AND b.player_b <> uid THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  IF b.status <> 'finished' THEN
    UPDATE battles
       SET status = 'finished',
           finished_at = now(),
           winner = CASE WHEN score_a > score_b THEN player_a
                         WHEN score_b > score_a THEN player_b
                         ELSE NULL END,
           is_draw = (score_a = score_b)
     WHERE id = p_battle_id
     RETURNING * INTO b;
  END IF;

  -- Only settle ratings once
  IF b.rating_a_delta = 0 AND b.rating_b_delta = 0 AND b.player_b IS NOT NULL THEN
    s_a := CASE WHEN b.score_a > b.score_b THEN 1
                WHEN b.score_a < b.score_b THEN 0
                ELSE 0.5 END;
    s_b := 1 - s_a;

    expected_a := 1.0 / (1.0 + POWER(10, (COALESCE(b.rating_b_before,1000) - COALESCE(b.rating_a_before,1000))::NUMERIC / 400.0));

    -- Margin-of-victory multiplier keeps stomps rewarding
    delta_a := ROUND(k * (s_a - expected_a) * (1 + LEAST(0.5, ABS(b.score_a - b.score_b)::NUMERIC / 500.0)));
    delta_b := -delta_a;

    UPDATE battles SET rating_a_delta = delta_a, rating_b_delta = delta_b WHERE id = p_battle_id;

    UPDATE profiles
       SET rating = GREATEST(100, rating + delta_a),
           ranked_wins = ranked_wins + (CASE WHEN s_a = 1 THEN 1 ELSE 0 END),
           ranked_losses = ranked_losses + (CASE WHEN s_a = 0 THEN 1 ELSE 0 END),
           ranked_draws = ranked_draws + (CASE WHEN s_a = 0.5 THEN 1 ELSE 0 END)
     WHERE id = b.player_a;

    UPDATE profiles
       SET rating = GREATEST(100, rating + delta_b),
           ranked_wins = ranked_wins + (CASE WHEN s_b = 1 THEN 1 ELSE 0 END),
           ranked_losses = ranked_losses + (CASE WHEN s_b = 0 THEN 1 ELSE 0 END),
           ranked_draws = ranked_draws + (CASE WHEN s_b = 0.5 THEN 1 ELSE 0 END)
     WHERE id = b.player_b;

    -- Weekly leaderboard accumulation
    INSERT INTO weekly_ranked (user_id, week_start, player_name, avatar_emoji, rating, points, wins, losses)
    SELECT b.player_a, week_start, p.display_name, p.avatar_emoji, p.rating,
           CASE WHEN s_a = 1 THEN 3 WHEN s_a = 0.5 THEN 1 ELSE 0 END,
           CASE WHEN s_a = 1 THEN 1 ELSE 0 END,
           CASE WHEN s_a = 0 THEN 1 ELSE 0 END
      FROM profiles p WHERE p.id = b.player_a
    ON CONFLICT (user_id, week_start) DO UPDATE SET
      points = weekly_ranked.points + EXCLUDED.points,
      wins   = weekly_ranked.wins + EXCLUDED.wins,
      losses = weekly_ranked.losses + EXCLUDED.losses,
      rating = EXCLUDED.rating,
      player_name = EXCLUDED.player_name,
      updated_at = now();

    INSERT INTO weekly_ranked (user_id, week_start, player_name, avatar_emoji, rating, points, wins, losses)
    SELECT b.player_b, week_start, p.display_name, p.avatar_emoji, p.rating,
           CASE WHEN s_b = 1 THEN 3 WHEN s_b = 0.5 THEN 1 ELSE 0 END,
           CASE WHEN s_b = 1 THEN 1 ELSE 0 END,
           CASE WHEN s_b = 0 THEN 1 ELSE 0 END
      FROM profiles p WHERE p.id = b.player_b
    ON CONFLICT (user_id, week_start) DO UPDATE SET
      points = weekly_ranked.points + EXCLUDED.points,
      wins   = weekly_ranked.wins + EXCLUDED.wins,
      losses = weekly_ranked.losses + EXCLUDED.losses,
      rating = EXCLUDED.rating,
      player_name = EXCLUDED.player_name,
      updated_at = now();
  END IF;

  SELECT * INTO b FROM battles WHERE id = p_battle_id;
  my_delta := CASE WHEN b.player_a = uid THEN b.rating_a_delta ELSE b.rating_b_delta END;
  SELECT rating INTO my_rating FROM profiles WHERE id = uid;

  RETURN jsonb_build_object(
    'my_score', CASE WHEN b.player_a = uid THEN b.score_a ELSE b.score_b END,
    'opp_score', CASE WHEN b.player_a = uid THEN b.score_b ELSE b.score_a END,
    'winner', b.winner,
    'is_draw', b.is_draw,
    'i_won', (b.winner = uid),
    'rating_delta', my_delta,
    'new_rating', my_rating
  );
END;
$$;

-- ============================================================
-- 22. PURCHASE (mock payment gateway — swap for Midtrans/Xendit)
-- ============================================================
CREATE OR REPLACE FUNCTION purchase_sku(p_sku TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid     UUID := auth.uid();
  item    shop_items;
  txn_id  UUID;
  msg     TEXT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO item FROM shop_items WHERE sku = p_sku AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'SKU_NOT_FOUND'; END IF;

  INSERT INTO transactions (user_id, sku, amount_idr, kind, quantity, provider, status)
  VALUES (uid, item.sku, item.price_idr, item.kind, item.quantity, 'mock', 'paid')
  RETURNING id INTO txn_id;

  CASE item.kind
    WHEN 'lives' THEN
      UPDATE profiles SET lives = LEAST(max_lives, lives + item.quantity) WHERE id = uid;
      msg := 'Nyawa ditambahkan!';
    WHEN 'keys' THEN
      UPDATE profiles SET answer_keys = answer_keys + item.quantity WHERE id = uid;
      msg := 'Kunci jawaban ditambahkan!';
    WHEN 'coins' THEN
      UPDATE profiles SET coins = coins + item.quantity WHERE id = uid;
      msg := 'Koin ditambahkan!';
    WHEN 'subscription' THEN
      UPDATE profiles
         SET is_premium = true,
             premium_tier = COALESCE(item.sku, 'monthly'),
             premium_until = GREATEST(COALESCE(premium_until, now()), now())
                             + (CASE WHEN item.sku LIKE '%yearly%' THEN INTERVAL '365 days'
                                     ELSE INTERVAL '30 days' END)
       WHERE id = uid;
      msg := 'Premium aktif!';
    WHEN 'no_ads' THEN
      UPDATE profiles SET is_premium = true WHERE id = uid;
      msg := 'Iklan dihapus permanen!';
    ELSE
      msg := 'Pembelian berhasil.';
  END CASE;

  RETURN jsonb_build_object('success', true, 'message', msg, 'transaction_id', txn_id);
END;
$$;

-- ============================================================
-- 23. STICKER PURCHASE (atomic: check balance, debit, grant)
-- ============================================================
CREATE OR REPLACE FUNCTION purchase_sticker(p_sticker_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid     UUID := auth.uid();
  stk     stickers;
  bal     INTEGER;
  owned   BOOLEAN;
  premium BOOLEAN;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO stk FROM stickers WHERE id = p_sticker_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SKU_NOT_FOUND'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_stickers WHERE user_id = uid AND sticker_id = p_sticker_id
  ) INTO owned;
  IF owned THEN RAISE EXCEPTION 'ALREADY_OWNED'; END IF;

  -- Premium-exclusive stickers can only be bought with an active subscription
  SELECT (is_premium AND (premium_until IS NULL OR premium_until > now()))
    INTO premium FROM profiles WHERE id = uid;
  IF stk.is_premium AND NOT COALESCE(premium, false) THEN
    RAISE EXCEPTION 'PREMIUM_REQUIRED';
  END IF;

  SELECT coins INTO bal FROM profiles WHERE id = uid FOR UPDATE;
  IF bal < stk.price_coins THEN
    RAISE EXCEPTION 'INSUFFICIENT_COINS';
  END IF;

  UPDATE profiles SET coins = coins - stk.price_coins WHERE id = uid;

  INSERT INTO user_stickers (user_id, sticker_id, source)
  VALUES (uid, p_sticker_id, 'shop');

  RETURN jsonb_build_object('success', true, 'sticker_id', p_sticker_id);
END;
$$;

-- ============================================================
-- 24. LEADERBOARDS
-- ============================================================
CREATE OR REPLACE FUNCTION get_ranked_leaderboard(p_limit INTEGER DEFAULT 50)
RETURNS SETOF weekly_ranked
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM weekly_ranked
   WHERE week_start = date_trunc('week', now())::date
   ORDER BY points DESC, rating DESC
   LIMIT p_limit;
$$;

-- ============================================================
-- 25. SEED THE 10 STAGES + SHOP + STICKERS
-- ============================================================
INSERT INTO stages (id, slug, title, subtitle, emoji, question_count, time_per_question,
                    pass_percent, star2_percent, star3_percent, required_stars, required_stage,
                    category_filter, is_premium, reward_coins)
VALUES
  (1,  'pemanasan',      'Pemanasan',       'Kenalan dulu sama stiker jomok',        '🌱', 10, 25, 50, 70, 90,  0,  NULL, NULL,                    false, 100),
  (2,  'kenal-jomok',    'Kenal Jomok',     'Masih santai, santai aja',              '👋', 10, 22, 50, 70, 90,  2,  1,    ARRAY['jomok'],          false, 150),
  (3,  'dunia-suki',     'Dunia Suki',      'Masuk ke dunia para suki',              '🌀', 10, 20, 60, 75, 90,  4,  2,    ARRAY['suki'],           false, 200),
  (4,  'campuran',       'Campuran Gokil',  'Semua kategori jadi satu',              '🎲', 10, 18, 60, 75, 90,  6,  3,    NULL,                    false, 250),
  (5,  'terburu-buru',   'Terburu-buru',    'Waktu makin sempit!',                   '⏱️', 10, 15, 60, 80, 95,  8,  4,    NULL,                    false, 300),
  (6,  'sigma-mode',     'Sigma Mode',      'Cuma sigma sejati yang bisa lewat',     '😎', 10, 14, 70, 80, 95,  10, 5,    ARRAY['suki'],           false, 400),
  (7,  'jomok-ekstrem',  'Jomok Ekstrem',   'Stiker jomok paling gila',              '🔥', 10, 12, 70, 85, 100, 12, 6,    ARRAY['jomok'],          false, 500),
  (8,  'kilat',          'Kilat',           'Refleksmu diuji di sini',               '⚡', 10, 10, 70, 85, 100, 14, 7,    NULL,                    false, 600),
  (9,  'tanpa-ampun',    'Tanpa Ampun',     'Hampir mustahil. Hampir.',              '💀', 10, 9,  80, 90, 100, 16, 8,    NULL,                    true,  800),
  (10, 'legenda-jomok',  'Legenda Jomok',   'Jadi legenda atau pulang',              '👑', 10, 8,  80, 90, 100, 18, 9,    NULL,                    true,  1500)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, emoji = EXCLUDED.emoji,
  time_per_question = EXCLUDED.time_per_question, required_stars = EXCLUDED.required_stars,
  required_stage = EXCLUDED.required_stage, category_filter = EXCLUDED.category_filter,
  is_premium = EXCLUDED.is_premium, reward_coins = EXCLUDED.reward_coins;

INSERT INTO shop_items (sku, title, description, kind, price_idr, quantity, badge, sort_order)
VALUES
  ('lives_5',        'Refill Nyawa',        '+5 nyawa, main langsung tanpa nunggu',  'lives',        10000, 5,  NULL,      1),
  ('lives_10',       'Paket Nyawa Jumbo',   '+10 nyawa, lebih hemat',                'lives',        18000, 10, 'Hemat',   2),
  ('keys_5',         'Tambah 5 Kunci',      '+5 kunci jawaban',                      'keys',         20000, 5,  NULL,      3),
  ('keys_15',        'Paket Kunci Kolektor','+15 kunci jawaban, jauh lebih hemat',   'keys',         50000, 15, 'Populer', 4),
  ('premium_monthly','Premium Bulanan',     'Bebas iklan + stiker & soal eksklusif', 'subscription', 29000, 1,  'Populer', 5),
  ('premium_yearly', 'Premium Tahunan',     'Semua benefit premium, hemat 43%',      'subscription', 199000, 1, 'Hemat 43%', 6),
  ('no_ads',         'Hapus Iklan',         'Bermain tanpa gangguan iklan',          'no_ads',       15000, 1,  NULL,      7),
  ('coins_1000',     '1000 Koin',           'Buat beli stiker langka di toko',       'coins',        20000, 1000, NULL,    8)
ON CONFLICT (sku) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description, kind = EXCLUDED.kind,
  price_idr = EXCLUDED.price_idr, quantity = EXCLUDED.quantity,
  badge = EXCLUDED.badge, sort_order = EXCLUDED.sort_order;

INSERT INTO stickers (id, name, emoji, rarity, price_coins, price_idr, is_premium, sort_order)
VALUES
  ('hai',        'Hai',          '👋', 'common',    0,     0,      false, 1),
  ('lucu',       'Dikira Lucu',  '😐', 'common',    0,     0,      false, 2),
  ('terluka',    'Tertawa Terluka', '😂', 'common', 0,     0,      false, 3),
  ('sibuk',      'Sedang Sibuk', '😴', 'common',    0,     0,      false, 4),
  ('jempol',     'Jempol',       '👍', 'common',    150,   0,      false, 5),
  ('api',        'Lagi Panas',   '🔥', 'rare',      500,   0,      false, 6),
  ('sigma',      'Sigma',        '😎', 'rare',      750,   0,      false, 7),
  ('nangis',     'Nangis',       '😭', 'rare',      800,   0,      false, 8),
  ('nyocot',     'Halah Nyocot', '🤐', 'epic',      1500,  0,      false, 9),
  ('polisi',     'Bilangin Polisi', '🚓', 'epic',   2000,  0,      false, 10),
  ('mahkota',    'Raja Jomok',   '👑', 'legendary', 5000,  0,      false, 11),
  ('premium1',   'Premium Flex', '💎', 'legendary', 0,     0,      true,  12),
  ('premium2',   'Crown Sigma',  '🦁', 'legendary', 0,     0,      true,  13),
  ('premium3',   'AmbaTron',     '🤖', 'epic',      0,     0,      true,  14)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, emoji = EXCLUDED.emoji, rarity = EXCLUDED.rarity,
  price_coins = EXCLUDED.price_coins, is_premium = EXCLUDED.is_premium;

-- ============================================================
-- 26. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_progress      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE battles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_answers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE taunt_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stickers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stickers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_ranked       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reward_claims ENABLE ROW LEVEL SECURITY;

-- profiles: everyone can read the public board fields, only owner writes
DROP POLICY IF EXISTS "Profiles are publicly readable" ON profiles;
CREATE POLICY "Profiles are publicly readable" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users insert own profile" ON profiles;
CREATE POLICY "Users insert own profile" ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- stages: public read
DROP POLICY IF EXISTS "Stages are publicly readable" ON stages;
CREATE POLICY "Stages are publicly readable" ON stages FOR SELECT USING (true);

-- stage_progress: owner read/write, public read for rank context
DROP POLICY IF EXISTS "Stage progress is publicly readable" ON stage_progress;
CREATE POLICY "Stage progress is publicly readable" ON stage_progress FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users manage own stage progress" ON stage_progress;
CREATE POLICY "Users manage own stage progress" ON stage_progress FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- stage_runs: owner only
DROP POLICY IF EXISTS "Users manage own runs" ON stage_runs;
CREATE POLICY "Users manage own runs" ON stage_runs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- battles: participants only
DROP POLICY IF EXISTS "Players see own battles" ON battles;
CREATE POLICY "Players see own battles" ON battles FOR SELECT
  USING (auth.uid() = player_a OR auth.uid() = player_b);
DROP POLICY IF EXISTS "Players create battles" ON battles;
CREATE POLICY "Players create battles" ON battles FOR INSERT
  WITH CHECK (auth.uid() = player_a);
DROP POLICY IF EXISTS "Players update own battles" ON battles;
CREATE POLICY "Players update own battles" ON battles FOR UPDATE
  USING (auth.uid() = player_a OR auth.uid() = player_b);

-- battle_answers: participants
DROP POLICY IF EXISTS "See battle answers" ON battle_answers;
CREATE POLICY "See battle answers" ON battle_answers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM battles b
     WHERE b.id = battle_answers.battle_id
       AND (b.player_a = auth.uid() OR b.player_b = auth.uid())
  ));

-- taunts: participants read, sender writes
DROP POLICY IF EXISTS "See battle taunts" ON taunt_messages;
CREATE POLICY "See battle taunts" ON taunt_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM battles b
     WHERE b.id = taunt_messages.battle_id
       AND (b.player_a = auth.uid() OR b.player_b = auth.uid())
  ));
DROP POLICY IF EXISTS "Send battle taunts" ON taunt_messages;
CREATE POLICY "Send battle taunts" ON taunt_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM battles b
     WHERE b.id = taunt_messages.battle_id
       AND (b.player_a = auth.uid() OR b.player_b = auth.uid())
  ));

-- stickers catalogue: public read
DROP POLICY IF EXISTS "Stickers are publicly readable" ON stickers;
CREATE POLICY "Stickers are publicly readable" ON stickers FOR SELECT USING (true);

DROP POLICY IF EXISTS "See own stickers" ON user_stickers;
CREATE POLICY "See own stickers" ON user_stickers FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Buy own stickers" ON user_stickers;
CREATE POLICY "Buy own stickers" ON user_stickers FOR INSERT WITH CHECK (auth.uid() = user_id);

-- weekly ranked: public read
DROP POLICY IF EXISTS "Weekly ranked is publicly readable" ON weekly_ranked;
CREATE POLICY "Weekly ranked is publicly readable" ON weekly_ranked FOR SELECT USING (true);

-- transactions: owner read only (writes go via SECURITY DEFINER RPC)
DROP POLICY IF EXISTS "See own transactions" ON transactions;
CREATE POLICY "See own transactions" ON transactions FOR SELECT USING (auth.uid() = user_id);

-- shop items: public read
DROP POLICY IF EXISTS "Shop items are publicly readable" ON shop_items;
CREATE POLICY "Shop items are publicly readable" ON shop_items FOR SELECT USING (true);

-- daily claims: owner read
DROP POLICY IF EXISTS "See own daily claims" ON daily_reward_claims;
CREATE POLICY "See own daily claims" ON daily_reward_claims FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- 27. REALTIME
-- ============================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE battles;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE taunt_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE battle_answers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Full row payloads so realtime clients get every column
ALTER TABLE battles          REPLICA IDENTITY FULL;
ALTER TABLE taunt_messages   REPLICA IDENTITY FULL;
ALTER TABLE battle_answers   REPLICA IDENTITY FULL;

-- ============================================================
-- 28. AUTO-CREATE PROFILES FOR LEGACY USERS
-- ============================================================
INSERT INTO profiles (id, display_name, avatar_emoji)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1), 'Pemain'),
       '😎'
  FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id);

INSERT INTO user_stickers (user_id, sticker_id, source)
SELECT p.id, s.id, 'starter'
  FROM profiles p
  CROSS JOIN stickers s
 WHERE s.is_premium = false AND s.price_coins = 0
ON CONFLICT DO NOTHING;


-- #####################################################################
-- ## MEKANIK TEBAK TEKS — kolom blank_image_url + RPC check_guess_answer
-- ## sumber: supabase/migrations/20260925000002_guess_text_mode.sql
-- #####################################################################

-- ============================================================================
-- TeSiMok v2.1 — Mekanik "Tebak Teks Stiker"
--
-- Menambahkan kolom `blank_image_url` ke tabel questions.
--
-- Latar belakang mekanik:
--   v2 lama  : gambar stiker di-crop 1/4, pemain menebak GAMBAR apa itu.
--   v2.1 baru: pemain melihat stiker UTUH tapi caption-nya sudah dihapus,
--              lalu menebak TEKS apa yang seharusnya ada di stiker itu.
--              Kalau benar, teks jawaban muncul di posisi caption.
--
-- Kenapa kolom terpisah, bukan menimpa fragment_url?
--   Karena mode lama tetap bisa dipakai sebagai fallback / mode latihan,
--   dan soal yang asetnya belum dibuat tidak jadi rusak — kolom ini
--   nullable dan kode memilih blank_image_url ?? fragment_url.
--
-- Jalankan setelah: schema.sql, seed-questions.sql, dan
-- migrations/20260925000001_v2_game_system.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Kolom baru
-- ---------------------------------------------------------------------------
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS blank_image_url TEXT;

COMMENT ON COLUMN public.questions.blank_image_url IS
  'Versi stiker tanpa caption. Dipakai sebagai soal mode "tebak teks stiker". '
  'NULL = aset belum tersedia; klien harus jatuh ke fragment_url.';

-- Semua soal harus punya teks jawaban untuk ditebak; ini sudah dijamin oleh
-- schema lama, tapi kita tambahkan index karena kolomnya ikut di-SELECT.
CREATE INDEX IF NOT EXISTS idx_questions_has_blank
  ON public.questions ((blank_image_url IS NOT NULL));

-- ---------------------------------------------------------------------------
-- 2. View bantu: soal siap-main untuk mekanik baru
-- ---------------------------------------------------------------------------
-- Klien hanya butuh id + gambar + opsi. correct_answer TIDAK boleh bocor
-- sebelum pemain menjawab, jadi view ini sengaja tidak menyertakannya.
-- Validasi jawaban dilakukan lewat RPC di bawah.
CREATE OR REPLACE VIEW public.v_questions_guessable AS
SELECT
  q.id,
  COALESCE(q.blank_image_url, q.fragment_url) AS image_url,
  q.fragment_url                              AS fallback_image_url,
  q.options,
  q.category,
  (q.blank_image_url IS NOT NULL)             AS has_blank_asset
FROM public.questions q;

COMMENT ON VIEW public.v_questions_guessable IS
  'Soal untuk mode tebak-teks. Tidak menyertakan correct_answer agar tidak '
  'bisa dibaca langsung dari klien.';

-- View publik untuk user terautentikasi & anon (soal bukan rahasia dagang,
-- tapi jawabannya harus tetap lewat RPC).
GRANT SELECT ON public.v_questions_guessable TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC: periksa jawaban tebak-teks (server-authoritative)
-- ---------------------------------------------------------------------------
-- Mengapa perlu RPC? Kalau klien hanya membandingkan string dari data yang
-- ia sudah punya, maka correct_answer harus dikirim ke browser dan pemain
-- bisa melihatnya lewat DevTools. RPC ini membuat perbandingan di server.
CREATE OR REPLACE FUNCTION public.check_guess_answer(
  p_question_id UUID,
  p_answer      TEXT
)
RETURNS TABLE (
  is_correct      BOOLEAN,
  correct_answer  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_correct TEXT;
  v_norm_given TEXT;
  v_norm_correct TEXT;
BEGIN
  SELECT q.correct_answer INTO v_correct
  FROM public.questions q
  WHERE q.id = p_question_id;

  IF v_correct IS NULL THEN
    RAISE EXCEPTION 'QUESTION_NOT_FOUND';
  END IF;

  -- Normalisasi ringan: tanpa spasi berlebih, case-insensitive, dan emoji
  -- diabaikan supaya variasi kecil tidak menghukum pemain.
  v_norm_given := lower(btrim(regexp_replace(COALESCE(p_answer, ''), '\s+', ' ', 'g')));
  v_norm_correct := lower(btrim(regexp_replace(v_correct, '\s+', ' ', 'g')));

  RETURN QUERY
  SELECT v_norm_given = v_norm_correct, v_correct;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_guess_answer(UUID, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Catat jawaban (opsional, untuk statistik soal tersulit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.question_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id  UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  is_correct   BOOLEAN NOT NULL,
  mode         TEXT NOT NULL DEFAULT 'stage'
                CHECK (mode IN ('stage', 'battle')),
  answered_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_attempts_question
  ON public.question_attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_question_attempts_user
  ON public.question_attempts(user_id, answered_at DESC);

ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own attempts" ON public.question_attempts;
CREATE POLICY "Users insert own attempts"
  ON public.question_attempts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own attempts" ON public.question_attempts;
CREATE POLICY "Users read own attempts"
  ON public.question_attempts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. Laporan soal tersulit (dipakai untuk kalibrasi difficulty)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_hardest_questions(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  question_id   UUID,
  fragment_url  TEXT,
  correct_answer TEXT,
  attempts      BIGINT,
  accuracy      NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    q.id,
    q.fragment_url,
    q.correct_answer,
    COUNT(a.id) AS attempts,
    CASE WHEN COUNT(a.id) = 0 THEN NULL
         ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE a.is_correct) / COUNT(a.id), 1)
    END AS accuracy
  FROM public.questions q
  LEFT JOIN public.question_attempts a ON a.question_id = q.id
  GROUP BY q.id, q.fragment_url, q.correct_answer
  HAVING COUNT(a.id) > 0
  ORDER BY accuracy ASC NULLS LAST, attempts DESC
  LIMIT p_limit;
$$;

-- Laporan ini hanya untuk admin/kalibrasi; jangan beri ke klien biasa.
REVOKE ALL ON FUNCTION public.get_hardest_questions(INTEGER) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- Selesai. Setelah ini jalankan supabase/seed-blank-images.sql untuk
-- mengisi blank_image_url dari aset yang sudah digenerate script.
-- ============================================================================


-- #####################################################################
-- ## HUBUNGKAN GAMBAR TANPA TEKS KE SOAL
-- ## sumber: supabase/seed-blank-images.sql
-- #####################################################################

-- Auto-generated by scripts/make-blank-questions.js
-- Kolom blank_image_url menyimpan versi stiker TANPA caption,
-- dipakai sebagai soal mekanik "tebak teks stiker".
-- Jalankan setelah migration v2 (kolom blank_image_url sudah ada).

UPDATE questions SET blank_image_url = v.blank_url
FROM (VALUES
  ('/fragments/frag_jomok1.webp', '/fragments-blank/jomok1.webp'),
  ('/fragments/frag_jomok2.webp', '/fragments-blank/jomok2.webp'),
  ('/fragments/frag_jomok3.webp', '/fragments-blank/jomok3.webp'),
  ('/fragments/frag_jomok4.webp', '/fragments-blank/jomok4.webp'),
  ('/fragments/frag_jomok5.webp', '/fragments-blank/jomok5.webp'),
  ('/fragments/frag_jomok6.webp', '/fragments-blank/jomok6.webp'),
  ('/fragments/frag_jomok7.webp', '/fragments-blank/jomok7.webp'),
  ('/fragments/frag_jomok8.webp', '/fragments-blank/jomok8.webp'),
  ('/fragments/frag_jomok9.webp', '/fragments-blank/jomok9.webp'),
  ('/fragments/frag_jomok10.webp', '/fragments-blank/jomok10.webp'),
  ('/fragments/frag_jomok11.webp', '/fragments-blank/jomok11.webp'),
  ('/fragments/frag_jomok12.webp', '/fragments-blank/jomok12.webp'),
  ('/fragments/frag_jomok13.webp', '/fragments-blank/jomok13.webp'),
  ('/fragments/frag_jomok14.webp', '/fragments-blank/jomok14.webp'),
  ('/fragments/frag_jomok15.webp', '/fragments-blank/jomok15.webp'),
  ('/fragments/frag_jomok16.webp', '/fragments-blank/jomok16.webp'),
  ('/fragments/frag_jomok17.webp', '/fragments-blank/jomok17.webp'),
  ('/fragments/frag_jomok18.webp', '/fragments-blank/jomok18.webp'),
  ('/fragments/frag_jomok19.webp', '/fragments-blank/jomok19.webp'),
  ('/fragments/frag_jomok21.webp', '/fragments-blank/jomok21.webp'),
  ('/fragments/frag_jomok22.webp', '/fragments-blank/jomok22.webp'),
  ('/fragments/frag_jomok23.webp', '/fragments-blank/jomok23.webp'),
  ('/fragments/frag_jomok24.webp', '/fragments-blank/jomok24.webp'),
  ('/fragments/frag_jomok25.webp', '/fragments-blank/jomok25.webp'),
  ('/fragments/frag_jomok26.webp', '/fragments-blank/jomok26.webp'),
  ('/fragments/frag_jomok27.webp', '/fragments-blank/jomok27.webp'),
  ('/fragments/frag_jomok28.webp', '/fragments-blank/jomok28.webp'),
  ('/fragments/frag_jomok29.webp', '/fragments-blank/jomok29.webp'),
  ('/fragments/frag_jomok30.webp', '/fragments-blank/jomok30.webp'),
  ('/fragments/frag_jomok32.webp', '/fragments-blank/jomok32.webp'),
  ('/fragments/frag_jomok33.webp', '/fragments-blank/jomok33.webp'),
  ('/fragments/frag_jomok34.webp', '/fragments-blank/jomok34.webp')
) AS v(fragment_url, blank_url)
WHERE questions.fragment_url = v.fragment_url;

-- Soal yang belum punya gambar blank akan jatuh ke fragment_url,
-- jadi game tetap bisa dimainkan walau sebagian aset belum siap.
