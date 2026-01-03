# Bluetooth Setup Guide

Use this guide when you **don't have a Hue Bridge** and want to control your Hue lights directly via Bluetooth.

## Prerequisites

### Supported Lights
Only **Bluetooth-enabled Hue lights** work with this method:
- Hue White and Color Ambiance (Bluetooth models)
- Hue White Ambiance (Bluetooth models)
- Hue Lightstrip Plus (Bluetooth models)
- Most Hue bulbs purchased after 2019

**Check your bulb:** Look for the Bluetooth symbol on the packaging or in the Hue app.

### System Requirements

**macOS:**
- Bluetooth must be enabled
- No additional setup required

**Linux:**
- BlueZ 5.x installed
- Run with sudo privileges (or configure permissions)
```bash
sudo npm run dev
```

**Windows:**
- Requires compatible Bluetooth adapter
- May need additional drivers

## Setup Steps

### 1. Start the Server

```bash
npm run dev
```

### 2. Open Web UI

Navigate to: `http://localhost:3000`

### 3. Check Bluetooth Status

Look at the **"Bluetooth Setup"** section. The status should show:
- ✅ **"Ready (Not Connected)"** - Good! You can proceed
- ❌ **"Not Available"** - Bluetooth is not enabled or not supported

### 4. Scan for Lights

1. **Make sure your Hue lights are powered on**
2. Click **"Scan for Bluetooth Lights"**
3. Wait 10 seconds while scanning
4. You should see your lights appear with names like:
   - "Hue color lamp"
   - "Hue lightstrip plus"
   - etc.

### 5. Connect to Lights

For each light found:
1. Click the **"Connect"** button next to it
2. Wait for "Connected to Bluetooth light!" message
3. The light will now appear in the **"Available Lights"** section

### 6. Create MIDI Mappings

Now that your lights are connected:
1. Click **"Add New Mapping"**
2. Select your Bluetooth light from the dropdown
3. Configure the MIDI note and action
4. Click **"Add Mapping"**

### 7. Test Your Setup

1. Click **"Turn On"** / **"Turn Off"** buttons in the lights section
2. Verify the light responds
3. Try sending MIDI notes from Ableton

## Troubleshooting

### "Bluetooth is not available"

**macOS:**
- Open System Settings → Bluetooth
- Make sure Bluetooth is ON
- Restart the application

**Linux:**
```bash
# Check if Bluetooth is running
systemctl status bluetooth

# Start Bluetooth if needed
sudo systemctl start bluetooth

# Run the app with sudo
sudo npm run dev
```

**Windows:**
- Check Device Manager for Bluetooth adapters
- Install/update Bluetooth drivers
- Restart your computer

### "No Bluetooth lights found"

1. **Check if lights are powered on**
   - Turn them on using the physical switch

2. **Check if lights have Bluetooth**
   - Older Hue bulbs may not have Bluetooth
   - Look for the Bluetooth symbol on the bulb/box

3. **Reset the light**
   - Turn light on/off 5 times rapidly
   - Wait for it to flash
   - Try scanning again

4. **Check distance**
   - Bluetooth range is ~30 feet (10 meters)
   - Move closer to the lights

5. **Check if already paired**
   - If the light is paired with the Hue app on your phone, it may not show up
   - Unpair it from the phone first (if you can)

### "Connection failed" or "Drops immediately"

1. **Make sure light isn't connected elsewhere**
   - Close the Hue phone app
   - Disconnect from other Bluetooth devices

2. **Try one light at a time**
   - Connect to one light first
   - Once stable, connect to others

3. **Reduce interference**
   - Move away from WiFi routers
   - Turn off other Bluetooth devices temporarily

4. **Reset and retry**
   - Power cycle the light
   - Restart the application
   - Try connecting again

### "Light state characteristic not found"

This usually means:
- The light doesn't support the full Bluetooth protocol
- Try a different light
- Use Bridge mode instead (recommended for maximum compatibility)

