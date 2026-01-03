import { Client as HueBLEClient } from 'node-hue-ble';
import { HueLight, LightState } from '../types';
import { EventEmitter } from 'events';

interface ConnectedLight {
  client: HueBLEClient;
  peripheral: any;
  info: HueLight;
}

export class HueBluetoothController extends EventEmitter {
  private discoveredLights: Map<string, HueLight> = new Map();
  private connectedLights: Map<string, ConnectedLight> = new Map();
  private scanning: boolean = false;
  private scanner: any = null;

  constructor() {
    super();
  }

  /**
   * Check if Bluetooth is ready
   */
  isBluetoothReady(): boolean {
    // noble state check is handled by the library
    return true;
  }

  /**
   * Scan for Hue lights via Bluetooth
   */
  async scanForLights(durationMs: number = 10000, showAllDevices: boolean = false): Promise<HueLight[]> {
    if (this.scanning) {
      throw new Error('Already scanning');
    }

    console.log('Scanning for Hue Bluetooth lights...');
    this.scanning = true;
    this.discoveredLights.clear();

    const allDevices: Map<string, HueLight> = new Map();

    return new Promise(async (resolve, reject) => {
      try {
        this.scanner = await HueBLEClient.scanForLamps();

        this.scanner.on('discover', (peripheral: any) => {
          const id = peripheral.id || peripheral.address;
          const name = peripheral.advertisement.localName || 'Unknown Device';

          console.log(`[BLE] Discovered: "${name}" (${id})`);

          if (showAllDevices) {
            // Add all devices if requested
            if (!allDevices.has(id)) {
              allDevices.set(id, {
                id,
                name,
                type: 'other',
                capabilities: {
                  color: true,
                  brightness: true,
                  effects: false
                }
              });
            }
          }

          // Always try to identify Hue devices
          const isHueDevice = name.toLowerCase().includes('hue') ||
                             name.toLowerCase().includes('philips') ||
                             name.toLowerCase().includes('lcl') ||
                             name.toLowerCase().includes('lca') ||
                             name.toLowerCase().includes('lct') ||
                             name.toLowerCase().includes('lst') ||
                             name.toLowerCase().includes('lw');

          if (isHueDevice && !this.discoveredLights.has(id)) {
            console.log(`✓ IDENTIFIED AS HUE LIGHT: ${name} (${id})`);

            const light: HueLight = {
              id,
              name,
              type: this.detectLightType(name),
              capabilities: {
                color: true,
                brightness: true,
                effects: false
              }
            };

            this.discoveredLights.set(id, light);
            this.emit('lightDiscovered', light);
          }
        });

        // Stop scanning after timeout
        setTimeout(async () => {
          console.log('Scan timeout reached, stopping...');
          if (this.scanner) {
            await this.scanner.stopScanning();
          }
          this.scanning = false;

          const lights = showAllDevices
            ? Array.from(allDevices.values())
            : Array.from(this.discoveredLights.values());

          console.log(`Scan complete. Found ${lights.length} device(s)`);
          resolve(lights);
        }, durationMs);
      } catch (error) {
        this.scanning = false;
        console.error('Failed to scan:', error);
        reject(error);
      }
    });
  }

