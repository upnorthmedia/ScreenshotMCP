export const DEVICE_PRESETS = {
  mobile: {
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15A372 Safari/604.1'
  },
  tablet: {
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15A372 Safari/604.1'
  },
  desktop: {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  }
};

export function validateUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are supported');
    }
    return parsed.href;
  } catch (error) {
    throw new Error(`Invalid URL: ${error.message}`);
  }
}

export function validateViewport(viewport) {
  const errors = [];
  
  if (viewport.width && (viewport.width < 100 || viewport.width > 5000)) {
    errors.push('Width must be between 100 and 5000 pixels');
  }
  
  if (viewport.height && (viewport.height < 100 || viewport.height > 5000)) {
    errors.push('Height must be between 100 and 5000 pixels');
  }
  
  if (errors.length > 0) {
    throw new Error(errors.join(', '));
  }
}

export function sanitizeSelector(selector) {
  if (!selector || typeof selector !== 'string') {
    return null;
  }
  
  // Basic CSS selector validation
  const dangerousPatterns = [
    /javascript:/i,
    /on\w+=/i,
    /<script/i,
    /eval\(/i
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(selector)) {
      throw new Error('Invalid selector: contains dangerous patterns');
    }
  }
  
  return selector.trim();
}

export function createError(message, code = 'SCREENSHOT_ERROR', details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}