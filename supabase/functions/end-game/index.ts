// Supabase Edge Function: end-game
// Force-ends a game session (e.g., when player quits or times out entirely)

// @ts-ignore: Deno ESM import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// @ts-ignore: Deno global
Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // @ts-ignore: Deno global
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        // @ts-ignore: Deno global
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabase = createClient(supabaseUrl, serviceKey);

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { session_id } = await req.json();

        if (!session_id) {
            return new Response(JSON.stringify({ error: 'Missing session_id' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Get the session
        const { data: session, error: sessError } = await supabase
            .from('game_sessions')
            .select('*')
            .eq('id', session_id)
            .eq('user_id', user.id)
            .single();

        if (sessError || !session) {
            return new Response(JSON.stringify({ error: 'Session not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (session.status === 'completed') {
            // Already completed, just return the results
            return new Response(JSON.stringify({
                score: session.score,
                correct_count: session.correct_count,
                total_answered: session.total_answered,
                won: session.correct_count >= 6,
                already_completed: true,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Mark as abandoned
        await supabase
            .from('game_sessions')
            .update({ status: 'abandoned' })
            .eq('id', session_id);

        return new Response(JSON.stringify({
            score: session.score,
            correct_count: session.correct_count,
            total_answered: session.total_answered,
            won: false,
            abandoned: true,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (err: unknown) {
        return new Response(JSON.stringify({ error: (err as Error).message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
