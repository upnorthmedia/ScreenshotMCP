import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenshotCapture, BROWSER_LAUNCH_ARGS } from './screenshot.js';

describe('BROWSER_LAUNCH_ARGS', () => {
  it('does not include --single-process (crashes Chromium on Windows)', () => {
    assert.ok(
      !BROWSER_LAUNCH_ARGS.includes('--single-process'),
      'expected --single-process to be absent from browser launch args'
    );
  });

  it('keeps sandbox-related flags used for constrained environments', () => {
    assert.ok(BROWSER_LAUNCH_ARGS.includes('--no-sandbox'));
    assert.ok(BROWSER_LAUNCH_ARGS.includes('--disable-setuid-sandbox'));
    assert.ok(BROWSER_LAUNCH_ARGS.includes('--disable-dev-shm-usage'));
  });
});

describe('ScreenshotCapture.initialize', () => {
  let capture;

  before(() => {
    capture = new ScreenshotCapture({ headless: true, timeout: 15000 });
  });

  after(async () => {
    await capture.close();
  });

  it('launches a connected browser', async () => {
    const browser = await capture.initialize();
    assert.ok(browser);
    assert.equal(browser.connected, true);
  });

  it('relaunches when the previous browser connection is dead', async () => {
    const first = await capture.initialize();
    assert.equal(first.connected, true);

    // Simulate crash / disconnect: close the browser without clearing the handle
    await first.close();
    assert.equal(first.connected, false);
    assert.ok(capture.browser, 'stale browser reference should still be set');

    const second = await capture.initialize();
    assert.equal(second.connected, true, 'initialize should relaunch a connected browser');
    assert.notEqual(second, first, 'should return a new browser instance');
  });
});

describe('ScreenshotCapture after reconnect', () => {
  let capture;

  after(async () => {
    if (capture) {
      await capture.close();
    }
  });

  it('can capture a screenshot after recovering from a dead browser', async () => {
    capture = new ScreenshotCapture({ headless: true, timeout: 20000 });
    await capture.initialize();
    await capture.browser.close();

    const result = await capture.captureScreenshot('https://example.com', {
      standardDelay: false,
      waitUntil: 'domcontentloaded'
    });

    assert.equal(result.success, true);
    assert.ok(result.data && result.data.length > 100, 'expected base64 screenshot data');
    assert.equal(result.metadata.url, 'https://example.com/');
  });
});
