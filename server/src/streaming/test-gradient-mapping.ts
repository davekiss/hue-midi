/**
 * Diagnostic test for gradient light channel mappings
 *
 * Usage:
 *   npx tsx src/streaming/test-gradient-mapping.ts
 *
 * This will show how the Entertainment API maps your gradient light strip
 * and whether the StreamingRouter detects it as a gradient light.
 */

import { HueBridgeController } from '../hue/HueBridgeController';
import { StreamingRouter } from './StreamingRouter';
import type { ChannelMapping } from './types';

const CONFIG = {
  bridgeIp: process.env.HUE_BRIDGE_IP || '192.168.1.6',
  username: process.env.HUE_USERNAME || '',
  clientKey: process.env.HUE_CLIENT_KEY || '',
};

async function main() {
  console.log('=== Gradient Light Channel Mapping Diagnostic ===\n');

  if (!CONFIG.username) {
    console.log('Missing HUE_USERNAME environment variable');
    return;
  }

  // Connect to bridge
  console.log(`Connecting to bridge at ${CONFIG.bridgeIp}...`);
  const controller = new HueBridgeController();
  await controller.connect(CONFIG.bridgeIp, CONFIG.username, CONFIG.clientKey || undefined);
  console.log('Connected!\n');

  // Get all lights to map V1 -> V2 IDs
  console.log('Fetching lights (V1 and V2 IDs)...');
  const lights = await controller.getLights();
  console.log(`\nFound ${lights.length} lights:`);
  for (const light of lights) {
    console.log(`  V1 ID: ${light.id.padEnd(3)} | V2 ID: ${light.v2Id || 'N/A'.padEnd(36)} | Name: ${light.name}`);
    if (light.capabilities?.gradient) {
      console.log(`    ^ GRADIENT CAPABLE`);
    }
  }

  // Get entertainment configurations
  console.log('\n\nFetching entertainment configurations...');
  const configs = await controller.getEntertainmentConfigurations();

  if (configs.length === 0) {
    console.log('No entertainment configurations found.');
    return;
  }

  for (const config of configs) {
    console.log(`\n--- Entertainment Config: ${config.metadata?.name || 'Unnamed'} (${config.id}) ---`);
    console.log(`Status: ${config.status}`);
    console.log(`\nChannel Mappings:`);

    const channelMappings: ChannelMapping[] = [];

    for (const channel of config.channels || []) {
      const lightId = channel.members?.[0]?.service?.rid || 'unknown';
      const mapping: ChannelMapping = {
        channelId: channel.channel_id,
        lightId,
        position: channel.position || { x: 0, y: 0, z: 0 },
      };
      channelMappings.push(mapping);

      // Find matching light
      const light = lights.find(l => l.v2Id === lightId);
      const lightName = light?.name || 'Unknown';
      const v1Id = light?.id || 'N/A';

      console.log(`  Channel ${channel.channel_id}:`);
      console.log(`    Light V2 ID: ${lightId}`);
      console.log(`    Light V1 ID: ${v1Id}`);
      console.log(`    Light Name:  ${lightName}`);
      console.log(`    Position:    x=${channel.position?.x?.toFixed(2)}, y=${channel.position?.y?.toFixed(2)}, z=${channel.position?.z?.toFixed(2)}`);
    }

    // Now test StreamingRouter gradient detection
    console.log(`\n--- StreamingRouter Gradient Detection ---`);
    const router = new StreamingRouter();
    router.setChannelMappings(channelMappings);

    // Group channels by light ID to show what the router sees
    const lightChannelGroups = new Map<string, number[]>();
    for (const mapping of channelMappings) {
      const existing = lightChannelGroups.get(mapping.lightId) || [];
      existing.push(mapping.channelId);
      lightChannelGroups.set(mapping.lightId, existing);
    }

    console.log('\nChannels grouped by Light ID:');
    for (const [lightId, channels] of lightChannelGroups) {
      const light = lights.find(l => l.v2Id === lightId);
      console.log(`  ${lightId.substring(0, 8)}... (${light?.name || 'Unknown'})`);
      console.log(`    Channels: [${channels.join(', ')}]`);
      console.log(`    Detected as gradient: ${router.isGradientLight(lightId)}`);
      console.log(`    Segment count: ${router.getGradientSegmentCount(lightId)}`);
    }

    // Show the issue
    console.log('\n--- Analysis ---');
    const uniqueLightIds = new Set(channelMappings.map(m => m.lightId));

    if (uniqueLightIds.size === channelMappings.length && channelMappings.length > 1) {
      console.log('⚠️  ISSUE DETECTED: Each channel maps to a DIFFERENT light ID');
      console.log('   This means Hue treats each segment as a separate "light"');
      console.log('   The StreamingRouter will NOT detect this as a gradient light');
      console.log('');
      console.log('   When you call setLightRgb(lightId), only ONE channel is controlled.');
      console.log('');
      console.log('   SOLUTIONS:');
      console.log('   1. Use the V1 light ID (e.g., "6") and map all V2 segment IDs to it');
      console.log('   2. Control all 3 channels explicitly via setChannelRgb()');
      console.log('   3. Modify the gradient detection to group by V1 ID instead of V2 ID');
    } else if (uniqueLightIds.size < channelMappings.length) {
      console.log('✓ Gradient light correctly detected');
      console.log(`  ${channelMappings.length} channels grouped under ${uniqueLightIds.size} light(s)`);
    } else {
      console.log('Single-channel lights only, no gradient detection needed');
    }
  }

  console.log('\n=== Diagnostic Complete ===');
}

main().catch(console.error);
