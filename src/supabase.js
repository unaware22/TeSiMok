// Supabase client initialization and API helpers
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ===== Auth Helpers =====

export async function signUp(email, password, displayName) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { display_name: displayName },
        },
    });
    return { data, error };
}

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    return { data, error };
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
}

export async function getUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export function onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
}

// ===== Edge Function Helpers =====

async function callEdgeFunction(name, body) {
    const { data: { session } } = await supabase.auth.getSession();

    // We no longer throw an error if !session, to allow guests.

    const url = `${supabaseUrl}/functions/v1/${name}`;
    console.log(`[Edge Function] Calling: ${url}`);

    const headers = {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
    };

    if (session) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    const responseText = await response.text();
    console.log(`[Edge Function] ${name} response (${response.status}):`, responseText);

    let result;
    try {
        result = JSON.parse(responseText);
    } catch {
        throw new Error(`Edge function "${name}" returned invalid JSON (HTTP ${response.status}): ${responseText.substring(0, 200)}`);
    }

    if (!response.ok) {
        throw new Error(result.error || result.message || `Edge function "${name}" failed (HTTP ${response.status}): ${responseText.substring(0, 200)}`);
    }
    return result;
}

export async function startGame() {
    return callEdgeFunction('start-game', {});
}

export async function submitAnswer(sessionId, answer) {
    return callEdgeFunction('submit-answer', {
        session_id: sessionId,
        answer,
    });
}

export async function endGame(sessionId) {
    return callEdgeFunction('end-game', {
        session_id: sessionId,
    });
}

// ===== Leaderboard =====

export async function getLeaderboard(limit = 10) {
    // Fetch a larger pool to find unique players
    const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order('score', { ascending: false })
        .limit(100);

    if (error) throw error;

    // Filter to keep only the highest score per user
    const uniqueLeaderboard = [];
    const seenUsers = new Set();

    for (const entry of (data || [])) {
        if (!seenUsers.has(entry.user_id)) {
            seenUsers.add(entry.user_id);
            uniqueLeaderboard.push(entry);
            if (uniqueLeaderboard.length >= limit) break;
        }
    }

    return uniqueLeaderboard;
}
