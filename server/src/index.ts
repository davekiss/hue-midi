import { MidiHandler } from './midi/MidiHandler';
import { HueBridgeController } from './hue/HueBridgeController';
import { HueBluetoothController } from './hue/HueBluetoothController';
import { MappingEngine } from './mapping/MappingEngine';
import { ConfigManager } from './mapping/ConfigManager';
import { ApiServer } from './server/ApiServer';

class HueMidiApp {
  private midiHandler: MidiHandler;
  private bridgeController: HueBridgeController;
  private bluetoothController: HueBluetoothController;
  private mappingEngine: MappingEngine;
  private configManager: ConfigManager;
  private apiServer: ApiServer;

  constructor() {
    // Initialize components
    this.midiHandler = new MidiHandler();
    this.bridgeController = new HueBridgeController();
    this.bluetoothController = new HueBluetoothController();
    this.mappingEngine = new MappingEngine(
      this.bridgeController,
      this.bluetoothController
    );
    this.configManager = new ConfigManager();
    this.apiServer = new ApiServer(
      this.midiHandler,
      this.bridgeController,
      this.bluetoothController,
      this.mappingEngine,
      this.configManager
    );
  }

  async start(): Promise<void> {
    console.log('Starting Hue MIDI Bridge...\n');

    try {
      // Load configuration
      const config = await this.configManager.load();

      // Load scenes
      this.mappingEngine.loadScenes(config.scenes ?? []);
      if (config.scenes && config.scenes.length > 0) {
        console.log(`✓ Loaded ${config.scenes.length} scene(s)\n`);
      }

      // Set connection mode
      this.mappingEngine.setConnectionMode(config.connectionMode);

      // Connect to Hue Bridge if configured
      if (config.connectionMode === 'bridge' && config.bridgeIp && config.bridgeUsername) {
        try {
          await this.bridgeController.connect(config.bridgeIp, config.bridgeUsername);
          console.log('✓ Connected to Hue Bridge\n');
        } catch (error) {
          console.warn('⚠ Could not connect to Hue Bridge. Please configure via web UI.\n');
        }
      }

      // Load mappings
      if (config.mappings.length > 0) {
        this.mappingEngine.loadMappings(config.mappings);
        console.log(`✓ Loaded ${config.mappings.length} MIDI mapping(s)\n`);
      }

      // Open MIDI port
      try {
        if (config.midiPortName) {
          this.midiHandler.openPort(config.midiPortName);
        } else {
          // Create virtual MIDI port for Ableton to connect to
          this.midiHandler.openVirtualPort('Hue MIDI Bridge');
        }
        console.log(`✓ MIDI port opened: ${this.midiHandler.getCurrentPort()}\n`);
      } catch (error) {
        console.warn('⚠ Could not open MIDI port. You can configure it via web UI.\n');
      }

      // Connect MIDI handler to mapping engine
      this.midiHandler.on('note', (message) => {
        this.mappingEngine.processMidiMessage(message);
      });

      this.midiHandler.on('cc', (message) => {
        this.mappingEngine.processCCMessage(message);
      });

      this.midiHandler.on('tempo', (event) => {
        this.mappingEngine.updateTempo(event.bpm, event.timestamp, event.source);
      });

      this.midiHandler.on('pc', (message) => {
        this.mappingEngine.setCurrentPreset(message.program);
      });

      // Start web server
      const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
      this.apiServer.start(port);

    } catch (error: any) {
      console.error('Failed to start application:', error.message);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    console.log('\nStopping Hue MIDI Bridge...');
    this.midiHandler.close();
    this.bridgeController.disconnect();
    this.apiServer.stop();
    console.log('✓ Stopped\n');
  }
}

// Create and start the application
const app = new HueMidiApp();

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  await app.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await app.stop();
  process.exit(0);
});

// Start the app
app.start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
