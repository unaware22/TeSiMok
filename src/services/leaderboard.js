/**
 * services/leaderboard.js
 * Tournament (weekly ranked battle) and Global (stage adventure) boards.
 */
import { supabase, rpc } from './supabase.js';
import {
  DEFAULT_LEADERBOARD_TOURNAMENT,
  DEFAULT_LEADERBOARD_GLOBAL,
  DEFAULT_LEADERBOARD,
} from './fallback-data.js';
import { getState } from '../state/store.js';

// ============================================================
// Weekly ranked / tournament board
// ============================================================

export async function fetchTournamentBoard(limit = 50) {
  let list = [];

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

      list = data.map((row) => {
        const p = profilesMap[row.user_id] || {};
        return {
          userId: row.user_id,
          name: p.display_name || row.player_name || 'Pemain Ranked',
          avatar: p.avatar_emoji || row.avatar_emoji || '😎',
          score: row.points ?? 0,
          battle_score: row.points ?? 0,
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

  if (list.length === 0) {
    list = [...DEFAULT_LEADERBOARD_TOURNAMENT];
  }

  // Inject current player if available
  const { profile } = getState();
  if (profile) {
    const myId = profile.id;
    const existingIdx = list.findIndex((e) => e.userId === myId);
    const myEntry = {
      userId: myId,
      name: profile.display_name || 'Kamu',
      avatar: profile.avatar_emoji || '😎',
      rating: profile.rating ?? 1000,
      battle_score: profile.battle_score ?? 0,
      score: profile.battle_score ?? 0,
      wins: profile.ranked_wins ?? 0,
      losses: profile.ranked_losses ?? 0,
      isPremium: Boolean(profile.is_premium_active),
      isMe: true,
    };

    if (existingIdx >= 0) {
      list[existingIdx] = myEntry;
    } else {
      list.push(myEntry);
    }
  }

  // Sort by rating DESC, then wins DESC, then battle_score DESC
  list.sort((a, b) => {
    if ((b.rating ?? 1000) !== (a.rating ?? 1000)) {
      return (b.rating ?? 1000) - (a.rating ?? 1000);
    }
    if ((b.wins ?? 0) !== (a.wins ?? 0)) {
      return (b.wins ?? 0) - (a.wins ?? 0);
    }
    return (b.battle_score ?? b.score ?? 0) - (a.battle_score ?? a.score ?? 0);
  });

  return list.slice(0, limit);
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
// Global stage adventure board
// ============================================================

export async function fetchGlobalBoard(limit = 50) {
  let list = [];

  try {
    const res = await Promise.race([
      supabase
        .from('profiles')
        .select('id, display_name, avatar_emoji, total_score, total_stars, stages_cleared, rating, is_premium')
        .order('total_score', { ascending: false })
        .order('total_stars', { ascending: false })
        .limit(limit),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);

    if (!res.error && res.data && res.data.length > 0) {
      list = res.data.map((row) => ({
        userId: row.id,
        name: row.display_name || 'Pemain',
        avatar: row.avatar_emoji || '😎',
        stage_score: row.stage_score ?? row.total_score ?? 0,
        score: row.stage_score ?? row.total_score ?? 0,
        rating: row.rating ?? 1000,
        stars: row.total_stars ?? 0,
        stages_cleared: row.stages_cleared ?? 0,
        isPremium: Boolean(row.is_premium),
      }));
    }
  } catch (err) {
    console.warn('[leaderboard] fetchGlobalBoard failed or timed out:', err.message);
  }

  if (list.length === 0) {
    list = [...DEFAULT_LEADERBOARD_GLOBAL];
  }

  // Inject current player if available
  const { profile } = getState();
  if (profile) {
    const myId = profile.id;
    const existingIdx = list.findIndex((e) => e.userId === myId);
    const myEntry = {
      userId: myId,
      name: profile.display_name || 'Kamu',
      avatar: profile.avatar_emoji || '😎',
      stage_score: profile.stage_score ?? profile.total_score ?? 0,
      score: profile.stage_score ?? profile.total_score ?? 0,
      stars: profile.total_stars ?? 0,
      stages_cleared: profile.stages_cleared ?? 0,
      rating: profile.rating ?? 1000,
      isPremium: Boolean(profile.is_premium_active),
      isMe: true,
    };

    if (existingIdx >= 0) {
      list[existingIdx] = myEntry;
    } else {
      list.push(myEntry);
    }
  }

  // Sort by stage_score DESC, then stars DESC, then stages_cleared DESC
  list.sort((a, b) => {
    const scoreA = a.stage_score ?? a.score ?? 0;
    const scoreB = b.stage_score ?? b.score ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    if ((b.stars ?? 0) !== (a.stars ?? 0)) return (b.stars ?? 0) - (a.stars ?? 0);
    return (b.stages_cleared ?? 0) - (a.stages_cleared ?? 0);
  });

  return list.slice(0, limit);
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

export async function fetchMyRank(userId, board = 'tournament', existingList = null) {
  const { profile } = getState();

  const list = existingList && existingList.length > 0
    ? existingList
    : (board === 'tournament' ? await fetchTournamentBoard(50) : await fetchGlobalBoard(50));

  const myIdx = list.findIndex((e) => e.userId === userId || e.isMe);
  const rank = myIdx >= 0 ? myIdx + 1 : list.length + 1;

  if (board === 'tournament') {
    return {
      rank,
      points: profile?.battle_score ?? 0,
      battle_score: profile?.battle_score ?? 0,
      rating: profile?.rating ?? 1000,
      wins: profile?.ranked_wins ?? 0,
      losses: profile?.ranked_losses ?? 0,
    };
  }

  // Global stage
  return {
    rank,
    points: profile?.stage_score ?? profile?.total_score ?? 0,
    stage_score: profile?.stage_score ?? profile?.total_score ?? 0,
    stars: profile?.total_stars ?? 0,
    stages_cleared: profile?.stages_cleared ?? 0,
  };
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
