# Hue MIDI Bridge

Control your Philips Hue lights with MIDI from Ableton Live, MIDI controllers, or any MIDI source.

## Features

- **MIDI Input**: Virtual MIDI port or connect to physical MIDI devices
- **Hue Bridge Support**: Full control via Philips Hue Bridge API
- **Bluetooth Support**: Direct BLE control for bridge-free setups ([Bluetooth Guide](BLUETOOTH_GUIDE.md))
- **Flexible Mapping**: Map MIDI notes to specific lights with custom actions
- **Multiple Actions**:
  - Color changes with hue/saturation control
  - Brightness control (velocity-based or fixed)
  - On/Off toggle
  - Effects (color loop, flash, pulse)
- **Web UI**: Easy-to-use interface for configuration
- **Real-time Monitoring**: See MIDI activity and light control events
- **Persistent Config**: Mappings are saved and restored on restart

## Prerequisites

- Node.js 18+ and npm
- **Either:**
  - Philips Hue Bridge + Hue lights connected to it, **OR**
  - Bluetooth-enabled Hue lights (2019+) + System with Bluetooth
- For Bluetooth setup without a bridge, see [BLUETOOTH_GUIDE.md](BLUETOOTH_GUIDE.md)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the TypeScript code:
```bash
npm run build
```

## Usage

### Starting the Server

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

The server will start on `http://localhost:3000`

### Initial Setup

1. **Open the web UI**: Navigate to `http://localhost:3000` in your browser

2. **Set up MIDI**:
   - Click "Create Virtual MIDI Port" to create a port named "Hue MIDI Bridge"
   - Or connect to an existing physical MIDI port

3. **Connect to Hue Bridge**:
   - Click "Discover Bridges"
   - Click "Setup" next to your bridge
   - Press the physical link button on your Hue Bridge
   - Wait for connection confirmation

4. **Refresh Lights**:
   - Click "Refresh Lights" to see your available lights

5. **Create MIDI Mappings**:
   - Click "Add New Mapping"
   - Configure:
     - MIDI Channel (0-15)
     - MIDI Note (0-127)
     - Target Light
     - Action Type (color, brightness, toggle, effect)
     - Additional parameters based on action type
   - Click "Add Mapping"

### Using with Ableton Live

1. Start the Hue MIDI Bridge server
2. In Ableton Live:
   - Go to Preferences → Link/Tempo/MIDI
   - Under "MIDI Ports", enable "Hue MIDI Bridge" as a MIDI output
3. Create a MIDI track
4. Set the MIDI track output to "Hue MIDI Bridge"
5. Create MIDI clips or use a MIDI controller on that track
6. Your configured MIDI notes will now control your Hue lights!

### Example Mappings

**Red color on MIDI note 60 (C3)**:
- Channel: 0
- Note: 60
- Action: Color
- Hue: 0
- Saturation: 254
- Brightness Mode: Velocity

**Flash effect on MIDI note 64 (E3)**:
- Channel: 0
- Note: 64
- Action: Effect
- Effect: Flash

**Toggle light on/off with MIDI note 72**:
- Channel: 0
- Note: 72
- Action: Toggle

## Configuration File

Mappings and settings are saved to `config.json` in the project directory. Example:

```json
{
  "connectionMode": "bridge",
  "bridgeIp": "192.168.1.100",
  "bridgeUsername": "your-username-here",
  "midiPortName": "Hue MIDI Bridge",
  "mappings": [
    {
      "midiNote": 60,
      "midiChannel": 0,
      "lightId": "1",
      "action": {
        "type": "color",
        "colorHue": 0,
        "colorSat": 254,
        "brightnessMode": "velocity",
        "transitionTime": 2
      }
    }
  ]
}
```

## API Endpoints

The server exposes a REST API:

- `GET /api/config` - Get current configuration
- `POST /api/config` - Update configuration
- `GET /api/midi/ports` - List MIDI ports
- `POST /api/midi/port` - Connect to MIDI port
- `GET /api/hue/bridges` - Discover Hue Bridges
- `POST /api/hue/bridge/user` - Create bridge user
- `POST /api/hue/bridge/connect` - Connect to bridge
- `GET /api/hue/lights` - Get all lights
- `GET /api/mappings` - Get all mappings
- `POST /api/mappings` - Add mapping
- `DELETE /api/mappings/:channel/:note` - Remove mapping
- `POST /api/mappings/clear` - Clear all mappings
- `POST /api/test/light` - Test light control

## WebSocket Events

Real-time updates via WebSocket:

- `midi` - MIDI message received
- `lightControlled` - Light was controlled
- `error` - Error occurred

## Color Reference

Hue uses 16-bit color values (0-65535). Some common values:

- Red: 0
- Orange: 5000
- Yellow: 12750
- Green: 25500
- Cyan: 36210
- Blue: 46920
- Purple: 52225
- Pink: 56100

Saturation is 0-254 (0 = white, 254 = fully saturated)

## Troubleshooting

**MIDI port not showing in Ableton**:
- Make sure the server is running
- Check Ableton's MIDI preferences
- Try restarting Ableton after starting the server

**Can't connect to Hue Bridge**:
- Ensure bridge is on the same network
- Press the link button before clicking "Setup"
- Check that your bridge firmware is up to date

**Lights not responding**:
- Verify lights are reachable in the Hue app
- Check that mappings are configured correctly
- Watch the Activity Monitor for MIDI messages

**Bluetooth not working**:
- Bluetooth support is experimental
- Use Bridge mode for best experience
- Check that your system has Bluetooth enabled

## Development

Project structure:
```
hue-midi/
├── src/
│   ├── types/           # TypeScript type definitions
│   ├── midi/            # MIDI handling
│   ├── hue/             # Hue Bridge & Bluetooth controllers
│   ├── mapping/         # Mapping engine & config
│   ├── server/          # Express API server
│   └── index.ts         # Main entry point
├── public/              # Web UI files
├── config.json          # Configuration (auto-generated)
└── package.json
```

## License

ISC

## Credits

Built with:
- [node-hue-api](https://github.com/peter-murray/node-hue-api) - Philips Hue API
- [node-midi](https://github.com/justinlatimer/node-midi) - MIDI I/O
- [Express](https://expressjs.com/) - Web server
- [ws](https://github.com/websockets/ws) - WebSocket server
