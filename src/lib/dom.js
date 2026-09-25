/**
 * lib/dom.js — tiny declarative DOM helpers.
 * Deliberately dependency-free: the app ships as a few KB of vanilla JS.
 */

/**
 * Create an element.
 * @param {string} tag
 * @param {object} [attrs] - `class`, `style` (object), `html`, `text`, `dataset`, or any attribute.
 *                           Keys starting with `on` become event listeners.
 * @param {...(Node|string|null|undefined|false)} children
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') {
      node.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.assign(node.dataset, value);
    } else if (key === 'html') {
      node.innerHTML = value;
    } else if (key === 'text') {
      node.textContent = value;
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'disabled' || key === 'checked' || key === 'selected') {
      node[key] = Boolean(value);
    } else {
      node.setAttribute(key, value);
    }
  }

  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Build an SVG icon from raw path markup (kept inline to avoid a sprite fetch). */
export function svgIcon(pathData, { size = 20, viewBox = '0 0 24 24', stroke = 'currentColor' } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', stroke);
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', pathData);
  svg.appendChild(path);
  return svg;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Replace the content of `#app`. */
export function mount(...children) {
  const app = document.getElementById('app');
  app.innerHTML = '';
  appendChildren(app, children);
  return app;
}

/** Empty a node. */
export function empty(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Add a one-shot CSS class that is removed after `ms`. */
export function flashClass(node, className, ms = 500) {
  if (!node) return;
  node.classList.remove(className);
  void node.offsetWidth; // force reflow so the animation restarts
  node.classList.add(className);
  setTimeout(() => node.classList.remove(className), ms);
}

/** Debounce a function. */
export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Delegate events from a container. */
export function delegate(root, selector, eventName, handler) {
  root.addEventListener(eventName, (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  });
}
