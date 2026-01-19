# Hue Entertainment Light Effects Guidelines

Based on official Philips Hue developer recommendations.

## Safety Requirements

### Epilepsy Prevention (CRITICAL)
- **Keep rapid brightness changes below 5 Hz** - Strobe can cause epileptic symptoms between 5-70Hz
- Use strobe effects very sparingly and keep them short
- Warn users if including intense strobe effects

### Peripheral Vision Sensitivity
- Lights to the side or behind viewers are more distracting
- Sudden brightness changes in peripheral vision are unpleasant
- Use gentler, slower effects on side/rear lights

### Brightness Transitions
- Frequent very-high to very-low transitions are unpleasant
- Reserve dramatic brightness swings for special moments
- Use smooth transitions (>100ms) for large changes

## Design Recommendations

### Color Matching
- Match lamp colors to on-screen content when syncing
- Different lamp types reproduce colors differently
- Test on actual hardware to verify color accuracy

### Color Transitions
- Slow transitions (>1s) show intermediate colors
- If intermediate colors are unwanted:
  - Use faster transitions
  - Transition through white (low saturation)
  - Transition through black (low brightness)

### Sync Timing
- Users notice when lights are out of sync with content
- Ensure light effects coincide with on-screen/audio events
- Test synchronization on actual hardware

### Ambient Lighting Approaches
1. **Match screen colors** - Use saturated colors near screen
2. **Recreate light sources** - Show off-screen lighting (e.g., sun)
3. **Mood association** - Create atmosphere not based on visible colors

For screen matching: saturated colors near screen, environment lighting (white for daylight) on lights near user.

## Effect-Specific Guidelines

### Explosions
- Match brightness to explosion distance (brighter = closer)
- Consider viewer orientation (which lights to use)
- Match duration and color to on-screen event

### Weapons/Muzzle Flash
- Short bright flash for single shots
- Overlapping flashes for automatic fire
- Match start/end timing to on-screen firing
- Color should match muzzle flash

### Ambient Effects
- Can provide information (health, power-ups)
- Can enhance mood/tension
- Can indicate off-screen events (attacked from behind)

## Technical Considerations

### Frame Rates
- 20-50ms intervals (20-50fps) for smooth streaming
- Higher rates for intense effects (fire: 25ms)
- Lower rates for slow, flowing effects (lava: 50ms)

### Gradient Lights
- Support per-segment colors for gradient strips
- Use `segmentCount` to know how many segments
- Check `isGradient` before generating gradient array
- Position 0 = first segment, position 1 = last segment

### State Management
- Use `init()` to set up any state needed
- Store oscillator phases, timers, object lists in custom state
- Avoid random per-frame variations for smooth effects
- Use controlled randomness (decay, timers) for organic feel
