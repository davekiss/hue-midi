declare module 'midi' {
  import { EventEmitter } from 'events';

  export class Input extends EventEmitter {
    constructor();
    getPortCount(): number;
    getPortName(portNumber: number): string;
    openPort(portNumber: number): void;
    openVirtualPort(portName: string): void;
    closePort(): void;
    on(event: 'message', callback: (deltaTime: number, message: number[]) => void): this;
  }

  export class Output extends EventEmitter {
    constructor();
    getPortCount(): number;
    getPortName(portNumber: number): string;
    openPort(portNumber: number): void;
    openVirtualPort(portName: string): void;
    closePort(): void;
    sendMessage(message: number[]): void;
  }
}
