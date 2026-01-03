/**
 * Spring physics-based animator for Hue lights
 * Uses spring physics to create smooth, natural animations
 */

export interface SpringConfig {
  stiffness: number;  // Spring stiffness (default: 100)
  damping: number;    // Damping ratio (default: 10)
  mass: number;       // Mass (default: 1)
}

export interface AnimationTarget {
  brightness?: number;
  hue?: number;
  saturation?: number;
}

export type AnimationPreset =
  | 'bounceIn'
  | 'bounceOut'
  | 'gentle'
  | 'wobbly'
  | 'stiff'
  | 'slow'
  | 'snappy';

const SPRING_PRESETS: Record<AnimationPreset, SpringConfig> = {
  bounceIn: { stiffness: 300, damping: 20, mass: 1 },
  bounceOut: { stiffness: 200, damping: 15, mass: 1 },
  gentle: { stiffness: 120, damping: 14, mass: 1 },
  wobbly: { stiffness: 180, damping: 12, mass: 1 },
  stiff: { stiffness: 400, damping: 30, mass: 1 },
  slow: { stiffness: 80, damping: 20, mass: 1 },
  snappy: { stiffness: 500, damping: 25, mass: 1 },
};

export class SpringAnimator {
  private animationFrames: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Animate a value using spring physics
   */
  private springAnimation(
    from: number,
    to: number,
    config: SpringConfig,
    onUpdate: (value: number) => void,
    onComplete?: () => void
  ): void {
    const { stiffness, damping, mass } = config;

    let position = from;
    let velocity = 0;
    const targetPosition = to;

    const dt = 1 / 60; // 60fps
    const epsilon = 0.01; // Threshold for completion

    const animate = () => {
      // Spring force: F = -k * x
      const springForce = -stiffness * (position - targetPosition);

      // Damping force: F = -c * v
      const dampingForce = -damping * velocity;

      // Total force
      const force = springForce + dampingForce;

      // Acceleration: F = ma, so a = F/m
      const acceleration = force / mass;

      // Update velocity and position
      velocity += acceleration * dt;
      position += velocity * dt;

      // Clamp to valid range
      const clampedPosition = Math.max(0, Math.min(position, 254));

      onUpdate(clampedPosition);

      // Check if settled
      const settled =
        Math.abs(velocity) < epsilon &&
        Math.abs(position - targetPosition) < epsilon;

      if (!settled) {
        setTimeout(animate, dt * 1000);
      } else {
        onUpdate(targetPosition);
        onComplete?.();
      }
    };

    animate();
  }

  /**
   * Animate light properties with spring physics
   */
  async animateLight(
    lightId: string,
    from: AnimationTarget,
    to: AnimationTarget,
    preset: AnimationPreset,
    updateCallback: (state: AnimationTarget) => Promise<void>
  ): Promise<void> {
    // Cancel existing animation for this light
    this.cancelAnimation(lightId);

    const config = SPRING_PRESETS[preset];

    return new Promise((resolve) => {
      const startTime = Date.now();
      const duration = 2000; // Max duration in ms

      let completedAnimations = 0;
      const totalAnimations = Object.keys(to).length;

      const checkComplete = () => {
        completedAnimations++;
        if (completedAnimations >= totalAnimations) {
          this.cancelAnimation(lightId);
          resolve();
        }
      };

      // Animate brightness
      if (to.brightness !== undefined && from.brightness !== undefined) {
        this.springAnimation(
          from.brightness,
          to.brightness,
          config,
          async (value) => {
            await updateCallback({ brightness: Math.round(value) });
          },
          checkComplete
        );
      } else {
        checkComplete();
      }

      // Animate hue
      if (to.hue !== undefined && from.hue !== undefined) {
        this.springAnimation(
          from.hue,
          to.hue,
          { ...config, stiffness: config.stiffness * 0.5 }, // Slower for color
          async (value) => {
            await updateCallback({ hue: Math.round(value) });
          },
          checkComplete
        );
      } else {
        checkComplete();
      }

      // Animate saturation
      if (to.saturation !== undefined && from.saturation !== undefined) {
        this.springAnimation(
          from.saturation,
          to.saturation,
          config,
          async (value) => {
            await updateCallback({ saturation: Math.round(value) });
          },
          checkComplete
        );
      } else {
        checkComplete();
      }

      // Safety timeout
      const timeout = setTimeout(() => {
        this.cancelAnimation(lightId);
        resolve();
      }, duration);

      this.animationFrames.set(lightId, timeout);
    });
  }

  /**
   * Cancel animation for a specific light
   */
  cancelAnimation(lightId: string): void {
    const timeout = this.animationFrames.get(lightId);
    if (timeout) {
      clearTimeout(timeout);
      this.animationFrames.delete(lightId);
    }
  }

  /**
   * Cancel all animations
   */
  cancelAllAnimations(): void {
    this.animationFrames.forEach((timeout) => clearTimeout(timeout));
    this.animationFrames.clear();
  }

  /**
   * Get available animation presets
   */
  static getPresets(): AnimationPreset[] {
    return Object.keys(SPRING_PRESETS) as AnimationPreset[];
  }

  /**
   * Get spring config for a preset
   */
  static getPresetConfig(preset: AnimationPreset): SpringConfig {
    return SPRING_PRESETS[preset];
  }
}
