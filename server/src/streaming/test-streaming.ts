/**
 * Test script for Hue Entertainment API streaming
 *
 * Usage:
 *   npx tsx src/streaming/test-streaming.ts
 *
 * Prerequisites:
 * 1. Create an entertainment area in the Hue app
 * 2. Get your bridge IP, username, and clientKey
 * 3. Update the config below
 */

import { HueBridgeController } from '../hue/HueBridgeController';
import { HueStreamingService } from './HueStreamingService';
import type { RGB, ChannelMapping } from './types';

// Configuration - update these values
const CONFIG = {
  bridgeIp: process.env.HUE_BRIDGE_IP || '192.168.1.6',
  username: process.env.HUE_USERNAME || '',
  clientKey: process.env.HUE_CLIENT_KEY || '',
  entertainmentConfigId: process.env.HUE_ENTERTAINMENT_ID || '',
};

async function main() {
  console.log('=== Hue Entertainment Streaming Test ===\n');

  // Validate config
  if (!CONFIG.username || !CONFIG.clientKey) {
    console.log('Missing credentials. You need to generate them first.\n');
    console.log('To generate credentials with clientKey:');
    console.log('1. Press the link button on your Hue bridge');
    console.log('2. Run this script with --generate flag\n');

    if (process.argv.includes('--generate')) {
      await generateCredentials();
    }
    return;
  }

  // Connect to bridge
  console.log(`Connecting to bridge at ${CONFIG.bridgeIp}...`);
  const controller = new HueBridgeController();
  await controller.connect(CONFIG.bridgeIp, CONFIG.username, CONFIG.clientKey);
  console.log('Connected!\n');

  // Get entertainment configurations
  console.log('Fetching entertainment configurations...');
  const configs = await controller.getEntertainmentConfigurations();

  if (configs.length === 0) {
    console.log('No entertainment configurations found.');
    console.log('Please create one in the Hue app first.');
    return;
  }

  console.log(`Found ${configs.length} entertainment configuration(s):`);
  for (const config of configs) {
    console.log(`  - ${config.metadata?.name || 'Unnamed'} (${config.id})`);
    console.log(`    Status: ${config.status}`);
    console.log(`    Channels: ${config.channels?.length || 0}`);
  }

  // Use specified config or first available
  const entertainmentConfig = CONFIG.entertainmentConfigId
    ? configs.find((c: any) => c.id === CONFIG.entertainmentConfigId)
    : configs[0];

  if (!entertainmentConfig) {
    console.log('Entertainment configuration not found.');
    return;
  }

  console.log(`\nUsing: ${entertainmentConfig.metadata?.name} (${entertainmentConfig.id})\n`);

  // Build channel mappings
  const channelMappings: ChannelMapping[] = (entertainmentConfig.channels || []).map((ch: any) => ({
    channelId: ch.channel_id,
    lightId: ch.members?.[0]?.service?.rid || '',
    position: ch.position || { x: 0, y: 0, z: 0 },
  }));

  console.log('Channel mappings:');
  for (const mapping of channelMappings) {
    console.log(`  Channel ${mapping.channelId}: Light ${mapping.lightId}`);
  }

  // Get application ID
  const applicationId = controller.getApplicationId();
  if (!applicationId) {
    console.log('\nError: Could not get application ID for streaming.');
    return;
  }
  console.log(`\nApplication ID: ${applicationId}`);

  // Create streaming service
  const streamingService = new HueStreamingService({
    bridgeIp: CONFIG.bridgeIp,
    username: CONFIG.username,
    clientKey: CONFIG.clientKey,
    entertainmentConfigId: entertainmentConfig.id,
    targetFps: 50,
  });

  streamingService.setApplicationId(applicationId);
  streamingService.setChannelMappings(channelMappings);

  // Set API callbacks (wrap to convert boolean return to void)
  streamingService.setApiCallbacks(
    async () => { await controller.startEntertainmentStreaming(entertainmentConfig.id); },
    async () => { await controller.stopEntertainmentStreaming(entertainmentConfig.id); }
  );

  // Set up event handlers
  streamingService.on('started', () => console.log('\n[Event] Streaming started'));
  streamingService.on('stopped', (reason) => console.log(`\n[Event] Streaming stopped: ${reason}`));
  streamingService.on('error', (err) => console.error('\n[Event] Error:', err.message));
  streamingService.on('connectionLost', () => console.log('\n[Event] Connection lost'));

  // Start streaming
  console.log('\nStarting entertainment streaming...');
  try {
    await streamingService.start();
  } catch (err: any) {
    console.error('Failed to start streaming:', err.message);
    return;
  }

  // Run a color animation for 10 seconds
  console.log('\nRunning color animation for 10 seconds...');
  const startTime = Date.now();
  const duration = 10000;

  const animationInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = (elapsed % 3000) / 3000; // 3 second cycle

    // Cycle through colors: Red -> Green -> Blue
    const hue = progress * 360;
    const rgb = hslToRgb(hue, 100, 50);

    // Set all channels to the same color
    for (const mapping of channelMappings) {
      streamingService.setChannelRgb(mapping.channelId, rgb);
    }
  }, 20); // 50Hz

  // Stop after duration
  await new Promise((resolve) => setTimeout(resolve, duration));
  clearInterval(animationInterval);

  // Stop streaming
  console.log('\nStopping streaming...');
  await streamingService.stop();

  console.log('\nTest complete!');
  console.log(streamingService.getStats());
}

async function generateCredentials() {
  const controller = new HueBridgeController();
  const bridgeIp = CONFIG.bridgeIp;

  console.log(`\nGenerating credentials for bridge at ${bridgeIp}...`);
  console.log('Make sure you pressed the link button!\n');

  try {
    const { username, clientKey } = await controller.createUserWithClientKey(bridgeIp);

    console.log('Success! Save these credentials:\n');
    console.log(`HUE_USERNAME="${username}"`);
    console.log(`HUE_CLIENT_KEY="${clientKey}"`);
    console.log('\nAdd them to your environment or config file.');
  } catch (err: any) {
    console.error('Failed:', err.message);
  }
}

function hslToRgb(h: number, s: number, l: number): RGB {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [
    Math.round(f(0) * 255),
    Math.round(f(8) * 255),
    Math.round(f(4) * 255),
  ];
}

main().catch(console.error);
