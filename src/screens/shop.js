/**
 * screens/shop.js
 * Toko & Nyawa screens matching UIUX.png (Screens 6 & 7).
 * - Screen 6: Toko (Refill Nyawa, Tambah 5 Kunci, Paket Stiker Eksklusif, Hapus Iklan)
 * - Screen 7: Nyawa (5/5 maksimal, countdown timer, Pulihkan Nyawa, Kunci Jawaban)
 */
import { el, mount } from '../lib/dom.js';
import { sfx } from '../lib/audio.js';
import {
  Button, RowItem, Tabs, Badge, PriceChip, openSheet, toast,
  confirmDialog, EmptyState, Spinner,
} from '../components/primitives.js';
import { BottomNav, TopBar, ResourceStrip } from '../components/shell.js';
import {
  fetchShopItems, fetchStickerCatalogue, fetchOwnedStickers, buy, ads,
} from '../services/shop.js';
import { fetchProfile, buySticker } from '../services/profile.js';
import { getState, applyProfile } from '../state/store.js';
import * as router from '../state/router.js';
import { formatRupiah, formatDuration, formatNumber } from '../lib/format.js';
import { AD_CONFIG, MAX_LIVES } from '../config/game.js';
import { handleNav } from './home.js';

export function ShopScreen({ tab = 'toko' }) {
  // Normalize incoming tab ('lives' -> 'nyawa', 'items' -> 'toko')
  let activeTab = tab === 'lives' || tab === 'nyawa' ? 'nyawa' : 'toko';
  let items = null;
  let stickers = null;
  let owned = [];
  let busy = false;

  load();

  async function load() {
    render({ loading: true });

    try {
      const [shopItems, stickerList, ownedIds] = await Promise.all([
        fetchShopItems(),
        fetchStickerCatalogue().catch(() => []),
        fetchOwnedStickers().catch(() => []),
      ]);

      items = shopItems;
      stickers = stickerList;
      owned = ownedIds;
      render();
    } catch (err) {
      console.error('[shop] load failed:', err);
      render({ error: err.message });
    }
  }

  // ============================================================
  // Render
  // ============================================================

  function render({ loading = false, error = null } = {}) {
    const { profile, lifeState } = getState();

    mount(
      el('div', { class: 'shell' },
        TopBar({
          title: activeTab === 'nyawa' ? 'Nyawa' : 'Toko',
          subtitle: activeTab === 'nyawa' ? 'Kelola nyawa dan kunci' : 'Beli nyawa, kunci, dan item',
          onBack: () => router.navigate('home'),
          right: el('div', { class: 'res-pill res-pill--coins' },
            el('span', { class: 'res-pill__icon' }, '🪙'),
            el('span', {}, formatNumber(profile?.coins ?? 0)),
          ),
        }),

        ResourceStrip({
          profile,
          onLives: () => setTab('nyawa'),
          onKeys: () => setTab('toko'),
        }),

        Tabs({
          items: [
            { id: 'toko', label: 'Toko' },
            { id: 'nyawa', label: 'Nyawa' },
          ],
          active: activeTab,
          onChange: setTab,
        }),

        error ? el('div', { class: 'alert alert--error' }, `⚠️ ${error}`) : null,
        loading ? Spinner() : null,

        !loading && activeTab === 'toko' ? renderTokoTab(profile) : null,
        !loading && activeTab === 'nyawa' ? renderNyawaTab(lifeState, profile) : null,
      ),

      BottomNav('', handleNav),
    );
  }

  function setTab(id) {
    activeTab = id;
    render();
  }

  // ============================================================
  // Screen 6: Toko Tab
  // ============================================================

  function renderTokoTab(profile) {
    const itemCatalog = [
      {
        sku: 'lives_refill',
        icon: '❤️',
        iconVariant: 'coral',
        title: 'Refill Nyawa',
        subtitle: 'Isi penuh 5 nyawa secara instan',
        price: 10000,
        variant: 'coral',
      },
      {
        sku: 'keys_pack_5',
        icon: '🔑',
        iconVariant: 'gold',
        title: 'Tambah 5 Kunci',
        subtitle: 'Bantuan untuk membuka jawaban',
        price: 20000,
        variant: 'coral',
      },
      {
        sku: 'sticker_pack_exclusive',
        icon: '✨',
        iconVariant: 'violet',
        title: 'Paket Stiker Eksklusif',
        subtitle: 'Akses stiker premium untuk battle',
        price: 29000,
        variant: 'coral',
      },
      {
        sku: 'no_ads',
        icon: '🚫',
        iconVariant: 'muted',
        title: 'Hapus Iklan',
        subtitle: 'Main tanpa gangguan iklan',
        price: 15000,
        variant: 'coral',
        isOwned: profile?.is_premium_active && !profile?.premium_until,
      },
    ];

    return el('div', { class: 'stack stack-4', style: { marginTop: '8px' } },
      ...itemCatalog.map((item) =>
        RowItem({
          icon: item.icon,
          iconVariant: item.iconVariant,
          title: item.title,
          subtitle: item.subtitle,
          trail: [
            item.isOwned
              ? Badge({ label: 'Aktif', variant: 'mint' })
              : Button({
                  label: formatRupiah(item.price),
                  variant: 'coral',
                  size: 'sm',
                  onClick: (e) => {
                    e.stopPropagation();
                    handlePurchase({
                      sku: item.sku,
                      title: item.title,
                      description: item.subtitle,
                      price_idr: item.price,
                    });
                  },
                }),
          ],
          onClick: item.isOwned ? null : () =>
            handlePurchase({
              sku: item.sku,
              title: item.title,
              description: item.subtitle,
              price_idr: item.price,
            }),
        }),
      ),

      // Rewarded ad option
      !profile?.is_premium_active
        ? RowItem({
            icon: '🎬',
            iconVariant: 'sky',
            title: 'Tonton Iklan',
            subtitle: `Dapatkan ${AD_CONFIG.rewardedKeysAmount} kunci jawaban gratis`,
            trail: [Badge({ label: 'GRATIS', variant: 'mint' })],
            onClick: () => watchRewardedForKeys(),
          })
        : null,

      // Exclusive sticker preview box
      el('div', { class: 'card', style: { marginTop: '12px' } },
        el('div', { class: 'card__head' },
          el('div', { class: 'card__title' }, '🎭 Koleksi Stiker'),
          el('span', { class: 'card__hint' }, `${owned.length}/${stickers?.length || 10} dimiliki`),
        ),
        el('p', { class: 'card__hint', style: { marginBottom: '12px' } },
          'Koleksi stiker keren untuk taunting di arena battle.'),
        Button({
          label: 'Buka Katalog Stiker',
          variant: 'soft',
          block: true,
          onClick: () => openStickerShop(),
        }),
      ),
    );
  }

  // ============================================================
  // Screen 7: Nyawa Tab
  // ============================================================

  function renderNyawaTab(lifeState, profile) {
    const isFull = lifeState.lives >= MAX_LIVES;
    const countdownSec = Math.max(0, Math.floor(lifeState.msToNext / 1000));

    return el('div', { class: 'stack stack-4', style: { marginTop: '8px' } },
      // Heart hero visual
      el('div', { class: 'card t-center', style: { padding: '28px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' } },
        el('div', { style: { fontSize: '4rem', lineHeight: '1', marginBottom: '12px', animation: 'heartbeat 2s ease-in-out infinite' } }, '❤️'),
        el('div', { style: { fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', fontFamily: 'var(--font-display)' } },
          `${lifeState.lives}/${MAX_LIVES} `,
          el('span', { style: { fontSize: '1rem', fontWeight: '600', color: 'var(--text-muted)' } },
            isFull ? '(maksimal)' : ''),
        ),
        el('div', { class: 'card__hint', id: 'nyawa-countdown-hint', style: { marginTop: '8px', fontSize: '0.85rem' } },
          isFull
            ? '✅ Nyawa kamu sudah penuh!'
            : `Pulih 1 nyawa setiap 2 jam · ${formatDuration(countdownSec)}`),
      ),

      // Card 1: Pulihkan Nyawa
      RowItem({
        icon: '❤️',
        iconVariant: 'coral',
        title: 'Pulihkan Nyawa',
        subtitle: 'Isi penuh nyawa seketika',
        trail: [
          Button({
            label: isFull ? 'Penuh' : 'Rp 10.000',
            variant: 'coral',
            size: 'sm',
            disabled: isFull,
            onClick: (e) => {
              e.stopPropagation();
              handlePurchase({
                sku: 'lives_refill',
                title: 'Pulihkan Nyawa',
                description: 'Isi penuh nyawa secara seketika.',
                price_idr: 10000,
              });
            },
          }),
        ],
        onClick: isFull ? null : () =>
          handlePurchase({
            sku: 'lives_refill',
            title: 'Pulihkan Nyawa',
            description: 'Isi penuh nyawa secara seketika.',
            price_idr: 10000,
          }),
      }),

      // Card 2: Kunci Jawaban
      RowItem({
        icon: '🔑',
        iconVariant: 'gold',
        title: el('span', {},
          'Kunci Jawaban ',
          Badge({ label: '2 Gratis', variant: 'mint' }),
        ),
        subtitle: 'Buka jawaban yang sulit',
        trail: [
          Button({
            label: 'Tambah 5 Kunci Rp 20.000',
            variant: 'coral',
            size: 'sm',
            onClick: (e) => {
              e.stopPropagation();
              handlePurchase({
                sku: 'keys_pack_5',
                title: 'Tambah 5 Kunci Jawaban',
                description: 'Dapatkan 5 kunci jawaban untuk membuka soal.',
                price_idr: 20000,
              });
            },
          }),
        ],
        onClick: () =>
          handlePurchase({
            sku: 'keys_pack_5',
            title: 'Tambah 5 Kunci Jawaban',
            description: 'Dapatkan 5 kunci jawaban untuk membuka soal.',
            price_idr: 20000,
          }),
      }),

      // Note info box
      el('div', { class: 'alert alert--info', style: { borderRadius: '16px' } },
        el('span', { style: { fontSize: '1.2rem' } }, '💡'),
        el('span', { style: { fontSize: '0.85rem', lineHeight: '1.4' } },
          'Kamu mendapatkan 2 kunci gratis setiap hari saat login.'),
      ),

      // Rewarded ad alternative
      !profile?.is_premium_active
        ? RowItem({
            icon: '🎬',
            iconVariant: 'sky',
            title: 'Tonton Iklan',
            subtitle: `Dapat ${AD_CONFIG.rewardedKeysAmount} kunci gratis`,
            trail: [Badge({ label: 'GRATIS', variant: 'mint' })],
            onClick: () => watchRewardedForKeys(),
          })
        : null,
    );
  }

  // ============================================================
  // Sticker Shop Modal
  // ============================================================

  function openStickerShop() {
    const { profile } = getState();

    const list = el('div', { class: 'stack stack-2' },
      ...(stickers || []).map((sticker) => {
        const has = owned.includes(sticker.id);
        const needsPremium = sticker.is_premium && !profile?.is_premium_active;
        const affordable = (profile?.coins ?? 0) >= sticker.price_coins;

        let trail;
        if (has) {
          trail = [Badge({ label: 'Dimiliki', variant: 'mint' })];
        } else if (needsPremium) {
          trail = [Badge({ label: 'Premium', variant: 'gold' })];
        } else if (sticker.price_coins === 0) {
          trail = [Badge({ label: 'Gratis', variant: 'sky' })];
        } else {
          trail = [el('span', { class: 'price-chip price-chip--gold' },
            `🪙 ${formatNumber(sticker.price_coins)}`)];
        }

        return RowItem({
          icon: el('span', { style: { fontSize: '1.4rem' } }, has ? sticker.emoji : '❔'),
          title: sticker.name,
          subtitle: rarityLabel(sticker.rarity),
          trail,
          onClick: has ? null : () => handleStickerPurchase(sticker, { needsPremium, affordable }),
        });
      }),
    );

    openSheet({
      content: el('div', {},
        el('h2', { class: 't-title', style: { marginBottom: '6px' } }, '🎭 Koleksi Stiker'),
        el('p', { class: 't-subtitle', style: { marginBottom: '16px' } },
          `Kamu punya 🪙 ${formatNumber(profile?.coins ?? 0)} koin.`),
        list,
      ),
    });
  }

  function rarityLabel(rarity) {
    return {
      common: 'Umum',
      rare: 'Langka',
      epic: 'Epik',
      legendary: 'Legendaris',
    }[rarity] || 'Umum';
  }

  async function handleStickerPurchase(sticker, { needsPremium, affordable }) {
    if (needsPremium) {
      const go = await confirmDialog({
        title: `${sticker.emoji} Stiker Premium`,
        body: `Stiker "${sticker.name}" hanya tersedia untuk pemain Premium.`,
        confirmLabel: 'Lihat Premium',
        cancelLabel: 'Nanti',
      });
      if (go) {
        document.querySelector('.overlay')?.remove();
        router.navigate('subscription');
      }
      return;
    }

    if (!affordable) {
      toast('Koin kamu tidak cukup. Selesaikan stage untuk koin gratis!', 'bad');
      return;
    }

    const confirmed = await confirmDialog({
      title: `Beli ${sticker.name}?`,
      body: `Harga: 🪙 ${formatNumber(sticker.price_coins)} koin`,
      confirmLabel: 'Beli',
      cancelLabel: 'Batal',
    });

    if (!confirmed) return;

    try {
      const updated = await buySticker(sticker.id);
      owned.push(sticker.id);
      applyProfile(updated);
      sfx.coin();
      toast(`${sticker.emoji} ${sticker.name} berhasil dibeli!`, 'ok');
      document.querySelector('.overlay')?.remove();
      render();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  // ============================================================
  // Purchase Flow
  // ============================================================

  async function handlePurchase(item) {
    if (busy) return;

    const { profile } = getState();
    if (!profile) {
      toast('Masuk dulu untuk berbelanja.', 'bad');
      router.navigate('auth');
      return;
    }

    const confirmed = await confirmDialog({
      title: `Beli ${item.title}?`,
      body: `${item.description || ''}\n\nTotal: ${formatRupiah(item.price_idr)}`,
      confirmLabel: `Bayar ${formatRupiah(item.price_idr)}`,
      cancelLabel: 'Batal',
    });

    if (!confirmed) return;

    busy = true;
    const overlay = openSheet({
      position: 'center',
      dismissible: false,
      content: el('div', { class: 'stack stack-4', style: { alignItems: 'center' } },
        new Spinner(),
        el('p', { class: 't-subtitle' }, 'Memproses pembayaran...'),
      ),
    });

    try {
      await sleep(700);

      const result = await buy(item.sku);
      const updated = await fetchProfile();

      applyProfile(updated);
      sfx.coin();

      overlay.close();

      openSheet({
        position: 'center',
        content: el('div', {},
          el('div', { class: 'result-badge result-badge--win' }, '✅'),
          el('h2', { class: 't-title t-center' }, 'Pembayaran Berhasil'),
          el('p', { class: 't-subtitle t-center', style: { marginTop: '8px' } },
            result.message || 'Item sudah berhasil ditambahkan ke akunmu.'),
          el('div', { class: 'dialog__actions', style: { marginTop: '16px' } },
            Button({
              label: 'Selesai',
              variant: 'gold',
              block: true,
              onClick: () => {
                document.querySelector('.overlay')?.remove();
                render();
              },
            }),
          ),
        ),
      });
    } catch (err) {
      overlay.close();
      toast(err.message || 'Pembayaran gagal.', 'bad');
    } finally {
      busy = false;
    }
  }

  // ============================================================
  // Rewarded Ads
  // ============================================================

  async function watchRewardedForKeys() {
    try {
      const result = await ads.showRewarded();
      if (!result.rewarded) return;

      const { profile } = getState();
      const newKeys = (profile?.answer_keys ?? 0) + AD_CONFIG.rewardedKeysAmount;

      const { updateLocalProfile } = await import('../services/fallback-data.js');
      updateLocalProfile({ answer_keys: newKeys });

      const updated = await fetchProfile();
      applyProfile(updated);

      sfx.reward();
      toast(`🔑 +${AD_CONFIG.rewardedKeysAmount} kunci jawaban!`, 'ok');
      render();
    } catch (err) {
      toast('Iklan tidak tersedia saat ini.', 'bad');
    }
  }

  // ============================================================
  // Live Countdown for the Lives Timer
  // ============================================================

  const countdownId = setInterval(() => {
    const hintNode = document.getElementById('nyawa-countdown-hint');
    if (hintNode) {
      const { lifeState } = getState();
      if (lifeState.lives >= MAX_LIVES) {
        hintNode.textContent = '✅ Nyawa kamu sudah penuh!';
      } else {
        const sec = Math.max(0, Math.floor(lifeState.msToNext / 1000));
        hintNode.textContent = `Pulih 1 nyawa setiap 2 jam · ${formatDuration(sec)}`;
      }
    }
  }, 1000);

  return () => clearInterval(countdownId);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
