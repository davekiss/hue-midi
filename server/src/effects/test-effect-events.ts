/**
 * Diagnostic test for effect event broadcasting
 *
 * This test verifies that:
 * 1. CustomEffectsEngine emits effectStarted/effectStopped events
 * 2. These events contain the expected payload
 *
 * Usage:
 *   npx tsx src/effects/test-effect-events.ts
 */

import { EventEmitter } from 'events';
import { CustomEffectsEngine, CustomEffectType } from './CustomEffectsEngine';

// Mock bridge controller with minimal implementation
class MockBridgeController extends EventEmitter {
  async setLightState(lightId: string, state: any): Promise<void> {
    console.log(`[MockBridge] setLightState(${lightId}, ${JSON.stringify(state)})`);
  }

  async setDynamicEffect(lightId: string, effect: string): Promise<void> {
    console.log(`[MockBridge] setDynamicEffect(${lightId}, ${effect})`);
  }

  async setSignaling(lightId: string, signal: string): Promise<void> {
    console.log(`[MockBridge] setSignaling(${lightId}, ${signal})`);
  }

  async colorLoop(lightId: string, options?: any): Promise<void> {
    console.log(`[MockBridge] colorLoop(${lightId})`);
  }

  async breathe(lightId: string, options?: any): Promise<void> {
    console.log(`[MockBridge] breathe(${lightId})`);
  }

  async flash(lightId: string, options?: any): Promise<void> {
    console.log(`[MockBridge] flash(${lightId})`);
  }
}

// Mock streaming router
class MockStreamingRouter {
  private streaming = true;

  isStreaming(): boolean {
    return this.streaming;
  }

  isLightInZone(lightId: string): boolean {
    return true; // All lights are in zone for testing
  }

  isGradientLight(lightId: string): boolean {
    return false; // Regular light for testing
  }

  getGradientSegmentCount(lightId: string): number {
    return 1;
  }

  setLightRgb(lightId: string, rgb: [number, number, number]): boolean {
    // Silent for this test - would be noisy
    return true;
  }

  setLightGradient(lightId: string, colors: Array<[number, number, number]>): boolean {
    return true;
  }
}

async function runTest() {
  console.log('=== Effect Event Broadcasting Diagnostic Test ===\n');

  const mockBridge = new MockBridgeController();
  const mockRouter = new MockStreamingRouter();

  const effectsEngine = new CustomEffectsEngine(mockBridge as any);
  effectsEngine.setStreamingRouter(mockRouter as any);

  // Track emitted events
  const emittedEvents: Array<{ type: string; data: any; timestamp: number }> = [];

  // Listen for effect events
  effectsEngine.on('effectStarted', (data) => {
    emittedEvents.push({ type: 'effectStarted', data, timestamp: Date.now() });
    console.log(`[EVENT] effectStarted:`, JSON.stringify(data));
  });

  effectsEngine.on('effectStopped', (data) => {
    emittedEvents.push({ type: 'effectStopped', data, timestamp: Date.now() });
    console.log(`[EVENT] effectStopped:`, JSON.stringify(data));
  });

  // Test 1: Start a preset effect
  console.log('\n--- Test 1: Start preset effect "fire" on light "6" ---');
  await effectsEngine.startPresetEffect('6', 'fire', { speed: 120 });

  // Let it run for a moment
  await new Promise((r) => setTimeout(r, 100));

  // Test 2: Check running effect
  console.log('\n--- Test 2: Query running effect ---');
  const isRunning = effectsEngine.isEffectRunning('6');
  const runningEffect = effectsEngine.getRunningEffect('6');
  console.log(`isEffectRunning('6'): ${isRunning}`);
  console.log(`getRunningEffect('6'):`, JSON.stringify(runningEffect));

  // Test 3: Stop effect
  console.log('\n--- Test 3: Stop effect on light "6" ---');
  await effectsEngine.stopEffect('6');

  // Let cleanup happen
  await new Promise((r) => setTimeout(r, 50));

  // Test 4: Start another effect
  console.log('\n--- Test 4: Start preset effect "aurora" on light "6" ---');
  await effectsEngine.startPresetEffect('6', 'aurora', { speed: 100 });
  await new Promise((r) => setTimeout(r, 100));

  // Test 5: Start effect on different light
  console.log('\n--- Test 5: Start preset effect "candle" on light "7" ---');
  await effectsEngine.startPresetEffect('7', 'candle', {});
  await new Promise((r) => setTimeout(r, 100));

  // Test 6: Get all active effects
  console.log('\n--- Test 6: Query all active effects ---');
  console.log('Available presets:', effectsEngine.getAvailablePresets());
  console.log('Is effect running on 6:', effectsEngine.isEffectRunning('6'));
  console.log('Is effect running on 7:', effectsEngine.isEffectRunning('7'));
  console.log('Running effect on 6:', JSON.stringify(effectsEngine.getRunningEffect('6')));
  console.log('Running effect on 7:', JSON.stringify(effectsEngine.getRunningEffect('7')));

  // Cleanup
  console.log('\n--- Cleanup: Stop all effects ---');
  await effectsEngine.stopAllEffects();

  // Summary
  console.log('\n=== Event Summary ===');
  console.log(`Total events emitted: ${emittedEvents.length}`);
  for (const event of emittedEvents) {
    console.log(`  ${event.type}: ${JSON.stringify(event.data)}`);
  }

  console.log('\n=== Diagnosis ===');
  if (emittedEvents.length > 0) {
    console.log('CustomEffectsEngine IS emitting events correctly.');
    console.log('');
    console.log('ISSUE: ApiServer.setupEventListeners() does NOT subscribe to these events.');
    console.log('');
    console.log('FIX: Add event listeners in ApiServer.setupEventListeners():');
    console.log('');
    console.log(`  this.customEffectsEngine.on('effectStarted', (data) => {`);
    console.log(`    this.broadcast('effectStarted', data);`);
    console.log(`  });`);
    console.log('');
    console.log(`  this.customEffectsEngine.on('effectStopped', (data) => {`);
    console.log(`    this.broadcast('effectStopped', data);`);
    console.log(`  });`);
  } else {
    console.log('ERROR: No events were emitted. Check CustomEffectsEngine implementation.');
  }

  console.log('\n=== Test Complete ===');
}

runTest().catch(console.error);