### Lights work but colors are wrong

The color conversion from HSV to RGB may need adjustment for your specific light model. Try:
- Using different hue values (see color reference below)
- Adjusting saturation values
- Using Bridge mode for accurate colors

## Bluetooth vs Bridge Mode

| Feature | Bluetooth | Bridge |
|---------|-----------|--------|
| **Setup** | Direct, no hub needed | Requires Hue Bridge |
| **Range** | ~30 feet | Whole home network |
| **Reliability** | Can drop connection | Very stable |
| **Lights** | Max ~10 lights | Up to 50 lights |
| **Speed** | Slightly slower | Very fast |
| **Color accuracy** | Good | Excellent |
| **Scenes/Groups** | No | Yes |
| **Remote access** | No | Yes (with bridge) |

**Recommendation:**
- Use **Bluetooth** for: Single-room setups, live performances, no bridge available
- Use **Bridge** for: Multi-room, permanent installations, maximum reliability

## Performance Tips

### For Best Bluetooth Performance:

1. **Connect lights before starting performance**
   - Don't scan/connect during live use
   - Set up mappings in advance

2. **Use fixed brightness instead of velocity**
   - Reduces BLE communication overhead
   - More reliable during fast MIDI sequences

3. **Increase transition time**
   - Use 5-10 instead of 1-2
   - Smoother transitions
   - Less BLE traffic

4. **Limit simultaneous notes**
   - Don't trigger all lights at once
   - Stagger notes by 50-100ms

5. **Stay in range**
   - Keep computer within 10-15 feet of lights
   - No walls/obstacles if possible

## Example: Bluetooth-Only Setup

Here's a complete workflow for a Bluetooth-only setup:

### 1. Hardware
- MacBook Pro with Bluetooth
- 2x Hue White and Color Bulbs (Bluetooth)
- Ableton Live 12

### 2. Configuration
```bash
# Start server
npm run dev
```

### 3. Web UI Setup
1. Create Virtual MIDI Port
2. Scan for Bluetooth lights (find 2 bulbs)
3. Connect to both bulbs
4. Create mappings:
   - Note 60 (C3) → Bulb 1 → Red (Hue: 0)
   - Note 62 (D3) → Bulb 1 → Green (Hue: 25500)
   - Note 64 (E3) → Bulb 2 → Blue (Hue: 46920)
   - Note 67 (G3) → Bulb 2 → Purple (Hue: 52225)

### 4. Ableton Setup
1. Preferences → MIDI → Enable "Hue MIDI Bridge" output
2. Create MIDI track → Output to "Hue MIDI Bridge"
3. Create clip with notes 60, 62, 64, 67
4. Play!

## Color Reference for Bluetooth

Use these hue values (0-65535):

| Color | Hue Value | RGB Equivalent |
|-------|-----------|----------------|
| Red | 0 | (255, 0, 0) |
| Orange | 5000 | (255, 100, 0) |
| Yellow | 12750 | (255, 255, 0) |
| Green | 25500 | (0, 255, 0) |
| Cyan | 36210 | (0, 255, 255) |
| Blue | 46920 | (0, 0, 255) |
| Purple | 52225 | (128, 0, 255) |
| Pink | 56100 | (255, 0, 128) |
| White | any | Saturation: 0 |

**Saturation:** 0-254 (254 = full color, 0 = white)

## Advanced: Bluetooth Permissions (Linux)

If you get permission errors on Linux:

```bash
# Allow Node.js to access Bluetooth without sudo
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)

# Or create a udev rule
sudo nano /etc/udev/rules.d/99-hue-ble.rules
```

Add:
```
KERNEL=="hci0", MODE="0666"
```

Then:
```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

## Need Help?

If Bluetooth isn't working:
1. Try **Bridge mode** (more reliable)
2. Check the [main README](README.md) for Bridge setup
3. Report issues at the GitHub repository

Remember: Bluetooth is great for simple setups, but Bridge mode offers better reliability and features for complex installations!
