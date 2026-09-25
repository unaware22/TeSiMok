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
