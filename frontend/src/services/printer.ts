import { encodeReceipt } from '@/lib/escpos';
import { printReceipt as browserPrint } from '@/lib/browserPrint';
import type { ReceiptData } from '@/types/receipt';

const STORAGE_KEY = 'printer_config';

// ── BLE constants ────────────────────────────────────────────────────

/** Common GATT service UUIDs used by thermal BLE printers. */
const BLE_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
];

/**
 * Conservative BLE write chunk size.
 * Many printers use 20-byte ATT MTU; negotiated MTU is not reliably
 * exposed by Web Bluetooth, so we chunk at 20 bytes for compatibility.
 */
const DEFAULT_BLE_WRITE_CHUNK_SIZE = 20;

const DEFAULT_BAUD_RATE = 9600;

// ── Config ───────────────────────────────────────────────────────────

interface PrinterConfig {
  type: 'bluetooth' | 'serial' | null;
  name: string;
  /** BLE device ID (for bluetooth reconnect). */
  id?: string;
  /** Serial USB vendor ID (for serial reconnect). */
  usbVendorId?: number;
  /** Serial USB product ID (for serial reconnect). */
  usbProductId?: number;
  /** Serial baud rate (default 9600). */
  baudRate?: number;
}

// ── Service ──────────────────────────────────────────────────────────

class PrinterService {
  private bluetoothDevice: BluetoothDevice | null = null;
  private bluetoothCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private serialPort: SerialPort | null = null;
  private config: PrinterConfig = { type: null, name: '' };

  constructor() {
    this.loadConfig();
  }

  // ── Persistence ──────────────────────────────────────────────────

