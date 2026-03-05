// Supabase Edge Function: submit-answer
// Validates an answer server-side, updates score/streak, returns next question

// @ts-ignore: Deno ESM import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIME_LIMIT_SECONDS = 15;

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

        // Verify user
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { session_id, answer } = await req.json();

        if (!session_id || answer === undefined) {
            return new Response(JSON.stringify({ error: 'Missing session_id or answer' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Get the active session
        const { data: session, error: sessError } = await supabase
            .from('game_sessions')
            .select('*')
            .eq('id', session_id)
            .eq('user_id', user.id)
            .eq('status', 'active')
            .single();

        if (sessError || !session) {
            return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Check if already answered all questions
        if (session.current_question_idx >= session.question_ids.length) {
            return new Response(JSON.stringify({ error: 'All questions already answered' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Validate time — allow a small buffer (2s) for network latency
        const questionStarted = new Date(session.question_started_at);
        const now = new Date();
        const elapsed = (now.getTime() - questionStarted.getTime()) / 1000;
        const timedOut = elapsed > TIME_LIMIT_SECONDS + 2;

        // Get current question
        const currentQuestionId = session.question_ids[session.current_question_idx];
        const { data: question, error: qError } = await supabase
            .from('questions')
            .select('*')
            .eq('id', currentQuestionId)
            .single();

        if (qError || !question) {
            return new Response(JSON.stringify({ error: 'Question not found' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Check answer (if timed out, treat as wrong)
        const isCorrect = !timedOut && answer === question.correct_answer;

        // Calculate new score and streak
        const newStreak = isCorrect ? session.streak + 1 : 0;
        const pointsEarned = isCorrect ? 10 * newStreak : 0;
        const newScore = session.score + pointsEarned;
        const newCorrectCount = session.correct_count + (isCorrect ? 1 : 0);
        const newTotalAnswered = session.total_answered + 1;
        const newIdx = session.current_question_idx + 1;

        const isLastQuestion = newIdx >= session.question_ids.length;

        // Update session
        const updateData: Record<string, unknown> = {
            current_question_idx: newIdx,
            score: newScore,
            streak: newStreak,
            correct_count: newCorrectCount,
            total_answered: newTotalAnswered,
            question_started_at: new Date().toISOString(),
        };

        if (isLastQuestion) {
            updateData.status = 'completed';
        }

        await supabase
            .from('game_sessions')
            .update(updateData)
            .eq('id', session_id);

        // Build response
        const response: Record<string, unknown> = {
            is_correct: isCorrect,
            correct_answer: question.correct_answer,
            timed_out: timedOut,
            points_earned: pointsEarned,
            score: newScore,
            streak: newStreak,
            correct_count: newCorrectCount,
            total_answered: newTotalAnswered,
            is_last_question: isLastQuestion,
        };

        // If not last question, include next question
        if (!isLastQuestion) {
            const nextQuestionId = session.question_ids[newIdx];
            const { data: nextQ } = await supabase
                .from('questions')
                .select('id, fragment_url, options')
                .eq('id', nextQuestionId)
                .single();

            if (nextQ) {
                response.next_question = {
                    id: nextQ.id,
                    fragment_url: nextQ.fragment_url,
                    options: nextQ.options,
                    question_number: newIdx + 1,
                };
            }
        } else {
            // Game is over — determine win/lose
            const won = newCorrectCount >= 6;
            response.won = won;

            if (won) {
                // Get user display name
                const { data: profile } = await supabase.auth.admin.getUserById(user.id);
                const playerName = profile?.user?.user_metadata?.display_name
                    || profile?.user?.email?.split('@')[0]
                    || 'Anonymous';

                // Check existing high score
                const { data: existingScores } = await supabase
                    .from('leaderboard')
                    .select('id, score')
                    .eq('user_id', user.id)
                    .order('score', { ascending: false });

                if (existingScores && existingScores.length > 0) {
                    const topScore = existingScores[0];
                    if (newScore > topScore.score) {
                        // Update with new High Score
                        await supabase
                            .from('leaderboard')
                            .update({
                                player_name: playerName,
                                score: newScore,
                                correct_count: newCorrectCount,
                                total_count: newTotalAnswered,
                                created_at: new Date().toISOString(),
                            })
                            .eq('id', topScore.id);
                    }

                    // Clean up any other duplicates that might exist from before
                    if (existingScores.length > 1) {
                        const idsToDelete = existingScores.slice(1).map((s: any) => s.id);
                        for (const id of idsToDelete) {
                            await supabase.from('leaderboard').delete().eq('id', id);
                        }
                    }
                } else {
                    // First time on leaderboard
                    await supabase
                        .from('leaderboard')
                        .insert({
                            user_id: user.id,
                            player_name: playerName,
                            score: newScore,
                            correct_count: newCorrectCount,
                            total_count: newTotalAnswered,
                        });
                }
            }
        }

        return new Response(JSON.stringify(response), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (err: unknown) {
        return new Response(JSON.stringify({ error: (err as Error).message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
