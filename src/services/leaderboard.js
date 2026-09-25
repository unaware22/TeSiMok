/**
 * services/leaderboard.js
 * Tournament (weekly ranked) and Global (all-time score) boards.
 */
import { supabase, rpc } from './supabase.js';
import { DEFAULT_LEADERBOARD } from './fallback-data.js';

// ============================================================
// Weekly ranked / tournament board
// ============================================================

export async function fetchTournamentBoard(limit = 50) {
  try {
    const data = await Promise.race([
      rpc('get_ranked_leaderboard', { p_limit: limit }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);

    if (data && data.length > 0) {
      const userIds = data.map((r) => r.user_id).filter(Boolean);
      let profilesMap = {};
      if (userIds.length > 0) {
        try {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_emoji, rating, is_premium')
            .in('id', userIds);
          if (profs) {
            profilesMap = Object.fromEntries(profs.map((p) => [p.id, p]));
          }
        } catch {}
      }

      return data.map((row) => {
        const p = profilesMap[row.user_id] || {};
        return {
          userId: row.user_id,
          name: p.display_name || row.player_name || 'Pemain Ranked',
          avatar: p.avatar_emoji || row.avatar_emoji || '😎',
          score: row.points ?? 0,
          rating: row.rating ?? p.rating ?? 1000,
          wins: row.wins ?? 0,
          losses: row.losses ?? 0,
          isPremium: Boolean(p.is_premium),
        };
      });
    }
  } catch (err) {
    console.warn('[leaderboard] get_ranked_leaderboard failed or timed out:', err.message);
  }

  return DEFAULT_LEADERBOARD.slice(0, limit);
}

/** Seconds remaining until the weekly board resets. */
export function secondsUntilWeeklyReset() {
  const now = new Date();
  const day = now.getUTCDay();               // 0 = Sunday
  const daysUntilMonday = (8 - day) % 7 || 7;
  const nextMonday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilMonday,
  ));
  return Math.max(0, (nextMonday.getTime() - now.getTime()) / 1000);
}

// ============================================================
// Global all-time board
// ============================================================

export async function fetchGlobalBoard(limit = 50) {
  try {
    const res = await Promise.race([
      supabase
        .from('profiles')
        .select('id, display_name, avatar_emoji, total_score, total_stars, rating, is_premium')
        .order('total_score', { ascending: false })
        .order('total_stars', { ascending: false })
        .limit(limit),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);

    if (!res.error && res.data && res.data.length > 0) {
      return res.data.map((row) => ({
        userId: row.id,
        name: row.display_name || 'Pemain',
        avatar: row.avatar_emoji || '😎',
        score: row.total_score ?? 0,
        rating: row.rating ?? 1000,
        stars: row.total_stars ?? 0,
        isPremium: Boolean(row.is_premium),
      }));
    }
  } catch (err) {
    console.warn('[leaderboard] fetchGlobalBoard failed or timed out:', err.message);
  }

  return DEFAULT_LEADERBOARD.slice(0, limit);
}

// ============================================================
// Stage board (best stars on a specific stage)
// ============================================================

export async function fetchStageBoard(stageId, limit = 20) {
  const { data, error } = await supabase
    .from('stage_progress')
    .select('user_id, stars, best_score, best_accuracy')
    .eq('stage_id', stageId)
    .order('stars', { ascending: false })
    .order('best_score', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  const ids = data.map((r) => r.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_emoji, is_premium')
    .in('id', ids);

  const byId = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

  return data.map((row) => {
    const p = byId[row.user_id] || {};
    return {
      userId: row.user_id,
      name: p.display_name || 'Pemain',
      avatar: p.avatar_emoji || '😎',
      stars: row.stars ?? 0,
      score: row.best_score ?? 0,
      accuracy: row.best_accuracy ?? 0,
      isPremium: Boolean(p.is_premium),
    };
  });
}

// ============================================================
// My rank
// ============================================================

export async function fetchMyRank(userId, board = 'tournament') {
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return { rank: 1, points: 12450, rating: 1200 };
  }

  if (board === 'tournament') {
    const weekStart = mondayOfThisWeek();
    const { data, error } = await supabase
      .from('weekly_ranked')
      .select('points, rating')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .maybeSingle();

    if (error) return { rank: 1, points: 12450, rating: 1200 };
    if (!data) return { rank: 1, points: 12450, rating: 1200 };

    const { count } = await supabase
      .from('weekly_ranked')
      .select('id', { count: 'exact', head: true })
      .eq('week_start', weekStart)
      .gt('points', data.points);

    return { rank: (count ?? 0) + 1, points: data.points, rating: data.rating };
  }

  // Global
  const { data: me } = await supabase
    .from('profiles')
    .select('total_score')
    .eq('id', userId)
    .maybeSingle();

  if (!me) return { rank: 1, points: 12450 };

  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gt('total_score', me.total_score);

  return { rank: (count ?? 0) + 1, points: me.total_score };
}

export function mondayOfThisWeek() {
  const now = new Date();
  const dow = now.getUTCDay();
  const diff = (dow + 6) % 7;                  // days since Monday
  const monday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - diff,
  ));
  return monday.toISOString().slice(0, 10);
}
