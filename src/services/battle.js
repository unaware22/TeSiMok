/**
 * services/battle.js
 * Ranked battle: matchmaking, realtime score sync, taunts, and settlement.
 *
 * Data flow
 *  1. `joinQueue()`    -> creates or joins a battle row (server RPC)
 *  2. `watchBattle()`  -> realtime subscription on `battles` + `taunt_messages`
 *  3. `submitAnswer()` -> server-validated answer, returns updated score
 *  4. `settle()`       -> finalises ratings
 */
import { supabase, rpc } from './supabase.js';
import { fetchProfilesMap } from './profile.js';
import { normaliseQuestion } from './stages.js';
import { BATTLE_POINTS_PER_CORRECT, BATTLE_STREAK_BONUS } from '../config/game.js';

// ============================================================
// Matchmaking
// ============================================================

/**
 * Enter the ranked queue. Returns { battleId, role, matched }.
 * Calling this twice while searching returns the same room.
 */
export async function joinQueue() {
  const data = await rpc('find_or_create_battle');
  return {
    battleId: data.battle_id,
    role: data.role,
    matched: Boolean(data.matched),
  };
}

export async function getBattleState(battleId) {
  return rpc('get_battle_state', { p_battle_id: battleId });
}

/** Leave the queue by cancelling an unmatched waiting room. */
export async function cancelQueue(battleId) {
  const { error } = await supabase
    .from('battles')
    .update({ status: 'cancelled' })
    .eq('id', battleId)
    .eq('status', 'waiting');

  if (error) throw new Error(error.message);
}

// ============================================================
// Battleplay
// ============================================================

/** Load the shared question list for a battle (identical for both players). */
export async function fetchBattleQuestions(battleId) {
  const { data: battle, error } = await supabase
    .from('battles')
    .select('question_ids')
    .eq('id', battleId)
    .single();

  if (error) throw new Error(error.message);

  const ids = battle?.question_ids || [];
  if (ids.length === 0) return [];

  const { data: questions, error: qError } = await supabase
    .from('questions')
    .select('id, fragment_url, blank_image_url, correct_answer, options, category')
    .in('id', ids);

  if (qError) throw new Error(qError.message);

  // Preserve the battle's canonical order.
  //
  // `imageUrl` mengikuti mekanik v2.1 (stiker tanpa caption). Kalau aset blank
  // belum ada, kita jatuh ke fragment_url supaya pertandingan tidak batal.
  const byId = Object.fromEntries(
    (questions || []).map((q) => [
      q.id,
      normaliseQuestion(q, questions),
    ]),
  );
  return ids.map((id) => byId[id]).filter(Boolean);
}

/**
 * Submit an answer. The server re-validates and returns the running score.
 */
export async function submitBattleAnswer(battleId, questionId, answer) {
  return rpc('submit_battle_answer', {
    p_battle_id: battleId,
    p_question_id: questionId,
    p_answer: answer,
  });
}

/** Finalise and settle ratings. Safe to call from either client. */
export async function settleBattle(battleId) {
  return rpc('finish_battle', { p_battle_id: battleId });
}

/** Which questions has this player already answered in this battle? */
export async function fetchMyAnsweredIds(battleId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('battle_answers')
    .select('question_id, is_correct')
    .eq('battle_id', battleId)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  return (data || []).map((r) => r.question_id);
}

// ============================================================
// Taunts
// ============================================================

export async function sendTaunt(battleId, sticker) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Kamu harus masuk terlebih dahulu.');

  const { error } = await supabase
    .from('taunt_messages')
    .insert({ battle_id: battleId, sender_id: user.id, sticker });

  if (error) throw new Error(error.message);
}

// ============================================================
// Realtime watcher
// ============================================================

/**
 * Subscribe to a battle.
 * @param {string} battleId
 * @param {object} handlers - { onBattle(row), onTaunt(row), onStatus(status) }
 * @returns {() => void} unsubscribe
 */
export function watchBattle(battleId, handlers = {}) {
  const channelName = `battle:${battleId}`;

  const channel = supabase
    .channel(channelName, {
      config: { broadcast: { self: false } },
    })
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'battles', filter: `id=eq.${battleId}` },
      (payload) => handlers.onBattle?.(payload.new),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'taunt_messages', filter: `battle_id=eq.${battleId}` },
      (payload) => handlers.onTaunt?.(payload.new),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'battle_answers', filter: `battle_id=eq.${battleId}` },
      (payload) => handlers.onAnswer?.(payload.new),
    )
    .subscribe((status) => handlers.onStatus?.(status));

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Watch the matchmaking queue for this player: resolves when an opponent joins.
 * @returns {() => void} unsubscribe
 */
export function watchMatchmaking(battleId, onMatched) {
  const channel = supabase
    .channel(`match:${battleId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'battles', filter: `id=eq.${battleId}` },
      (payload) => {
        const row = payload.new;
        if (row?.player_b && row.status !== 'waiting') {
          onMatched?.(row);
        }
      },
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ============================================================
// Opponent info
// ============================================================

export async function fetchOpponent(battleId, myUserId) {
  const { data, error } = await supabase
    .from('battles')
    .select('player_a, player_b')
    .eq('id', battleId)
    .single();

  if (error) throw new Error(error.message);

  const opponentId = data.player_a === myUserId ? data.player_b : data.player_a;
  if (!opponentId) return null;

  const map = await fetchProfilesMap([opponentId]);
  return map[opponentId] || { id: opponentId, display_name: 'Lawan', avatar_emoji: '🎭' };
}

// ============================================================
// Local scoring preview (mirrors the server's battle scoring)
// ============================================================

export function battlePoints(isCorrect, streak) {
  if (!isCorrect) return 0;
  return BATTLE_POINTS_PER_CORRECT + Math.max(0, streak - 1) * BATTLE_STREAK_BONUS;
}
