/**
 * Test instant transitions for BLE Hue lights
 * Experimenting with different approaches to eliminate fade/transition time
 */

import noble from '@abandonware/noble';

// Standard characteristics
const UUID_POWER = '932c32bd000247a2835aa8d455b859dd';
const UUID_BRIGHTNESS = '932c32bd000347a2835aa8d455b859dd';
const UUID_COLOR = '932c32bd000547a2835aa8d455b859dd';

// Advanced characteristics (TLV format)
const UUID_ADVANCED_CONTROL = '932c32bd000747a2835aa8d455b859dd';

const LIGHT_MAC = 'e5ec2c5c656d5fe91e634443ed6e9d5e';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testInstantTransitions() {
  console.log('[TEST] Testing instant transition methods...\n');

  return new Promise<void>((resolve, reject) => {
    let peripheral: any = null;
    let brightnessChar: any = null;
    let colorChar: any = null;
    let advancedChar: any = null;

    noble.on('stateChange', async (state) => {
      if (state === 'poweredOn') {
        console.log('[TEST] Bluetooth powered on, starting scan...');
        await noble.startScanningAsync([], false);
      }
    });

    noble.on('discover', async (discoveredPeripheral) => {
      const id = discoveredPeripheral.id || discoveredPeripheral.address || '';
      const normalizedId = id.toLowerCase().replace(/:/g, '');
      const normalizedTarget = LIGHT_MAC.toLowerCase().replace(/:/g, '');

      if (normalizedId === normalizedTarget) {
        console.log(`[TEST] ✓ Found target light: ${discoveredPeripheral.advertisement.localName}\n`);

        peripheral = discoveredPeripheral;
        await noble.stopScanningAsync();

        try {
          // Connect
          console.log('[TEST] Connecting...');
          await peripheral.connectAsync();
          console.log('[TEST] ✓ Connected\n');

          // Discover all characteristics
          console.log('[TEST] Discovering characteristics...');
          const { services, characteristics } = await peripheral.discoverAllServicesAndCharacteristicsAsync();

          // Find our characteristics
          brightnessChar = characteristics.find((c: any) => c.uuid === UUID_BRIGHTNESS);
          colorChar = characteristics.find((c: any) => c.uuid === UUID_COLOR);
          advancedChar = characteristics.find((c: any) => c.uuid === UUID_ADVANCED_CONTROL);

          console.log(`[TEST] Brightness characteristic: ${brightnessChar ? 'FOUND' : 'MISSING'}`);
          console.log(`[TEST] Color characteristic: ${colorChar ? 'FOUND' : 'MISSING'}`);
          console.log(`[TEST] Advanced control characteristic: ${advancedChar ? 'FOUND' : 'MISSING'}\n`);

          // METHOD 1: Try writing brightness with transition time byte appended
          console.log('=== METHOD 1: Append transition time to standard write ===');
          if (brightnessChar) {
            try {
              console.log('[TEST] Setting brightness=50% with 2-byte format [brightness, transitionTime=0]');
              const brightness50 = Math.round(50 * 0xfd / 100 + 1);
              await brightnessChar.writeAsync(Buffer.from([brightness50, 0x00]), false);
              console.log('[TEST] ✓ Write completed');
              await sleep(1000);
            } catch (e: any) {
              console.log(`[TEST] ✗ Failed: ${e.message}\n`);
            }
          }

          // METHOD 2: Try TLV format on advanced characteristic
          console.log('=== METHOD 2: TLV format on advanced characteristic ===');
          if (advancedChar) {
            try {
              // TLV format: [type, length, value...]
              // Type 0x02 = brightness
              // Trying: [0x02, 0x02, brightness_value, transition_time]
              console.log('[TEST] Setting brightness=100% using TLV format with transition=0');
              const brightness100 = Math.round(100 * 0xfd / 100 + 1);
              const tlvCommand = Buffer.from([
                0x02,           // Type: brightness
                0x02,           // Length: 2 bytes
                brightness100,  // Brightness value
                0x00            // Transition time: 0 (instant)
              ]);
              console.log(`[TEST] TLV command: ${tlvCommand.toString('hex')}`);
              await advancedChar.writeAsync(tlvCommand, false);
              console.log('[TEST] ✓ Write completed');
              await sleep(1000);
            } catch (e: any) {
              console.log(`[TEST] ✗ Failed: ${e.message}\n`);
            }

            // Try another TLV format
            try {
              console.log('[TEST] Setting brightness=25% using alternate TLV format');
              const brightness25 = Math.round(25 * 0xfd / 100 + 1);
              const tlvCommand = Buffer.from([
                0x02,          // Type: brightness
                0x01,          // Length: 1 byte
                brightness25,  // Brightness value
                0x08,          // Type: timing param (from gist)
                0x01,          // Length: 1 byte
                0x00           // Value: 0 (instant)
              ]);
              console.log(`[TEST] TLV command: ${tlvCommand.toString('hex')}`);
              await advancedChar.writeAsync(tlvCommand, false);
              console.log('[TEST] ✓ Write completed');
              await sleep(1000);
            } catch (e: any) {
              console.log(`[TEST] ✗ Failed: ${e.message}\n`);
            }
          }

          // METHOD 3: Rapid consecutive writes (override default transition)
          console.log('=== METHOD 3: Rapid consecutive writes ===');
          if (brightnessChar) {
            try {
              console.log('[TEST] Rapidly changing brightness 75% -> 25% -> 75%');
              const brightness75 = Math.round(75 * 0xfd / 100 + 1);
              const brightness25 = Math.round(25 * 0xfd / 100 + 1);

              await brightnessChar.writeAsync(Buffer.from([brightness75]), false);
              console.log('[TEST] ✓ Set 75%');
              await sleep(50); // Very short delay

              await brightnessChar.writeAsync(Buffer.from([brightness25]), false);
              console.log('[TEST] ✓ Set 25%');
              await sleep(50);

              await brightnessChar.writeAsync(Buffer.from([brightness75]), false);
              console.log('[TEST] ✓ Set 75%');
              await sleep(1000);
            } catch (e: any) {
              console.log(`[TEST] ✗ Failed: ${e.message}\n`);
            }
          }

          // METHOD 4: Try color changes with different formats
          console.log('=== METHOD 4: Color with extended format ===');
          if (colorChar) {
            try {
              console.log('[TEST] Setting color to RED with standard 4-byte format');
              // Standard format: 4 bytes for XY color
              const red = Buffer.from([0xA9, 0x67, 0x5C, 0x32]); // Red in XY format
              await colorChar.writeAsync(red, false);
              console.log('[TEST] ✓ Write completed');
              await sleep(1000);

              console.log('[TEST] Setting color to BLUE with 5-byte format [color(4), transition(1)]');
              const blue = Buffer.from([0x88, 0x1E, 0x71, 0x0B, 0x00]); // Blue + instant
              await colorChar.writeAsync(blue, false);
              console.log('[TEST] ✓ Write completed');
              await sleep(1000);
            } catch (e: any) {
              console.log(`[TEST] ✗ Failed: ${e.message}\n`);
            }
          }

          console.log('[TEST] Tests complete! Disconnecting...');
          await peripheral.disconnectAsync();
          console.log('[TEST] ✓ Disconnected\n');

          resolve();

        } catch (error: any) {
          console.error(`[TEST] ✗ Error: ${error.message}`);
          if (peripheral) {
            try {
              await peripheral.disconnectAsync();
            } catch (e) {
              // ignore
            }
          }
          reject(error);
        }
      }
    });

    setTimeout(() => {
      noble.stopScanning();
      reject(new Error('Timeout waiting for light'));
    }, 30000);
  });
}

testInstantTransitions()
  .then(() => {
    console.log('[TEST] All tests completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[TEST] Test failed:', error);
    process.exit(1);
  });
