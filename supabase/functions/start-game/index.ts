// Supabase Edge Function: start-game
// Creates a new game session and returns the first question

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
        // Create Supabase client
        // @ts-ignore: Deno global
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        // @ts-ignore: Deno global
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabase = createClient(supabaseUrl, serviceKey);

        let user = null;
        const authHeader = req.headers.get('Authorization'); // Define authHeader here

        if (authHeader) {
            const token = authHeader.replace('Bearer ', '');
            const { data, error } = await supabase.auth.getUser(token);
            if (!error && data.user) {
                user = data.user;

                // Abandon any active sessions for this logged-in user
                await supabase
                    .from('game_sessions')
                    .update({ status: 'abandoned' })
                    .eq('user_id', user.id)
                    .eq('status', 'active');
            }
        }

        // Get 10 random questions
        const { data: questions, error: qError } = await supabase
            .rpc('get_random_questions', { count: 10 });

        if (qError) {
            return new Response(JSON.stringify({ error: `RPC error: ${qError.message}` }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (!questions || questions.length < 10) {
            return new Response(JSON.stringify({ error: `Not enough questions in database (found ${questions?.length ?? 0}, need 10). Run seed-questions.sql first.` }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const questionIds = questions.map((q: { id: string }) => q.id);

        // Create game session
        const { data: session, error: sError } = await supabase
            .from('game_sessions')
            .insert({
                user_id: user ? user.id : null,
                question_ids: questionIds,
                current_question_idx: 0,
                score: 0,
                streak: 0,
                correct_count: 0,
                total_answered: 0,
                question_started_at: new Date().toISOString(),
                status: 'active',
            })
            .select()
            .single();

        if (sError) {
            return new Response(JSON.stringify({ error: 'Failed to create session' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Return first question (WITHOUT correct answer)
        const firstQ = questions[0];

        return new Response(JSON.stringify({
            session_id: session.id,
            total_questions: 10,
            question: {
                id: firstQ.id,
                fragment_url: firstQ.fragment_url,
                options: firstQ.options,
                question_number: 1,
            },
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
