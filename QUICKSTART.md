# Quick Start Guide

## 1. First Time Setup (5 minutes)

### Install and Build
```bash
npm install
npm run build
```

### Start the Server
```bash
npm run dev
```

You should see:
```
🎹 Hue MIDI Bridge Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Web UI:  http://localhost:3000
API:     http://localhost:3000/api
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 2. Configure via Web UI

Open `http://localhost:3000` in your browser.

### A. Setup MIDI
1. Click **"Create Virtual MIDI Port"**
2. You should see: `✓ MIDI port opened: Hue MIDI Bridge`

### B. Connect to Hue Lights

**Option 1: With Hue Bridge (Recommended)**
1. Click **"Discover Bridges"**
2. Click **"Setup"** next to your bridge IP
3. **Press the physical button** on your Hue Bridge
4. Wait for "Connected to Hue Bridge!" message

**Option 2: Bluetooth (No Bridge)**
1. Click **"Scan for Bluetooth Lights"**
2. Wait 10 seconds for scan
3. Click **"Connect"** next to each light
4. See [BLUETOOTH_GUIDE.md](BLUETOOTH_GUIDE.md) for detailed setup

### C. Get Your Lights
1. Click **"Refresh Lights"**
2. You should see your lights listed (bulb, strip, etc.)
3. Test them with the On/Off buttons

## 3. Create Your First Mapping

Click **"Add New Mapping"** and configure:

### Example 1: Red Light on MIDI Note C3 (60)
- **MIDI Channel**: 0
- **MIDI Note**: 60
- **Light**: [Select your light]
- **Action Type**: Color
- **Hue**: 0 (Red)
- **Saturation**: 254 (Full)
- **Brightness Mode**: Use MIDI Velocity
- Click **"Add Mapping"**

### Example 2: Toggle Light on/off with Note E3 (64)
- **MIDI Channel**: 0
- **MIDI Note**: 64
- **Light**: [Select your light]
- **Action Type**: On/Off Toggle
- Click **"Add Mapping"**

## 4. Connect from Ableton Live

### Setup in Ableton
1. Go to **Preferences** → **Link/Tempo/MIDI**
2. Under **MIDI Ports**, find "Hue MIDI Bridge"
3. Enable **Track** for the output

### Create a MIDI Track
1. Create a new **MIDI track**
2. Set **MIDI To**: "Hue MIDI Bridge"
3. Create a MIDI clip
4. Add notes: C3 (60), E3 (64), etc.
5. **Play the clip** - your lights should respond!

## 5. Program a Light Show

### In Ableton:
1. Create a MIDI clip on your Hue MIDI track
2. Draw in notes at different times:
   - Note 60 (C3) at bar 1 = Red
   - Note 62 (D3) at bar 2 = Green (if you map it)
   - Note 64 (E3) at bar 3 = Blue (if you map it)
3. Set different velocities for brightness control
4. Automate the sequence!

### Pro Tip:
Map each light to different MIDI channels, so you can control:
- Channel 0 → Light Strip
- Channel 1 → Bulb 1
- Channel 2 → Bulb 2

## Common Color Values

Create mappings with these hue values:

| Color  | Hue Value |
|--------|-----------|
| Red    | 0         |
| Orange | 5000      |
| Yellow | 12750     |
| Green  | 25500     |
| Cyan   | 36210     |
| Blue   | 46920     |
| Purple | 52225     |
| Pink   | 56100     |

**Saturation**: 254 = full color, 0 = white

## Troubleshooting

**Can't see "Hue MIDI Bridge" in Ableton?**
- Restart Ableton after starting the server
- Check Ableton's MIDI preferences

**Lights not responding?**
- Check the "Activity Monitor" in the web UI
- You should see MIDI messages when you play notes
- Make sure mappings are configured

**Lost connection to bridge?**
- Restart the server
- Your config is saved in `config.json`

## Next Steps

- Add more mappings for different colors
- Use effects like "Color Loop" for ambient scenes
- Map a MIDI controller for real-time control
- Create complex light shows synced to your music!

Enjoy! 🎹💡
