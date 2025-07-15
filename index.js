#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ScreenshotCapture } from './src/screenshot.js';
import { DEVICE_PRESETS } from './src/utils.js';

const server = new Server(
  {
    name: 'screenshot-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize screenshot capture
const screenshotCapture = new ScreenshotCapture({
  headless: process.env.BROWSER_HEADLESS !== 'false',
  timeout: parseInt(process.env.BROWSER_TIMEOUT) || 30000,
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT_SCREENSHOTS) || 5
});

// Define available tools
const tools = [
  {
    name: 'capture_screenshot',
    description: 'Capture a full-page screenshot of a webpage with advanced options',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL of the webpage to screenshot'
        },
        viewport: {
          type: 'object',
          properties: {
            preset: {
              type: 'string',
              enum: Object.keys(DEVICE_PRESETS),
              description: 'Device preset (mobile, tablet, desktop)'
            },
            width: {
              type: 'number',
              minimum: 100,
              maximum: 5000,
              description: 'Viewport width in pixels'
            },
            height: {
              type: 'number',
              minimum: 100,
              maximum: 5000,
              description: 'Viewport height in pixels'
            },
            deviceScaleFactor: {
              type: 'number',
              minimum: 0.1,
              maximum: 3,
              description: 'Device scale factor'
            },
            isMobile: {
              type: 'boolean',
              description: 'Whether to emulate mobile device'
            },
            hasTouch: {
              type: 'boolean',
              description: 'Whether device has touch support'
            }
          },
          description: 'Viewport configuration'
        },
        waitFor: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['selector', 'function', 'timeout', 'networkidle'],
              description: 'Type of wait condition'
            },
            value: {
              type: 'string',
              description: 'Value for wait condition (selector, function, timeout in ms, or idle time for networkidle)'
            },
            timeout: {
              type: 'number',
              default: 10000,
              description: 'Timeout for wait condition in milliseconds'
            },
            idleTime: {
              type: 'number',
              default: 2000,
              description: 'Network idle time in milliseconds (for networkidle type)'
            }
          },
          description: 'Wait condition before taking screenshot'
        },
        standardDelay: {
          type: 'boolean',
          default: true,
          description: 'Whether to apply standard 2.5s delay after networkidle2 for better stability'
        },
        delay: {
          type: 'number',
          description: 'Additional delay in milliseconds before taking screenshot'
        },
        waitUntil: {
          type: 'string',
          enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'],
          default: 'networkidle2',
          description: 'When to consider navigation complete'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'capture_element',
    description: 'Capture a screenshot of a specific element on a webpage',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL of the webpage'
        },
        selector: {
          type: 'string',
          description: 'CSS selector for the element to capture'
        },
        viewport: {
          type: 'object',
          properties: {
            preset: {
              type: 'string',
              enum: Object.keys(DEVICE_PRESETS),
              description: 'Device preset (mobile, tablet, desktop)'
            },
            width: {
              type: 'number',
              minimum: 100,
              maximum: 5000,
              description: 'Viewport width in pixels'
            },
            height: {
              type: 'number',
              minimum: 100,
              maximum: 5000,
              description: 'Viewport height in pixels'
            }
          },
          description: 'Viewport configuration'
        },
        standardDelay: {
          type: 'boolean',
          default: true,
          description: 'Whether to apply standard 2.5s delay after networkidle2 for better stability'
        }
      },
      required: ['url', 'selector']
    }
  },
  {
    name: 'list_device_presets',
    description: 'List available device presets with their configurations',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  }
];

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'capture_screenshot':
        const result = await screenshotCapture.captureScreenshot(args.url, {
          viewport: args.viewport,
          waitFor: args.waitFor,
          delay: args.delay,
          waitUntil: args.waitUntil,
          standardDelay: args.standardDelay
        });

        return {
          content: [
            {
              type: 'text',
              text: `Screenshot captured successfully from ${args.url}`
            },
            {
              type: 'image',
              data: result.data,
              mimeType: 'image/png'
            },
            {
              type: 'text',
              text: `Metadata: ${JSON.stringify(result.metadata, null, 2)}`
            }
          ]
        };

      case 'capture_element':
        const elementResult = await screenshotCapture.captureElement(args.url, args.selector, {
          viewport: args.viewport,
          standardDelay: args.standardDelay
        });

        return {
          content: [
            {
              type: 'text',
              text: `Element screenshot captured from ${args.url} (selector: ${args.selector})`
            },
            {
              type: 'image',
              data: elementResult.data,
              mimeType: 'image/png'
            },
            {
              type: 'text',
              text: `Metadata: ${JSON.stringify(elementResult.metadata, null, 2)}`
            }
          ]
        };

      case 'list_device_presets':
        const presetsList = Object.entries(DEVICE_PRESETS).map(([name, config]) => ({
          name,
          ...config
        }));

        return {
          content: [
            {
              type: 'text',
              text: 'Available device presets:\n\n' + 
                    presetsList.map(preset => 
                      `**${preset.name}**\n` +
                      `- Dimensions: ${preset.width}x${preset.height}\n` +
                      `- Scale: ${preset.deviceScaleFactor}x\n` +
                      `- Mobile: ${preset.isMobile}\n` +
                      `- Touch: ${preset.hasTouch}\n`
                    ).join('\n')
            }
          ]
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// Handle cleanup on exit
process.on('SIGINT', async () => {
  await screenshotCapture.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await screenshotCapture.close();
  process.exit(0);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Screenshot MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});