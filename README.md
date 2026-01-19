# Hue MIDI

Real-time Philips Hue light control via MIDI. Connect your DAW, MIDI controller, or any MIDI source to create dynamic, music-synchronized lighting.

## What It Does

- Maps MIDI notes, Control Change (CC), and Program Change messages to light actions
- Streams color changes at 50Hz using the Hue Entertainment API for smooth animations
- Extracts BPM from MIDI clock for tempo-synced effects
- Runs 20+ built-in effect presets (fire, aurora, ocean, chase patterns, and more)
- Supports gradient lights with per-segment color control

## Architecture

```
hue-midi/
├── client/          # React frontend (Vite + Zustand + Tailwind)
├── server/          # Node.js backend (Express + WebSocket)
│   ├── effects/     # Effect presets and custom effects engine
│   ├── hue/         # Bridge controller and API v2 implementation
│   ├── mapping/     # MIDI-to-light mapping engine
│   ├── midi/        # MIDI input handling and clock parsing
│   └── streaming/   # Entertainment API (DTLS) streaming
└── config.json      # Persisted configuration
```

## Requirements

- Node.js 18+
- Philips Hue Bridge with Entertainment API support
- Hue lights connected to the bridge

## Setup

Install dependencies and build:

```bash
cd server && npm install
cd ../client && npm install && npm run build
```

Start the server:

```bash
cd server && npm run dev
```

Open `http://localhost:3000` in your browser.

### Connecting to Your Bridge

1. Click **Discover Bridges** in the web UI
2. Press the physical link button on your Hue Bridge
3. Click **Connect** within 30 seconds
4. Lights will be discovered automatically

### Setting Up MIDI

Select an existing MIDI port from the dropdown, or create a virtual port that appears as "Hue MIDI Bridge" in your DAW.

### Enabling Streaming Mode

For 50Hz real-time control (required for smooth effects):

1. Go to **Streaming Settings**
2. Click **Generate Client Key**
3. Select an Entertainment Configuration (create one in the Hue app if needed)
4. Toggle streaming on

## MIDI Mappings

### Supported Message Types

| Type | Use Case |
|------|----------|
| Note On/Off | Trigger colors, effects, or scenes. Velocity controls brightness. |
| Control Change (CC) | Continuous control (e.g., faders for brightness) or discrete triggers |
| Program Change (PC) | Switch between preset banks/snapshots |
| MIDI Clock | Automatic BPM extraction for tempo-synced effects |

### Mapping Actions

- **Color**: Set hue/saturation with velocity-based or fixed brightness
- **Effect**: Trigger built-in or custom effects
- **Scene**: Activate multi-light scenes with animations
- **Toggle**: Turn lights on/off

Mappings can be scoped to specific Program Change numbers, useful for song-specific lighting in a setlist.

## Effects

### Native Hue Effects
`sparkle`, `fire`, `candle`, `prism`, `opal`, `glisten`

### Custom Streaming Effects
Require streaming mode enabled:

**Nature**: `candle`, `fire`, `fireplace`, `aurora`, `ocean`, `underwater`, `lava`, `thunderstorm`, `rain`, `forest`, `starfield`, `galaxy`

**Chase**: `marquee`, `theater`, `rainbow_chase`, `wave_chase`, `bounce_chase`, `comet_chase`, `pulse_chase`

**Ambient**: `sparkle`, `prism`, `colorloop`, `tv_ballast`, `fluorescent`

**Alert**: `strobe`, `police`, `ambulance`, `lightning`

### Effect Options

- `speed`: BPM (20-300) for tempo control
- `color1`, `color2`: Primary and secondary colors
- `brightness`: 0-254
- `intensity`: Effect strength (0-1)

## Scenes

Scenes capture multi-light states and can include:

- Initial light states (color, brightness, on/off)
- Looping animations with multiple steps
- Transition timing and easing
- Beat-synchronized step changes

## API

### REST Endpoints

```
GET  /api/config              # Get configuration
POST /api/config              # Update configuration

GET  /api/midi/ports          # List available MIDI ports
POST /api/midi/port           # Connect to a port

GET  /api/hue/bridges         # Discover bridges
POST /api/hue/bridge/connect  # Connect to bridge
GET  /api/hue/lights          # Get all lights

GET  /api/mappings            # Get all mappings
POST /api/mappings            # Create mapping
DELETE /api/mappings/:ch/:note # Delete mapping

GET  /api/scenes              # Get all scenes
POST /api/scenes              # Create scene

POST /api/hue/entertainment/start  # Start streaming
GET  /api/hue/entertainment/status # Get streaming status
```

### WebSocket Events

Connect to `ws://localhost:3000` for real-time updates:

- `midi` - MIDI message received
- `tempo` - BPM update from MIDI clock
- `lightControlled` - Light state changed
- `presetChanged` - Program Change received
- `error` - Error occurred

## Configuration

Settings are persisted to `config.json`:

```json
{
  "connectionMode": "bridge",
  "bridgeIp": "192.168.1.x",
  "bridgeUsername": "...",
  "midiPortName": "Hue MIDI Bridge",
  "mappings": [],
  "scenes": [],
  "streaming": {
    "enabled": false,
    "entertainmentConfigId": "...",
    "clientKey": "..."
  }
}
```

Copy `config.example.json` to `config.json` to get started, or let the app generate one on first run.

## Using with Ableton Live

1. Start Hue MIDI server
2. In Ableton: Preferences → Link/Tempo/MIDI → Enable "Hue MIDI Bridge" as output
3. Route a MIDI track to "Hue MIDI Bridge"
4. Send MIDI clock for BPM sync (enable in Preferences)
5. Notes and CCs on that track will trigger your mappings

## Color Reference

Hue values (0-65535):

| Color | Value |
|-------|-------|
| Red | 0 |
| Orange | 5000 |
| Yellow | 12750 |
| Green | 25500 |
| Cyan | 36210 |
| Blue | 46920 |
| Purple | 52225 |
| Pink | 56100 |

Saturation: 0 (white) to 254 (fully saturated)

## Development

Run client and server in development mode:

```bash
# Terminal 1: Server with auto-reload
cd server && npm run dev

# Terminal 2: Client dev server (optional, for hot reload)
cd client && npm run dev
```

The client builds to `server/public/` for production.

## License

ISC
