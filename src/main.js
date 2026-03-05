// main.js — App entry point and routing
import './style.css';
import {
    signUp,
    signIn,
    signOut,
    getUser,
    onAuthStateChange,
} from './supabase.js';
import {
    renderAuth,
    renderHome,
    renderLoading,
} from './ui.js';
import { startNewGame } from './game.js';

// ===== App State =====
let currentUser = null;

// ===== Initialize =====
async function init() {
    renderLoading('Initializing...');

    // Listen for auth changes
    onAuthStateChange(async (event, session) => {
        if (session?.user) {
            currentUser = session.user;
            showHome();
        } else {
            currentUser = null;
            showAuth();
        }
    });

    // Check for existing session
    const user = await getUser();
    if (user) {
        currentUser = user;
        showHome();
    } else {
        showAuth();
    }
}

// ===== Screens =====
function showAuth() {
    renderAuth(
        // Sign In
        async (email, password) => {
            const { error } = await signIn(email, password);
            if (error) throw error;
        },
        // Sign Up
        async (email, password, displayName) => {
            const { data, error } = await signUp(email, password, displayName);
            if (error) throw error;
            // If email confirmation is disabled, user is auto-signed in
            // Otherwise show a message
            if (data.user && !data.session) {
                throw new Error('Please check your email to confirm your account, then sign in.');
            }
        },
    );
}

function showHome() {
    renderHome(
        currentUser,
        // Play
        () => startNewGame(showHome),
        // Logout
        async () => {
            await signOut();
            currentUser = null;
            showAuth();
        },
    );
}

// Disable right-click globally on images
document.addEventListener('contextmenu', (e) => {
    if (e.target.tagName === 'IMG' || e.target.closest('.fragment-wrapper')) {
        e.preventDefault();
    }
});

// Prevent zoom shortcuts
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=')) {
        // Only prevent if we're in game mode
        if (document.getElementById('fragment-wrapper')) {
            e.preventDefault();
        }
    }
});

// Start the app
init();
