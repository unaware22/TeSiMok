/**
 * scripts/test-navigation.js
 * Test router race conditions and async screen unmount resilience.
 */

import assert from 'node:assert';

console.log('Testing router race conditions and screen lifecycle...');

// Mock browser globals
globalThis.window = {
  location: { hash: '#/home' },
  history: {
    pushState(state, title, url) {
      globalThis.window.location.hash = url;
    },
  },
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document = {
  getElementById(id) {
    return {
      innerHTML: '',
      replaceChildren() {},
      appendChild() {},
      querySelector() { return null; },
    };
  },
  createElement(tag) {
    return {
      tagName: tag.toUpperCase(),
      style: {},
      classList: { add() {}, remove() {}, contains() { return false; } },
      setAttribute() {},
      appendChild() {},
      addEventListener() {},
    };
  },
  createTextNode(text) {
    return { textContent: text };
  },
};
globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};

const router = await import('../src/state/router.js');

let mountedScreen = null;
let cleanupCalls = [];

// Setup test routes
router.register('screenA', async () => {
  await new Promise((r) => setTimeout(r, 80)); // slow module
  return () => {
    mountedScreen = 'screenA';
    return () => cleanupCalls.push('cleanupA');
  };
});

router.register('screenB', async () => {
  await new Promise((r) => setTimeout(r, 10)); // fast module
  return () => {
    mountedScreen = 'screenB';
    return () => cleanupCalls.push('cleanupB');
  };
});

router.register('screenC', async () => {
  await new Promise((r) => setTimeout(r, 20));
  return () => {
    mountedScreen = 'screenC';
    return () => cleanupCalls.push('cleanupC');
  };
});

// Test 1: Rapid navigation out-of-order resolution
// Trigger screenA (slow), then immediately screenB (fast).
// screenA must NOT overwrite screenB even when screenA finishes later!
console.log('Test 1: Firing screenA then immediately screenB...');
const pA = router.navigate('screenA');
const pB = router.navigate('screenB');

await Promise.all([pA, pB]);

assert.strictEqual(mountedScreen, 'screenB', `Expected screenB to be mounted, but found: ${mountedScreen}`);
assert.strictEqual(router.current()?.name, 'screenB', `Current route should be screenB`);
console.log('✓ Test 1 passed: Fast route B overtook slow route A without being overwritten.');

// Test 2: Trigger screenC, verify cleanupB is called
console.log('Test 2: Navigating to screenC, checking cleanup...');
await router.navigate('screenC');
assert.strictEqual(mountedScreen, 'screenC');
assert(cleanupCalls.includes('cleanupB'), 'cleanupB should have been called when leaving screenB');
console.log('✓ Test 2 passed: Cleanup invoked properly on route change.');

// Test 3: Rapid repeated clicks on same route
console.log('Test 3: Rapid clicks on same route ignored...');
const currentHashBefore = globalThis.window.location.hash;
let cleanupCountBefore = cleanupCalls.length;
await router.navigate('screenC'); // re-navigating to same route
assert.strictEqual(cleanupCalls.length, cleanupCountBefore, 'Should not re-mount or re-cleanup on same route');
console.log('✓ Test 3 passed: Same route rapid click ignored.');

console.log('All navigation race condition tests passed successfully!');
