/**
 * Direct BLE test using noble - minimal implementation
 * Based on the Python hueble library
 */

import noble from '@abandonware/noble';

// UUIDs from the Python library
const UUID_POWER = '932c32bd000247a2835aa8d455b859dd';
const UUID_BRIGHTNESS = '932c32bd000347a2835aa8d455b859dd';
const UUID_HUE_IDENTIFIER = '0000fe0f000010008000000080805f9b34fb';

const LIGHT_MAC = 'e5ec2c5c656d5fe91e634443ed6e9d5e'; // Your light's MAC

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testLight() {
  console.log('[TEST] Starting direct BLE test...\n');

  return new Promise<void>((resolve, reject) => {
    let peripheral: any = null;
    let powerCharacteristic: any = null;

    // Start scanning when Bluetooth is ready
    noble.on('stateChange', async (state) => {
      if (state === 'poweredOn') {
        console.log('[TEST] Bluetooth powered on, starting scan...');
        await noble.startScanningAsync([], false);
      }
    });

    // When we discover a device
    noble.on('discover', async (discoveredPeripheral) => {
      const id = discoveredPeripheral.id || discoveredPeripheral.address || '';
      const normalizedId = id.toLowerCase().replace(/:/g, '');
      const normalizedTarget = LIGHT_MAC.toLowerCase().replace(/:/g, '');

      if (normalizedId === normalizedTarget) {
        console.log(`[TEST] ✓ Found target light: ${discoveredPeripheral.advertisement.localName}`);

        peripheral = discoveredPeripheral;
        await noble.stopScanningAsync();

        try {
          // Connect
          console.log('[TEST] Connecting...');
          await peripheral.connectAsync();
          console.log('[TEST] ✓ Connected');

          // Check pairing status and pair if needed
          console.log('[TEST] Checking pairing status...');
          // On macOS, noble doesn't expose paired status directly
          // but we can try to read a characteristic to see if we need to pair

          // Discover services and characteristics
          console.log('[TEST] Discovering services...');
          const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
            [],
            [UUID_POWER, UUID_BRIGHTNESS]
          );

          powerCharacteristic = characteristics.find((c: any) => c.uuid === UUID_POWER);

          if (!powerCharacteristic) {
            throw new Error('Power characteristic not found!');
          }

          console.log('[TEST] ✓ Found power characteristic\n');

          // Try to trigger pairing by attempting a read
          console.log('[TEST] Attempting to trigger pairing (this may show a system dialog)...');
          console.log('[TEST] Please accept any pairing requests that appear!\n');

          let paired = false;
          try {
            // First read attempt - this should trigger OS-level pairing if needed
            const testRead = await powerCharacteristic.readAsync();
            console.log(`[TEST] ✓ Read successful - device appears to be paired (got ${testRead ? testRead.length : 0} bytes)\n`);
            paired = true;
          } catch (e: any) {
            console.log(`[TEST] ! Initial read failed: ${e.message}`);
            console.log(`[TEST] ! This might mean pairing is required\n`);

            // Wait a moment and try again
            console.log('[TEST] Waiting 2 seconds for pairing...');
            await sleep(2000);

            try {
              const retryRead = await powerCharacteristic.readAsync();
              console.log(`[TEST] ✓ Retry successful - device is now paired\n`);
              paired = true;
            } catch (e2: any) {
              console.log(`[TEST] ✗ Retry also failed: ${e2.message}`);
              console.log(`[TEST] ! You may need to pair this device through macOS Bluetooth settings first\n`);
            }
          }

          if (!paired) {
            console.log('[TEST] ! Warning: Device may not be properly paired. Continuing anyway...\n');
          }

          // TEST 1: Read initial state
          console.log('[TEST] Step 1: Reading initial power state...');
          try {
            const initialData = await powerCharacteristic.readAsync();
            const initialState = initialData && initialData[0] === 1;
            console.log(`[TEST] ✓ Initial state: ${initialState ? 'ON' : 'OFF'} (raw: ${initialData ? initialData[0] : 'undefined'})\n`);
          } catch (e: any) {
            console.log(`[TEST] ✗ Could not read initial state: ${e.message}\n`);
          }

          // TEST 2: Turn ON
          console.log('[TEST] Step 2: Turning light ON...');
          await powerCharacteristic.writeAsync(Buffer.from([0x01]), false);
          console.log('[TEST] ✓ Wrote ON command');

          await sleep(500);

          try {
            const onData = await powerCharacteristic.readAsync();
            const onState = onData[0] === 1;
            console.log(`[TEST] ${onState ? '✓' : '✗'} Verified state: ${onState ? 'ON' : 'OFF'} (expected: ON)\n`);
          } catch (e: any) {
            console.log(`[TEST] ✗ Could not verify ON state: ${e.message}\n`);
          }

          await sleep(2000);

          // TEST 3: Turn OFF
          console.log('[TEST] Step 3: Turning light OFF...');
          await powerCharacteristic.writeAsync(Buffer.from([0x00]), false);
          console.log('[TEST] ✓ Wrote OFF command');

          await sleep(500);

          try {
            const offData = await powerCharacteristic.readAsync();
            const offState = offData[0] === 1;
            console.log(`[TEST] ${!offState ? '✓' : '✗'} Verified state: ${offState ? 'ON' : 'OFF'} (expected: OFF)\n`);
          } catch (e: any) {
            console.log(`[TEST] ✗ Could not verify OFF state: ${e.message}\n`);
          }

          await sleep(2000);

          // TEST 4: Turn ON again
          console.log('[TEST] Step 4: Turning light ON again...');
          await powerCharacteristic.writeAsync(Buffer.from([0x01]), false);
          console.log('[TEST] ✓ Wrote ON command');

          await sleep(500);

          try {
            const onData = await powerCharacteristic.readAsync();
            const onState = onData[0] === 1;
            console.log(`[TEST] ${onState ? '✓' : '✗'} Verified state: ${onState ? 'ON' : 'OFF'} (expected: ON)\n`);
          } catch (e: any) {
            console.log(`[TEST] ✗ Could not verify ON state: ${e.message}\n`);
          }

          console.log('[TEST] Test complete! Disconnecting...');
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

    // Timeout after 30 seconds
    setTimeout(() => {
      noble.stopScanning();
      reject(new Error('Timeout waiting for light'));
    }, 30000);
  });
}

// Run the test
testLight()
  .then(() => {
    console.log('[TEST] All tests completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[TEST] Test failed:', error);
    process.exit(1);
  });
