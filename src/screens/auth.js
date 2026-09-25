/**
 * screens/auth.js
 * Welcome screen & Auth entry point.
 * Matches UIUX.png Screen 1.
 * - Tombol Mulai langsung mengarahkan ke halaman login.
 * - Mendukung Login Email & Login dengan Google.
 * - Menyimpan avatar_emoji pilihan pengguna agar langsung tampil di profil.
 */
import { el, mount } from '../lib/dom.js';
import { Button } from '../components/primitives.js';
import { TeSiMokBrandBadge, IconGoogle } from '../components/icons.js';
import { signIn, signUp, signInWithGoogle, humanizeError } from '../services/supabase.js';
import * as router from '../state/router.js';
import { loadProfile, startLifeTicker } from '../state/store.js';
import { updateLocalProfile } from '../services/fallback-data.js';

const AVATAR_CHOICES = ['😎', '🤣', '🔥', '👑', '🐉', '💀', '🦁', '👽', '🤖', '🐸', '🎭', '🐼'];

export function AuthScreen() {
  let mode = 'welcome'; // 'welcome' | 'signin' | 'signup'
  let selectedAvatar = AVATAR_CHOICES[0];

  async function handleGoogleLogin() {
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (err) {
      alert(humanizeError(err));
    }
  }

  render();

  function render() {
    if (mode === 'welcome') {
      renderWelcome();
    } else {
      renderForm();
    }
  }

  function renderWelcome() {
    mount(
      el('div', { class: 'auth' },
        el('div', { class: 'auth__brand', style: { margin: 'auto 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center' } },
          TeSiMokBrandBadge({ size: 'lg' }),
          el('h1', { class: 'auth__title', style: { color: 'var(--navy-900)', marginTop: '16px', fontSize: '2.1rem' } },
            'TeSiMok'),
          el('p', { class: 'auth__tagline', style: { maxWidth: '280px', margin: '6px auto 0' } },
            'Tebak gambar stiker jomok, naiki peringkat turnamen, dan jadi yang terbaik!'),
        ),

        el('div', { class: 'stack stack-2', style: { width: '100%', margin: 'auto 0 20px' } },
          // Tombol Masuk dengan Google langsung di halaman utama
          el('button', {
            class: 'btn btn--white btn--lg btn--block',
            type: 'button',
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              border: '1.5px solid #EAECF0',
              fontWeight: '700',
              color: 'var(--navy-900)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            },
            onClick: handleGoogleLogin,
          },
            IconGoogle({ size: 20 }),
            el('span', {}, 'Masuk dengan Google'),
          ),

          // Tombol Masuk dengan Email
          Button({
            label: 'Masuk dengan Email',
            variant: 'primary',
            size: 'lg',
            block: true,
            onClick: () => {
              mode = 'signin';
              render();
            },
          }),

          // Tombol Buat Akun Baru
          Button({
            label: 'Buat Akun Baru',
            variant: 'soft',
            size: 'md',
            block: true,
            onClick: () => {
              mode = 'signup';
              render();
            },
          }),

          el('p', {
            class: 't-subtitle t-center',
            style: { fontSize: '11px', opacity: '0.65', marginTop: '6px' },
          }, 'Wajib masuk untuk bermain & menyimpan rating leaderboard.'),
        ),
      ),
    );
  }

  function renderForm() {
    const isSignup = mode === 'signup';

    const errorBox = el('div', { class: 'alert alert--error hidden', id: 'auth-error' });
    const submitBtn = Button({
      label: isSignup ? 'Buat Akun' : 'Masuk',
      variant: 'primary',
      size: 'lg',
      block: true,
      onClick: () => handleSubmit(),
    });

    const nameInput = el('input', {
      class: 'input',
      type: 'text',
      name: 'display_name',
      placeholder: 'Nama pemain kamu',
      maxlength: '20',
      autocomplete: 'nickname',
    });

    const emailInput = el('input', {
      class: 'input',
      type: 'email',
      name: 'email',
      placeholder: 'kamu@email.com',
      autocomplete: 'email',
      required: true,
    });

    const passwordInput = el('input', {
      class: 'input',
      type: 'password',
      name: 'password',
      placeholder: 'Minimal 6 karakter',
      minlength: '6',
      autocomplete: isSignup ? 'new-password' : 'current-password',
      required: true,
    });

    const avatarPicker = el('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } },
      ...AVATAR_CHOICES.map((emoji) =>
        el('button', {
          class: `avatar avatar--sm${emoji === selectedAvatar ? ' avatar--gold' : ''}`,
          type: 'button',
          style: { cursor: 'pointer', fontSize: '1.25rem' },
          onClick: (e) => {
            selectedAvatar = emoji;
            avatarPicker.querySelectorAll('.avatar').forEach((n) => n.classList.remove('avatar--gold'));
            e.currentTarget.classList.add('avatar--gold');
          },
        }, emoji),
      ),
    );

    async function handleGoogleLogin() {
      try {
        const { error } = await signInWithGoogle();
        if (error) throw error;
      } catch (err) {
        showError(humanizeError(err));
      }
    }

    async function handleSubmit() {
      errorBox.classList.add('hidden');

      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const displayName = nameInput.value.trim() || email.split('@')[0] || 'Player123';

      if (!email || !password) {
        showError('Email dan password wajib diisi.');
        return;
      }
      if (password.length < 6) {
        showError('Password minimal 6 karakter.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.querySelector('span:last-child').textContent = 'Memproses...';

      try {
        if (isSignup) {
          const { data, error } = await signUp(email, password, displayName, selectedAvatar);
          if (error) throw error;

          // Simpan avatar dan nama ke profil lokal segera
          updateLocalProfile({
            display_name: displayName,
            avatar_emoji: selectedAvatar,
          });

          if (data.user && !data.session) {
            showError('Cek email kamu untuk konfirmasi akun, lalu masuk kembali.');
            return;
          }
        } else {
          const { error } = await signIn(email, password);
          if (error) throw error;
        }

        await loadProfile();
        startLifeTicker();
        router.resetHistory();
        router.navigate('home');
      } catch (err) {
        showError(humanizeError(err));
      } finally {
        submitBtn.disabled = false;
        submitBtn.querySelector('span:last-child').textContent = isSignup ? 'Buat Akun' : 'Masuk';
      }
    }

    function showError(message) {
      errorBox.textContent = message;
      errorBox.classList.remove('hidden');
    }

    // Enter key submits
    [nameInput, emailInput, passwordInput].forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSubmit();
        }
      });
    });

    mount(
      el('div', { class: 'auth' },
        el('button', {
          class: 'icon-btn',
          type: 'button',
          'aria-label': 'Kembali',
          onClick: () => {
            mode = 'welcome';
            render();
          },
        }, '←'),

        el('div', { class: 'auth__brand' },
          el('h1', { class: 'auth__title' }, isSignup ? 'Daftar Akun' : 'Masuk'),
          el('p', { class: 'auth__tagline' },
            isSignup
              ? 'Pilih avatar dan buat akun untuk menyimpan rating & koin.'
              : 'Masuk dengan akunmu untuk melanjutkan progres.'),
        ),

        errorBox,

        el('div', { class: 'auth__form' },
          // Tombol Login Google
          el('button', {
            class: 'btn btn--white btn--lg btn--block',
            type: 'button',
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              border: '1.5px solid #EAECF0',
              fontWeight: '700',
              color: 'var(--navy-900)',
              marginBottom: '12px',
            },
            onClick: handleGoogleLogin,
          },
            el('svg', {
              width: '20',
              height: '20',
              viewBox: '0 0 24 24',
              style: { flex: '0 0 20px' },
            },
              el('path', {
                fill: '#4285F4',
                d: 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z',
              }),
              el('path', {
                fill: '#34A853',
                d: 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z',
              }),
              el('path', {
                fill: '#FBBC05',
                d: 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z',
              }),
              el('path', {
                fill: '#EA4335',
                d: 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z',
              }),
            ),
            el('span', {}, 'Masuk dengan Google'),
          ),

          // Garis pemisah ATAU
          el('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              margin: '10px 0 16px',
              color: 'var(--text-muted)',
              fontSize: '0.8rem',
              fontWeight: '600',
            },
          },
            el('div', { style: { flex: '1', height: '1px', background: '#E2E8F0' } }),
            el('span', { style: { padding: '0 10px' } }, 'atau dengan email'),
            el('div', { style: { flex: '1', height: '1px', background: '#E2E8F0' } }),
          ),

          isSignup
            ? el('div', { class: 'field' },
                el('label', { class: 'field__label' }, 'Nama Pemain'),
                nameInput,
              )
            : null,

          isSignup
            ? el('div', { class: 'field' },
                el('label', { class: 'field__label' }, 'Pilih Avatar'),
                avatarPicker,
              )
            : null,

          el('div', { class: 'field' },
            el('label', { class: 'field__label' }, 'Email'),
            emailInput,
          ),

          el('div', { class: 'field' },
            el('label', { class: 'field__label' }, 'Password'),
            passwordInput,
          ),

          submitBtn,

          el('div', { class: 'auth__switch' },
            isSignup ? 'Sudah punya akun? ' : 'Belum punya akun? ',
            el('b', {
              onClick: () => {
                mode = isSignup ? 'signin' : 'signup';
                render();
              },
            }, isSignup ? 'Masuk' : 'Daftar Sekarang'),
          ),
        ),
      ),
    );
  }
}