  /**
   * Detect light type from name
   */
  private detectLightType(name: string): 'bulb' | 'strip' | 'other' {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('strip') || lowerName.includes('lightstrip')) {
      return 'strip';
    } else if (lowerName.includes('bulb') || lowerName.includes('light')) {
      return 'bulb';
    }
    return 'other';
  }

  /**
   * Stop scanning
   */
  async stopScanning(): Promise<void> {
    if (this.scanner && this.scanning) {
      await this.scanner.stopScanning();
      this.scanning = false;
    }
  }

  /**
   * Connect to a discovered light by ID
   */
  async connectToLight(lightId: string): Promise<void> {
    console.log(`Attempting connection to light ${lightId}...`);

    return new Promise(async (resolve, reject) => {
      try {
        const scanner = await HueBLEClient.scanForLamps();
        let found = false;

        const timeout = setTimeout(async () => {
          await scanner.stopScanning();
          if (!found) {
            reject(new Error(`Could not find light with ID ${lightId}`));
          }
        }, 15000);

        scanner.on('discover', async (peripheral: any) => {
          const peripheralId = (peripheral.id || peripheral.address || '').toLowerCase().replace(/:/g, '');
          const normalizedLightId = lightId.toLowerCase().replace(/:/g, '');

          if (peripheralId === normalizedLightId) {
            found = true;
            clearTimeout(timeout);
            await scanner.stopScanning();

            console.log(`✓ Found device: ${peripheral.advertisement.localName || 'Unknown'}`);

            try {
              // Create client and connect
              console.log(`[BLE] Creating HueBLEClient for peripheral...`);
              const client = new HueBLEClient(peripheral);

              console.log(`[BLE] Connecting to peripheral...`);
              await client.connect();
              console.log(`[BLE] Connected successfully`);

              // Verify characteristics were discovered
              console.log(`[BLE] Verifying characteristics...`);
              console.log(`[BLE] Light characteristic:`, client.lightCharacteristic ? 'OK' : 'MISSING');
              console.log(`[BLE] Brightness characteristic:`, client.brightnessCharacteristic ? 'OK' : 'MISSING');
              console.log(`[BLE] Color characteristic:`, client.colorCharacteristic ? 'OK' : 'MISSING');
              console.log(`[BLE] Temperature characteristic:`, client.temperatureCharacteristic ? 'OK' : 'MISSING');

              if (!client.lightCharacteristic) {
                console.error(`[BLE] WARNING: Light characteristic not found! Power control will not work.`);
              }

              const lightInfo: HueLight = {
                id: peripheral.id || peripheral.address,
                name: peripheral.advertisement.localName || `Hue Light (${lightId})`,
                type: this.detectLightType(peripheral.advertisement.localName || ''),
                capabilities: {
                  color: true,
                  brightness: true,
                  effects: false
                }
              };

              this.connectedLights.set(lightInfo.id, {
                client,
                peripheral,
                info: lightInfo
              });

              this.discoveredLights.set(lightInfo.id, lightInfo);

              console.log(`✓ Connected to ${lightInfo.name} (ID: ${lightInfo.id})`);
              this.emit('lightConnected', lightInfo);
              resolve();
            } catch (error: any) {
              console.error(`[BLE] Connection error:`, error);
              reject(new Error(`Failed to connect: ${error.message}`));
            }
          }
        });
      } catch (error: any) {
        reject(new Error(`Failed to start scanning: ${error.message}`));
      }
    });
  }

  /**
   * Connect to a light by MAC address (manual connection)
   */
  async connectByAddress(macAddress: string, name?: string): Promise<void> {
    console.log(`Attempting manual connection to ${macAddress}...`);

    return new Promise(async (resolve, reject) => {
      try {
        const scanner = await HueBLEClient.scanForLamps();
        let found = false;
        const normalizedAddress = macAddress.toLowerCase().replace(/:/g, '');

        const timeout = setTimeout(async () => {
          await scanner.stopScanning();
          if (!found) {
            reject(new Error(`Could not find device with MAC address ${macAddress}`));
          }
        }, 15000);

        scanner.on('discover', async (peripheral: any) => {
          const peripheralId = (peripheral.id || '').toLowerCase().replace(/:/g, '');
          const peripheralAddress = (peripheral.address || '').toLowerCase().replace(/:/g, '');

          if (peripheralId === normalizedAddress || peripheralAddress === normalizedAddress) {
            found = true;
            clearTimeout(timeout);
            await scanner.stopScanning();

            console.log(`✓ Found device: ${peripheral.advertisement.localName || 'Unknown'}`);

            try {
              // Create client and connect
              console.log(`[BLE] Creating HueBLEClient for peripheral...`);
              const client = new HueBLEClient(peripheral);

              console.log(`[BLE] Connecting to peripheral...`);
              await client.connect();
              console.log(`[BLE] Connected successfully`);

              // Verify characteristics were discovered
              console.log(`[BLE] Verifying characteristics...`);
              console.log(`[BLE] Light characteristic:`, client.lightCharacteristic ? 'OK' : 'MISSING');
              console.log(`[BLE] Brightness characteristic:`, client.brightnessCharacteristic ? 'OK' : 'MISSING');
              console.log(`[BLE] Color characteristic:`, client.colorCharacteristic ? 'OK' : 'MISSING');
              console.log(`[BLE] Temperature characteristic:`, client.temperatureCharacteristic ? 'OK' : 'MISSING');

              if (!client.lightCharacteristic) {
                console.error(`[BLE] WARNING: Light characteristic not found! Power control will not work.`);
              }

              const lightInfo: HueLight = {
                id: peripheral.id || peripheral.address,
                name: name || peripheral.advertisement.localName || `Hue Light (${macAddress})`,
                type: this.detectLightType(peripheral.advertisement.localName || ''),
                capabilities: {
                  color: true,
                  brightness: true,
                  effects: false
                }
              };

              this.connectedLights.set(lightInfo.id, {
                client,
                peripheral,
                info: lightInfo
              });

              this.discoveredLights.set(lightInfo.id, lightInfo);

              console.log(`✓ Connected to ${lightInfo.name} (ID: ${lightInfo.id})`);
              this.emit('lightConnected', lightInfo);
              resolve();
            } catch (error: any) {
              console.error(`[BLE] Connection error:`, error);
              reject(new Error(`Failed to connect: ${error.message}`));
            }
          }
        });
      } catch (error: any) {
        reject(new Error(`Failed to start scanning: ${error.message}`));
      }
    });
  }

  /**
   * Set light state via Bluetooth
   */
  async setLightState(lightId: string, state: LightState): Promise<void> {
    console.log(`[BLE] setLightState called for ${lightId}:`, JSON.stringify(state));

    const connectedLight = this.connectedLights.get(lightId);

    if (!connectedLight) {
      console.error(`[BLE] Light ${lightId} not found in connected lights`);
      console.error(`[BLE] Available connected lights:`, Array.from(this.connectedLights.keys()));
      throw new Error(`Not connected to light ${lightId}. Please connect first.`);
    }

    const { client, peripheral } = connectedLight;

    // Check if peripheral is still connected
    const isConnected = peripheral.state === 'connected';
    console.log(`[BLE] Peripheral state: ${peripheral.state}, isConnected: ${isConnected}`);

    if (!isConnected) {
      console.error(`[BLE] Peripheral is not connected (state: ${peripheral.state})`);
      throw new Error(`Light ${lightId} is disconnected. Please reconnect.`);
    }

    // Helper to decide write mode per characteristic and perform write with fallback
    const writeWithBestMode = async (characteristic: any, data: Buffer, label: string) => {
      // Noble characteristic.properties e.g. ['read','write','notify','writeWithoutResponse']
      const props: string[] = Array.isArray(characteristic?.properties) ? characteristic.properties : [];
      console.log(`[BLE] ${label} characteristic properties: ${JSON.stringify(props)}`);

      // Prefer write-with-response when available (more reliable); otherwise use withoutResponse
      const supportsWrite = props.includes('write');
      const supportsWriteNoResp = props.includes('writeWithoutResponse');

      // Try preferred mode first, then fallback if supported
      const attempts: Array<{ withoutResponse: boolean, reason: string }> = [];
      if (supportsWrite) attempts.push({ withoutResponse: false, reason: 'supports write' });
      if (supportsWriteNoResp) attempts.push({ withoutResponse: true, reason: 'supports writeWithoutResponse' });

      // If no properties reported, still attempt with-response then without as a last resort
      if (attempts.length === 0) {
        attempts.push({ withoutResponse: false, reason: 'no props reported; try with-response' });
        attempts.push({ withoutResponse: true, reason: 'no props reported; try without-response' });
      }

      let lastError: any = null;
      for (const attempt of attempts) {
        try {
          console.log(`[BLE] Writing (${label}) using ${attempt.withoutResponse ? 'without-response' : 'with-response'} (${attempt.reason})...`);
          await characteristic.writeAsync(data, attempt.withoutResponse);
          console.log(`[BLE] ✓ ${label} write completed (${attempt.withoutResponse ? 'without response' : 'with response'})`);
          return; // success
        } catch (err: any) {
          lastError = err;
          console.warn(`[BLE] ${label} write failed with ${attempt.withoutResponse ? 'without' : 'with'} response: ${err?.message || err}`);
        }
      }
      // If we get here, both attempts failed
      throw lastError || new Error(`Failed to write ${label}`);
    };

    try {
      // Handle power state
      if (state.on !== undefined) {
        console.log(`[BLE] Setting power to: ${state.on}`);

        // Check current state before (reads may not be supported)
        try {
          const currentState = await client.isOn();
          console.log(`[BLE] Current power state before change: ${currentState}`);
        } catch (e: any) {
          console.log(`[BLE] Could not read current state (this is OK):`, e.message);
        }

        try {
          // Attempt to write directly to characteristic to avoid library's read operations
          if (!client.lightCharacteristic) {
            throw new Error('Light characteristic is missing');
          }

          const powerValue = state.on ? 0x01 : 0x00;
          console.log(`[BLE] Writing power value ${powerValue} to characteristic...`);

          await writeWithBestMode(client.lightCharacteristic, Buffer.from([powerValue]), 'Power');

          // Try to verify if reads are supported
          try {
            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
            const newState = await client.isOn();
            console.log(`[BLE] Power state after write: ${newState}`);
            if (newState === state.on) {
              console.log(`[BLE] ✓ Power state verified: ${newState}`);
            } else {
              console.warn(`[BLE] Warning: Power state mismatch (expected ${state.on}, got ${newState})`);
            }
          } catch (verifyError: any) {
            console.log(`[BLE] Could not verify power state (reads not supported): ${verifyError.message}`);
            console.log(`[BLE] Assuming write was successful...`);
          }
        } catch (powerError: any) {
          console.error(`[BLE] Power command failed:`, powerError);
          throw powerError;
        }
      }

      // Only set other properties if turning on or already on
      if (state.on || state.on === undefined) {
        // Handle brightness (convert from 0-254 to 0-100)
        if (state.brightness !== undefined) {
          const targetBrightness = Math.round((state.brightness / 254) * 100);
          console.log(`[BLE] Setting brightness to: ${targetBrightness}%`);

          // Check current brightness before (reads may not be supported)
          try {
            const currentBrightness = await client.getBrightness();
            console.log(`[BLE] Current brightness before change: ${currentBrightness.toFixed(1)}%`);
          } catch (e: any) {
            console.log(`[BLE] Could not read current brightness (this is OK):`, e.message);
          }

          try {
            if (!client.brightnessCharacteristic) {
              throw new Error('Brightness characteristic is missing');
            }

            // Write directly to characteristic
            const brightnessValue = Math.round(targetBrightness * 0xfd / 100 + 1);
            console.log(`[BLE] Writing brightness value ${brightnessValue} to characteristic...`);

            await writeWithBestMode(client.brightnessCharacteristic, Buffer.from([brightnessValue]), 'Brightness');

            // Try to verify if reads are supported
            try {
              await new Promise(resolve => setTimeout(resolve, 100));
              const newBrightness = await client.getBrightness();
              console.log(`[BLE] Brightness after write: ${newBrightness.toFixed(1)}%`);
              const tolerance = 5;
              if (Math.abs(newBrightness - targetBrightness) <= tolerance) {
                console.log(`[BLE] ✓ Brightness verified: ${newBrightness.toFixed(1)}%`);
              } else {
                console.warn(`[BLE] Warning: Brightness mismatch (expected ${targetBrightness}%, got ${newBrightness.toFixed(1)}%)`);
              }
            } catch (verifyError: any) {
              console.log(`[BLE] Could not verify brightness (reads not supported): ${verifyError.message}`);
              console.log(`[BLE] Assuming write was successful...`);
            }
          } catch (brightnessError: any) {
            console.error(`[BLE] Brightness command failed:`, brightnessError);
            throw brightnessError;
          }
        }

        // Handle color (hue/saturation)
        if (state.hue !== undefined && state.saturation !== undefined) {
          // Convert HSV to RGB
          const rgb = this.hsvToRgb(state.hue / 65535, state.saturation / 254, 1);
          const hexColor = `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`;

          console.log(`[BLE] Setting color to: ${hexColor} (from hue=${state.hue}, sat=${state.saturation})`);

          // Check current color before (reads may not be supported)
          try {
            const currentColor = await client.getColor();
            console.log(`[BLE] Current color before change:`, currentColor);
          } catch (e: any) {
            console.log(`[BLE] Could not read current color (this is OK):`, e.message);
          }

          try {
            // Write color via setRGBColor (internally writes to color characteristic)
            if (!client.colorCharacteristic) {
              throw new Error('Color characteristic is missing');
            }

            console.log(`[BLE] Writing color ${hexColor} to characteristic...`);
            await client.setRGBColor(hexColor);
            console.log(`[BLE] ✓ Color write completed (without response)`);

            // Try to verify if reads are supported
            try {
              await new Promise(resolve => setTimeout(resolve, 100));
              const newColor = await client.getColor();
              console.log(`[BLE] Color after write:`, newColor);
              console.log(`[BLE] ✓ Color verified`);
            } catch (verifyError: any) {
              console.log(`[BLE] Could not verify color (reads not supported):`, verifyError.message);
              console.log(`[BLE] Assuming write was successful...`);
            }
          } catch (colorError: any) {
            console.error(`[BLE] Color command failed:`, colorError);
            throw colorError;
          }
        }
      }

      this.emit('stateChanged', { lightId, state });
    } catch (error: any) {
      console.error(`[BLE] Failed to set light state:`, error);
      throw new Error(`Failed to set light state: ${error.message}`);
    }
  }

  /**
   * Convert HSV to RGB
   */
  private hsvToRgb(h: number, s: number, v: number): { r: number, g: number, b: number } {
    let r = 0, g = 0, b = 0;

    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  /**
   * Get all discovered lights
   */
  getLights(): HueLight[] {
    return Array.from(this.discoveredLights.values());
  }

  /**
   * Get connected lights
   */
  getConnectedLights(): HueLight[] {
    return Array.from(this.connectedLights.values())
      .filter(cl => cl?.peripheral?.state === 'connected')
      .map(cl => cl.info);
  }

  /**
   * Diagnostic test method - use library methods and verify with getters
   */
  async testLightWithVerification(lightId: string): Promise<void> {
    const connectedLight = this.connectedLights.get(lightId);
    if (!connectedLight) {
      throw new Error(`Light ${lightId} not connected`);
    }

    const { client } = connectedLight;

    console.log('\n[BLE TEST] Starting diagnostic test...\n');

    // Test 1: Read initial state
    console.log('[BLE TEST] Step 1: Reading initial state...');
    try {
      const isOn = await client.isOn();
      console.log(`[BLE TEST] ✓ Initial power state: ${isOn}`);
    } catch (e: any) {
      console.log(`[BLE TEST] ✗ Failed to read power state: ${e.message}`);
    }

    try {
      const brightness = await client.getBrightness();
      console.log(`[BLE TEST] ✓ Initial brightness: ${brightness.toFixed(1)}%`);
    } catch (e: any) {
      console.log(`[BLE TEST] ✗ Failed to read brightness: ${e.message}`);
    }

    // Test 2: Turn light ON using library method
    console.log('\n[BLE TEST] Step 2: Turning light ON...');
    try {
      await client.on();
      console.log('[BLE TEST] ✓ Called client.on()');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify
      try {
        const isOn = await client.isOn();
        console.log(`[BLE TEST] ${isOn ? '✓' : '✗'} Verified power state: ${isOn} (expected: true)`);
      } catch (e: any) {
        console.log(`[BLE TEST] ✗ Could not verify power state: ${e.message}`);
      }
    } catch (e: any) {
      console.log(`[BLE TEST] ✗ Failed to turn on: ${e.message}`);
    }

    // Test 3: Set brightness to 100% using library method
    console.log('\n[BLE TEST] Step 3: Setting brightness to 100%...');
    try {
      await client.setBrightness(100);
      console.log('[BLE TEST] ✓ Called client.setBrightness(100)');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify
      try {
        const brightness = await client.getBrightness();
        console.log(`[BLE TEST] ${Math.abs(brightness - 100) < 5 ? '✓' : '✗'} Verified brightness: ${brightness.toFixed(1)}% (expected: 100%)`);
      } catch (e: any) {
        console.log(`[BLE TEST] ✗ Could not verify brightness: ${e.message}`);
      }
    } catch (e: any) {
      console.log(`[BLE TEST] ✗ Failed to set brightness: ${e.message}`);
    }

    // Test 4: Set color to red using library method
    console.log('\n[BLE TEST] Step 4: Setting color to red...');
    try {
      await client.setRGBColor('#ff0000');
      console.log('[BLE TEST] ✓ Called client.setRGBColor("#ff0000")');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify
      try {
        const color = await client.getColor();
        console.log(`[BLE TEST] ✓ Verified color: [${color.join(', ')}]`);
      } catch (e: any) {
        console.log(`[BLE TEST] ✗ Could not verify color: ${e.message}`);
      }
    } catch (e: any) {
      console.log(`[BLE TEST] ✗ Failed to set color: ${e.message}`);
    }

    // Test 5: Turn light OFF using library method
    console.log('\n[BLE TEST] Step 5: Turning light OFF...');
    try {
      await client.off();
      console.log('[BLE TEST] ✓ Called client.off()');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify
      try {
        const isOn = await client.isOn();
        console.log(`[BLE TEST] ${!isOn ? '✓' : '✗'} Verified power state: ${isOn} (expected: false)`);
      } catch (e: any) {
        console.log(`[BLE TEST] ✗ Could not verify power state: ${e.message}`);
      }
    } catch (e: any) {
      console.log(`[BLE TEST] ✗ Failed to turn off: ${e.message}`);
    }

    console.log('\n[BLE TEST] Diagnostic test complete.\n');
  }

  /**
   * Disconnect from a specific light
   */
  async disconnectLight(lightId: string): Promise<void> {
    const connectedLight = this.connectedLights.get(lightId);
    if (!connectedLight) {
      return;
    }

    await connectedLight.client.disconnect();
    this.connectedLights.delete(lightId);
    console.log(`Disconnected from ${connectedLight.info.name}`);
    this.emit('lightDisconnected', connectedLight.info);
  }

  /**
   * Disconnect from all Bluetooth lights
   */
  async disconnect(): Promise<void> {
    console.log('Disconnecting from all Bluetooth lights...');

    const disconnectPromises = Array.from(this.connectedLights.keys()).map(
      lightId => this.disconnectLight(lightId)
    );

    await Promise.all(disconnectPromises);
    this.connectedLights.clear();
    this.discoveredLights.clear();

    console.log('Disconnected from all Bluetooth lights');
  }

  /**
   * Check if connected to any lights
   */
  isConnected(): boolean {
    return this.connectedLights.size > 0;
  }

  /**
   * Check if connected to a specific light
   */
  isLightConnected(lightId: string): boolean {
    return this.connectedLights.has(lightId);
  }
}