  private loadConfig() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.config = JSON.parse(stored);
      }
    } catch {
      // corrupted storage — start fresh
    }
  }

  private saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      // storage full or unavailable
    }
  }

  // ── Public getters ───────────────────────────────────────────────

  get connectionType(): 'bluetooth' | 'serial' | null {
    return this.config.type;
  }

  get printerName(): string {
    return this.config.name;
  }

  get isConnected(): boolean {
    if (this.config.type === 'bluetooth') {
      return !!this.bluetoothDevice?.gatt?.connected;
    }
    if (this.config.type === 'serial') {
      return !!this.serialPort?.readable && !!this.serialPort?.writable;
    }
    return false;
  }

  get isWebBluetoothAvailable(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  get isWebSerialAvailable(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.serial;
  }

  // ── BLE characteristic resolution ────────────────────────────────

  /**
   * Walk known printer services, then all primary services, to find
   * a writable characteristic. Shared between connect and reconnect.
   */
  private async findBluetoothWriteCharacteristic(
    server: BluetoothRemoteGATTServer,
  ): Promise<BluetoothRemoteGATTCharacteristic> {
    // Try known printer service UUIDs first
    for (const serviceUUID of BLE_PRINTER_SERVICES) {
      try {
        const service = await server.getPrimaryService(serviceUUID);
        const chars = await service.getCharacteristics();
        const found = chars.find(
          (c: BluetoothRemoteGATTCharacteristic) =>
            c.properties.write || c.properties.writeWithoutResponse,
        );
        if (found) return found;
      } catch {
        // service not available on this device
      }
    }

    // Fallback: enumerate all primary services
    const services = await server.getPrimaryServices();
    for (const svc of services) {
      const chars = await svc.getCharacteristics();
      const found = chars.find(
        (c: BluetoothRemoteGATTCharacteristic) =>
          c.properties.write || c.properties.writeWithoutResponse,
      );
      if (found) return found;
    }

    throw new Error(
      'Could not find a writable characteristic on the printer. ' +
        'This printer may not support BLE GATT printing.',
    );
  }

  /** Register the BLE disconnect handler that preserves config for reconnect. */
  private registerBleDisconnectHandler(device: BluetoothDevice) {
    device.addEventListener('gattserverdisconnected', () => {
      // Clear runtime objects only — keep config so reconnect() can restore
      this.bluetoothDevice = null;
      this.bluetoothCharacteristic = null;
    });
  }

  // ── Connect ──────────────────────────────────────────────────────

  async connectBluetooth(): Promise<boolean> {
    if (!this.isWebBluetoothAvailable) {
      throw new Error('Web Bluetooth is not supported in this browser. Use Chrome or Edge.');
    }

    try {
      const device = await navigator.bluetooth!.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_PRINTER_SERVICES,
      });

      if (!device.gatt) {
        throw new Error('Printer does not support GATT');
      }

      const server = await device.gatt.connect();
      const characteristic = await this.findBluetoothWriteCharacteristic(server);

      this.bluetoothDevice = device;
      this.bluetoothCharacteristic = characteristic;
      this.config = {
        type: 'bluetooth',
        name: device.name ?? 'Bluetooth Printer',
        id: device.id,
      };
      this.saveConfig();

      this.registerBleDisconnectHandler(device);

      return true;
    } catch (err) {
      if ((err as Error).name === 'NotFoundError') {
        return false;
      }
      throw err;
    }
  }

  async connectSerial(): Promise<boolean> {
    if (!this.isWebSerialAvailable) {
      throw new Error('Web Serial is not supported in this browser. Use Chrome or Edge on desktop.');
    }

    try {
      const port = await navigator.serial!.requestPort();
      await port.open({ baudRate: DEFAULT_BAUD_RATE });

      this.serialPort = port;
      const info = port.getInfo();
      this.config = {
        type: 'serial',
        name: `USB Printer (vendor ${info.usbVendorId ?? 'unknown'})`,
        usbVendorId: info.usbVendorId,
        usbProductId: info.usbProductId,
        baudRate: DEFAULT_BAUD_RATE,
      };
      this.saveConfig();

      return true;
    } catch (err) {
      if ((err as Error).name === 'NotFoundError') {
        return false;
      }
      throw err;
    }
  }

  // ── Reconnect ────────────────────────────────────────────────────

  async reconnect(): Promise<boolean> {
    if (!this.config.type) return false;

    if (this.config.type === 'bluetooth' && this.isWebBluetoothAvailable) {
      return this.reconnectBluetooth();
    }

    if (this.config.type === 'serial' && this.isWebSerialAvailable) {
      return this.reconnectSerial();
    }

    return false;
  }

  private async reconnectBluetooth(): Promise<boolean> {
    if (!this.config.id) return false;

    try {
      const devices = await navigator.bluetooth!.getDevices();
      const device = devices.find((d: BluetoothDevice) => d.id === this.config.id);
      if (!device?.gatt) return false;

      const server = await device.gatt.connect();
      const characteristic = await this.findBluetoothWriteCharacteristic(server);

      this.bluetoothDevice = device;
      this.bluetoothCharacteristic = characteristic;

      this.registerBleDisconnectHandler(device);

      return true;
    } catch {
      return false;
    }
  }

  private async reconnectSerial(): Promise<boolean> {
    try {
      const ports = await navigator.serial!.getPorts();
      const port = ports.find((p: SerialPort) => {
        const info = p.getInfo();
        if (
          this.config.usbVendorId != null &&
          info.usbVendorId === this.config.usbVendorId
        ) {
          return true;
        }
        if (
          this.config.usbProductId != null &&
          info.usbProductId === this.config.usbProductId
        ) {
          return true;
        }
        return false;
      });

      if (!port) return false;

      const baudRate = this.config.baudRate ?? DEFAULT_BAUD_RATE;
      await port.open({ baudRate });

      this.serialPort = port;
      return true;
    } catch {
      return false;
    }
  }

  // ── Disconnect ───────────────────────────────────────────────────

  /** Explicit user-triggered disconnect — clears everything. */
  disconnect() {
    if (this.bluetoothDevice?.gatt?.connected) {
      this.bluetoothDevice.gatt.disconnect();
    }
    if (this.serialPort) {
      this.serialPort.close().catch(() => {});
    }
    this.bluetoothDevice = null;
    this.bluetoothCharacteristic = null;
    this.serialPort = null;
    this.config = { type: null, name: '' };
    this.saveConfig();
  }

  // ── Data transmission ────────────────────────────────────────────

  async print(data: Uint8Array): Promise<void> {
    if (this.config.type === 'bluetooth' && this.bluetoothCharacteristic) {
      await this.printBluetooth(data);
    } else if (this.config.type === 'serial' && this.serialPort?.writable) {
      await this.printSerial(data);
    } else {
      throw new Error('Printer not connected');
    }
  }

  private async printBluetooth(data: Uint8Array) {
    if (!this.bluetoothCharacteristic) throw new Error('Printer not connected');

    const characteristic = this.bluetoothCharacteristic;

    for (let i = 0; i < data.length; i += DEFAULT_BLE_WRITE_CHUNK_SIZE) {
      const chunk = data.slice(i, i + DEFAULT_BLE_WRITE_CHUNK_SIZE);
      if (characteristic.properties.writeWithoutResponse) {
        await characteristic.writeValueWithoutResponse(chunk);
      } else {
        await characteristic.writeValueWithResponse(chunk);
      }
    }
  }

  private async printSerial(data: Uint8Array) {
    if (!this.serialPort?.writable) throw new Error('Printer not connected');

    const writer = this.serialPort.writable.getWriter();
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  }

  // ── Receipt printing ─────────────────────────────────────────────

  /**
   * Print a receipt via the connected thermal printer, or fall back to
   * browser print when no direct printer is configured.
   *
   * IMPORTANT: If a direct printer is connected but printing fails, we
   * throw the error instead of falling back to browser print. This
   * prevents duplicate receipts when the printer already received part
   * or most of the data before the error occurred.
   */
  async printReceipt(data: ReceiptData) {
    if (this.isConnected && this.config.type) {
      try {
        const escposData = encodeReceipt(data);
        await this.print(escposData);
        return;
      } catch (err) {
        console.error('Direct printer communication failed:', err);
        throw new Error(
          'Printer communication failed. Please check the printer before printing again.',
        );
      }
    }

    browserPrint(data);
  }
}

export const printer = new PrinterService();
