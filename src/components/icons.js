/**
 * components/icons.js
 * Crisp, modern SVG icons for navigation, resources, and branding.
 * Replaces generic raw emojis and plastic AI-generated graphics with
 * sharp, cohesive vector design.
 */
import { el } from '../lib/dom.js';

function createSvg(width, height, viewBox, children, extraAttrs = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('xmlns', ns);
  
  for (const [key, value] of Object.entries(extraAttrs)) {
    svg.setAttribute(key, String(value));
  }

  for (const child of children) {
    if (!child) continue;
    const elem = document.createElementNS(ns, child.tag);
    for (const [k, v] of Object.entries(child.attrs || {})) {
      elem.setAttribute(k, String(v));
    }
    if (child.text) {
      elem.textContent = child.text;
    }
    svg.appendChild(elem);
  }
  return svg;
}

// -------------------------------------------------------------
// Bottom Navigation Icons
// -------------------------------------------------------------

export function IconHome({ size = 22, active = false, color = 'currentColor' } = {}) {
  const stroke = active ? '#38BDF8' : color;
  const fill = active ? 'rgba(56, 189, 248, 0.2)' : 'none';
  return createSvg(size, size, '0 0 24 24', [
    { tag: 'path', attrs: { d: 'M3 10.5L12 3l9 7.5V20a1.5 1.5 0 01-1.5 1.5H15a1 1 0 01-1-1v-4.5h-4V20a1 1 0 01-1 1H4.5A1.5 1.5 0 013 20v-9.5z', fill: fill, stroke: stroke, 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
  ]);
}

export function IconBattle({ size = 22, active = false, color = 'currentColor' } = {}) {
  const stroke = active ? '#38BDF8' : color;
  const fill = active ? 'rgba(56, 189, 248, 0.2)' : 'none';
  return createSvg(size, size, '0 0 24 24', [
    // Left blade
    { tag: 'path', attrs: { d: 'M14.5 4l5.5 5.5-9 9L6.5 14l8-10z', fill: fill, stroke: stroke, 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
    { tag: 'path', attrs: { d: 'M5 19l2.5-2.5', stroke: stroke, 'stroke-width': '2', 'stroke-linecap': 'round' } },
    { tag: 'path', attrs: { d: 'M3.5 20.5l1.5-1.5', stroke: stroke, 'stroke-width': '2.5', 'stroke-linecap': 'round' } },
    // Right blade (crossed)
    { tag: 'path', attrs: { d: 'M9.5 4L4 9.5l9 9 4.5-4.5-8-10z', fill: fill, stroke: stroke, 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
    { tag: 'path', attrs: { d: 'M19 19l-2.5-2.5', stroke: stroke, 'stroke-width': '2', 'stroke-linecap': 'round' } },
    { tag: 'path', attrs: { d: 'M20.5 20.5l-1.5-1.5', stroke: stroke, 'stroke-width': '2.5', 'stroke-linecap': 'round' } },
  ]);
}

export function IconTrophy({ size = 22, active = false, color = 'currentColor' } = {}) {
  const stroke = active ? '#38BDF8' : color;
  const fill = active ? 'rgba(56, 189, 248, 0.2)' : 'none';
  return createSvg(size, size, '0 0 24 24', [
    // Cup bowl
    { tag: 'path', attrs: { d: 'M6 4h12v6a6 6 0 01-12 0V4z', fill: fill, stroke: stroke, 'stroke-width': '2', 'stroke-linejoin': 'round' } },
    // Left handle
    { tag: 'path', attrs: { d: 'M6 6H3.5a1.5 1.5 0 00-1.5 1.5v1A3.5 3.5 0 005.5 12H6', stroke: stroke, 'stroke-width': '1.8', 'stroke-linecap': 'round' } },
    // Right handle
    { tag: 'path', attrs: { d: 'M18 6h2.5a1.5 1.5 0 011.5 1.5v1a3.5 3.5 0 01-3.5 3.5H18', stroke: stroke, 'stroke-width': '1.8', 'stroke-linecap': 'round' } },
    // Stem
    { tag: 'path', attrs: { d: 'M12 16v3', stroke: stroke, 'stroke-width': '2', 'stroke-linecap': 'round' } },
    // Base
    { tag: 'path', attrs: { d: 'M8 21h8', stroke: stroke, 'stroke-width': '2.2', 'stroke-linecap': 'round' } },
  ]);
}

export function IconProfile({ size = 22, active = false, color = 'currentColor' } = {}) {
  const stroke = active ? '#38BDF8' : color;
  const fill = active ? 'rgba(56, 189, 248, 0.2)' : 'none';
  return createSvg(size, size, '0 0 24 24', [
    { tag: 'circle', attrs: { cx: '12', cy: '8', r: '4.5', fill: fill, stroke: stroke, 'stroke-width': '2' } },
    { tag: 'path', attrs: { d: 'M4 20c0-3.8 3.6-6.5 8-6.5s8 2.7 8 6.5', fill: fill, stroke: stroke, 'stroke-width': '2', 'stroke-linecap': 'round' } },
  ]);
}

// -------------------------------------------------------------
// Resource & Game Action Icons
// -------------------------------------------------------------

export function IconHeart({ size = 18, color = '#FF6B6B' } = {}) {
  return createSvg(size, size, '0 0 24 24', [
    { tag: 'path', attrs: { d: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z', fill: color } },
  ]);
}

export function IconKey({ size = 18, color = '#F59E0B' } = {}) {
  return createSvg(size, size, '0 0 24 24', [
    { tag: 'circle', attrs: { cx: '7.5', cy: '12', r: '4.5', stroke: color, 'stroke-width': '2', fill: 'none' } },
    { tag: 'path', attrs: { d: 'M12 12h9v3h-2.5v-3', stroke: color, 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
    { tag: 'path', attrs: { d: 'M16 12v2.5', stroke: color, 'stroke-width': '2', 'stroke-linecap': 'round' } },
  ]);
}

export function IconLightbulb({ size = 18, color = '#F59E0B' } = {}) {
  return createSvg(size, size, '0 0 24 24', [
    { tag: 'path', attrs: { d: 'M9 18h6m-4 3h2', stroke: color, 'stroke-width': '2', 'stroke-linecap': 'round' } },
    { tag: 'path', attrs: { d: 'M12 2a7 7 0 00-7 7c0 2.6 1.4 4.8 3.5 6h7c2.1-1.2 3.5-3.4 3.5-6a7 7 0 00-7-7z', stroke: color, 'stroke-width': '2', fill: 'none' } },
    { tag: 'path', attrs: { d: 'M10 9l2 2 3-3', stroke: color, 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
  ]);
}

export function IconGoogle({ size = 18 } = {}) {
  return createSvg(size, size, '0 0 24 24', [
    { tag: 'path', attrs: { d: 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z', fill: '#4285F4' } },
    { tag: 'path', attrs: { d: 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z', fill: '#34A853' } },
    { tag: 'path', attrs: { d: 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z', fill: '#FBBC05' } },
    { tag: 'path', attrs: { d: 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z', fill: '#EA4335' } },
  ]);
}

// -------------------------------------------------------------
// Hand-crafted Brand Logo Badge (Sticker Aesthetic, Anti-AI-Slop)
// -------------------------------------------------------------

export function TeSiMokBrandBadge({ size = 'md' } = {}) {
  const isLg = size === 'lg';
  const imgSize = isLg ? 150 : 96;

  return el('div', {
    class: 'tesimok-brand-badge',
    style: {
      position: 'relative',
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto',
      userSelect: 'none',
    },
  },
    el('img', {
      src: '/brand/logo.png',
      alt: 'TeSiMok Mascot Logo',
      style: {
        width: `${imgSize}px`,
        height: `${imgSize}px`,
        objectFit: 'contain',
        filter: 'drop-shadow(0 12px 26px rgba(28, 36, 49, 0.22))',
        transform: 'rotate(-2deg)',
      },
    }),
  );
}
