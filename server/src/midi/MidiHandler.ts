import midi from 'midi';
import { EventEmitter } from 'events';
import { MidiMessage, MidiTempoEvent, MidiPCMessage } from '../types';

export class MidiHandler extends EventEmitter {
  private input: midi.Input;
  private portName: string | null = null;
  private clockPulseCount = 0;
  private clockStartTime: number | null = null;
  private tempoBpm = 120;
  private lastTempoEmit = 0;
  private lastClockAt: number | null = null;

  constructor() {
    super();
    this.input = new midi.Input();
    // Ensure we receive sysex, timing, and active sensing messages (needed for MIDI clock)
    if (typeof (this.input as any).ignoreTypes === 'function') {
      (this.input as any).ignoreTypes(false, false, false);
    }
  }

  /**
   * List all available MIDI input ports
   */
  listPorts(): string[] {
    const portCount = this.input.getPortCount();
    const ports: string[] = [];

    for (let i = 0; i < portCount; i++) {
      ports.push(this.input.getPortName(i));
    }

    return ports;
  }

  /**
   * Open a MIDI input port by name or index
   */
  openPort(nameOrIndex: string | number): void {
    const portCount = this.input.getPortCount();

    if (portCount === 0) {
      throw new Error('No MIDI input ports available');
    }

    let portIndex: number;

    if (typeof nameOrIndex === 'number') {
      portIndex = nameOrIndex;
    } else {
      // Find port by name
      portIndex = -1;
      for (let i = 0; i < portCount; i++) {
        if (this.input.getPortName(i).includes(nameOrIndex)) {
          portIndex = i;
          break;
        }
      }

      if (portIndex === -1) {
        throw new Error(`MIDI port "${nameOrIndex}" not found`);
      }
    }

    this.portName = this.input.getPortName(portIndex);

    // Set up MIDI message handler
    this.input.on('message', (deltaTime: number, message: number[]) => {
      this.handleMidiMessage(message);
    });

    this.input.openPort(portIndex);
    console.log(`Opened MIDI port: ${this.portName}`);
  }

  /**
   * Open a virtual MIDI port (for Ableton to connect to)
   */
  openVirtualPort(portName: string = 'Hue MIDI Bridge'): void {
    this.input.on('message', (deltaTime: number, message: number[]) => {
      this.handleMidiMessage(message);
    });

    this.input.openVirtualPort(portName);
    this.portName = portName;
    console.log(`Opened virtual MIDI port: ${portName}`);
  }

  /**
   * Parse and emit MIDI messages
   */
  private handleMidiMessage(message: number[]): void {
    const status = message[0];
    const data1 = message[1];
    const data2 = message[2];

    if (status === 0xF8) {
      this.handleClockPulse();
      return;
    }

    if (status === 0xFA || status === 0xFB) {
      console.log(`[MIDI] Transport start (${status === 0xFA ? 'Start' : 'Continue'})`);
      this.resetClock();
      return;
    }

    if (status === 0xFC) {
      console.log('[MIDI] Transport Stop');
      this.resetClock(true);
      return;
    }

    // Check if it's a Note On message (0x90-0x9F)
    const messageType = status & 0xF0;
    const channel = status & 0x0F;

    if (messageType === 0x90 || messageType === 0x80) {
      // Note On or Note Off
      const isNoteOn = messageType === 0x90 && data2 > 0;

      const midiMessage: MidiMessage = {
        channel,
        note: data1,
        velocity: isNoteOn ? data2 : 0,
        timestamp: Date.now()
      };

      this.emit('note', midiMessage);
    } else if (messageType === 0xB0) {
      // Control Change - could be useful for brightness/effects control
      console.log(`[MIDI] CC received: channel=${channel}, controller=${data1}, value=${data2}`);
      this.emit('cc', {
        channel,
        controller: data1,
        value: data2,
        timestamp: Date.now()
      });
    } else if (messageType === 0xC0) {
      // Program Change - preset selection
      const pcMessage: MidiPCMessage = {
        channel,
        program: data1,
        timestamp: Date.now()
      };
      console.log(`[MIDI] Program Change: channel=${channel}, program=${data1}`);
      this.emit('pc', pcMessage);
    }
  }

  /**
   * Close the MIDI port
   */
  close(): void {
    if (this.input) {
      this.input.closePort();
      console.log('MIDI port closed');
    }
  }

  /**
   * Get the current port name
   */
  getCurrentPort(): string | null {
    return this.portName;
  }

  getCurrentTempo(): number {
    return this.tempoBpm;
  }

  getTempoStatus(): { bpm: number; ageMs: number } {
    const now = Date.now();
    const age = this.lastClockAt ? now - this.lastClockAt : Infinity;
    return {
      bpm: this.tempoBpm,
      ageMs: age,
    };
  }

  private handleClockPulse(): void {
    const now = Date.now();
    this.lastClockAt = now;

    if (this.clockStartTime === null) {
      this.clockStartTime = now;
      this.clockPulseCount = 1;
      return;
    }

    this.clockPulseCount += 1;

    if (this.clockPulseCount >= 24) {
      const duration = now - this.clockStartTime;
      if (duration > 0) {
        const instantaneousBpm = 60000 / duration;
        const normalizedBpm = this.normalizeBpm(instantaneousBpm);
        console.log(`[MIDI] clock pulses: duration ${duration.toFixed(2)}ms, bpm estimate ${instantaneousBpm.toFixed(2)}, normalized ${normalizedBpm.toFixed(2)}`);
        this.tempoBpm = this.smoothTempo(normalizedBpm);
        this.emitTempo('midi');
      }
      this.clockPulseCount = 0;
      this.clockStartTime = now;
    }
  }

  private resetClock(resetTempo: boolean = false): void {
    this.clockPulseCount = 0;
    this.clockStartTime = null;
    this.lastClockAt = null;
    if (resetTempo) {
      this.tempoBpm = 120;
      this.emitTempo('midi');
    }
  }

  private smoothTempo(nextTempo: number): number {
    if (!Number.isFinite(nextTempo) || nextTempo <= 0) {
      return this.tempoBpm;
    }
    const clamped = Math.min(999, Math.max(10, nextTempo));

    // Blend towards the new tempo more aggressively so the display updates quickly
    const alpha = 0.2; // weight of previous tempo
    return this.tempoBpm * alpha + clamped * (1 - alpha);
  }

  private normalizeBpm(bpm: number): number {
    if (!Number.isFinite(bpm) || bpm <= 0) {
      return bpm;
    }

    let normalized = bpm;
    while (normalized > 180) {
      normalized /= 2;
    }
    return normalized;
  }

  private emitTempo(source: MidiTempoEvent['source']): void {
    const now = Date.now();
    if (now - this.lastTempoEmit < 50) {
      return;
    }
    this.lastTempoEmit = now;
    const payload: MidiTempoEvent = {
      bpm: this.tempoBpm,
      source,
      timestamp: now,
    };
    console.log(`[MIDI] Tempo update: ${payload.bpm.toFixed(2)} BPM (source: ${source})`);
    this.emit('tempo', payload);
  }
}
