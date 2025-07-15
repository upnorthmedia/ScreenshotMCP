import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { DEVICE_PRESETS, validateUrl, validateViewport, sanitizeSelector, createError } from './utils.js';

export class ScreenshotCapture {
  constructor(options = {}) {
    this.options = {
      headless: options.headless !== false,
      timeout: options.timeout || 30000,
      maxConcurrent: options.maxConcurrent || 5,
      ...options
    };
    this.browser = null;
    this.activeScreenshots = 0;
  }

  async initialize() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: this.options.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async captureScreenshot(url, options = {}) {
    if (this.activeScreenshots >= this.options.maxConcurrent) {
      throw createError('Too many concurrent screenshot requests', 'RATE_LIMIT_EXCEEDED');
    }

    this.activeScreenshots++;

    try {
      const validatedUrl = validateUrl(url);
      await this.initialize();

      const page = await this.browser.newPage();
      
      try {
        // Configure viewport
        await this.configureViewport(page, options.viewport);
        
        // Set timeouts
        page.setDefaultTimeout(this.options.timeout);
        page.setDefaultNavigationTimeout(this.options.timeout);

        // Navigate to URL
        await page.goto(validatedUrl, {
          waitUntil: options.waitUntil || 'networkidle2',
          timeout: this.options.timeout
        });

        // Wait for specific conditions if provided
        if (options.waitFor) {
          await this.waitForCondition(page, options.waitFor);
        }

        // Standard delay after networkidle2 for better stability
        const standardDelay = options.standardDelay !== false ? 2500 : 0;
        if (standardDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, standardDelay));
        }

        // Additional delay if specified
        if (options.delay) {
          await new Promise(resolve => setTimeout(resolve, options.delay));
        }

        // Capture screenshot with dimension validation
        const screenshotOptions = {
          type: 'png',
          fullPage: true,
          encoding: 'base64',
          ...options.screenshotOptions
        };

        // * Take the screenshot
        const screenshotBase64 = await page.screenshot(screenshotOptions);

        // * Decode base64 to buffer for sharp processing
        let screenshotBuffer = Buffer.from(screenshotBase64, 'base64');
        let metadata;
        try {
          metadata = await sharp(screenshotBuffer).metadata();
        } catch (err) {
          throw createError('Failed to read screenshot metadata', 'IMAGE_METADATA_ERROR', { originalError: err.message });
        }

        // * Check if resizing is needed
        const maxDimension = 8000;
        if (metadata.width > maxDimension || metadata.height > maxDimension) {
          // * Calculate scale factor to fit within 8000x8000
          const scale = Math.min(maxDimension / metadata.width, maxDimension / metadata.height);
          const newWidth = Math.floor(metadata.width * scale);
          const newHeight = Math.floor(metadata.height * scale);
          try {
            screenshotBuffer = await sharp(screenshotBuffer)
              .resize({ width: newWidth, height: newHeight })
              .png()
              .toBuffer();
          } catch (err) {
            throw createError('Failed to resize screenshot image', 'IMAGE_RESIZE_ERROR', { originalError: err.message });
          }
        }

        // * Encode back to base64
        const finalBase64 = screenshotBuffer.toString('base64');

        return {
          success: true,
          data: finalBase64,
          metadata: {
            url: validatedUrl,
            timestamp: new Date().toISOString(),
            viewport: await page.viewport(),
            title: await page.title(),
            imageWidth: metadata.width,
            imageHeight: metadata.height
          }
        };

      } finally {
        await page.close();
      }

    } catch (error) {
      throw createError(
        `Screenshot capture failed: ${error.message}`,
        'CAPTURE_FAILED',
        { url, originalError: error.message }
      );
    } finally {
      this.activeScreenshots--;
    }
  }

  async configureViewport(page, viewportConfig = {}) {
    let viewport;

    if (viewportConfig.preset && DEVICE_PRESETS[viewportConfig.preset]) {
      viewport = { ...DEVICE_PRESETS[viewportConfig.preset] };
    } else {
      viewport = {
        width: viewportConfig.width || 1920,
        height: viewportConfig.height || 1080,
        deviceScaleFactor: viewportConfig.deviceScaleFactor || 1,
        isMobile: viewportConfig.isMobile || false,
        hasTouch: viewportConfig.hasTouch || false,
        userAgent: viewportConfig.userAgent
      };
    }

    validateViewport(viewport);

    await page.setViewport(viewport);
    
    if (viewport.userAgent) {
      await page.setUserAgent(viewport.userAgent);
    }
  }

  async waitForCondition(page, waitFor) {
    const { type, value, timeout = 10000, idleTime = 2000 } = waitFor;

    switch (type) {
      case 'selector':
        const selector = sanitizeSelector(value);
        if (!selector) {
          throw createError('Invalid selector provided', 'INVALID_SELECTOR');
        }
        await page.waitForSelector(selector, { timeout });
        break;

      case 'function':
        await page.waitForFunction(value, { timeout });
        break;

      case 'timeout':
        await new Promise(resolve => setTimeout(resolve, parseInt(value)));
        break;

      case 'networkidle':
        // Smarter network idle with longer idle times
        const idleTimeMs = parseInt(value) || idleTime;
        // Wait for network to be idle for the specified duration
        let lastRequestTime = Date.now();
        const checkInterval = 100;
        
        // Monitor network activity
        page.on('request', () => {
          lastRequestTime = Date.now();
        });
        
        page.on('response', () => {
          lastRequestTime = Date.now();
        });
        
        // Wait until network has been idle for the specified time
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
          if (Date.now() - lastRequestTime >= idleTimeMs) {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        break;

      default:
        throw createError(`Unknown wait condition type: ${type}`, 'INVALID_WAIT_CONDITION');
    }
  }

  async captureElement(url, selector, options = {}) {
    const validatedUrl = validateUrl(url);
    const validatedSelector = sanitizeSelector(selector);
    
    if (!validatedSelector) {
      throw createError('Invalid selector provided', 'INVALID_SELECTOR');
    }

    await this.initialize();
    const page = await this.browser.newPage();

    try {
      await this.configureViewport(page, options.viewport);
      await page.goto(validatedUrl, { waitUntil: 'networkidle2' });

      // Standard delay after networkidle2 for better stability
      const standardDelay = options.standardDelay !== false ? 2500 : 0;
      if (standardDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, standardDelay));
      }

      const element = await page.$(validatedSelector);
      if (!element) {
        throw createError(`Element not found: ${validatedSelector}`, 'ELEMENT_NOT_FOUND');
      }

      // * Take the element screenshot
      const screenshotBase64 = await element.screenshot({
        type: 'png',
        encoding: 'base64'
      });

      // * Decode base64 to buffer for sharp processing
      let screenshotBuffer = Buffer.from(screenshotBase64, 'base64');
      let metadata;
      try {
        metadata = await sharp(screenshotBuffer).metadata();
      } catch (err) {
        throw createError('Failed to read element screenshot metadata', 'IMAGE_METADATA_ERROR', { originalError: err.message });
      }

      // * Check if resizing is needed
      const maxDimension = 8000;
      if (metadata.width > maxDimension || metadata.height > maxDimension) {
        // * Calculate scale factor to fit within 8000x8000
        const scale = Math.min(maxDimension / metadata.width, maxDimension / metadata.height);
        const newWidth = Math.floor(metadata.width * scale);
        const newHeight = Math.floor(metadata.height * scale);
        try {
          screenshotBuffer = await sharp(screenshotBuffer)
            .resize({ width: newWidth, height: newHeight })
            .png()
            .toBuffer();
        } catch (err) {
          throw createError('Failed to resize element screenshot image', 'IMAGE_RESIZE_ERROR', { originalError: err.message });
        }
      }

      // * Encode back to base64
      const finalBase64 = screenshotBuffer.toString('base64');

      return {
        success: true,
        data: finalBase64,
        metadata: {
          url: validatedUrl,
          selector: validatedSelector,
          timestamp: new Date().toISOString(),
          imageWidth: metadata.width,
          imageHeight: metadata.height
        }
      };

    } finally {
      await page.close();
    }
  }
}