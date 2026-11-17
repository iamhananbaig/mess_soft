import { encodeReceiptCopies, type ReceiptSettings } from '@/lib/escpos';
import type { ReceiptCopy, ReceiptData } from '@/types/receipt';

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

/**
 * Pause between write-without-response chunks. Without it, cheap BLE
 * printers overflow their buffer and drop data (cut-off or blank slips).
 */
const BLE_CHUNK_DELAY_MS = 8;

/** Attempts to re-establish a dropped BLE link before giving up. */
const BLE_AUTO_RECONNECT_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  /** Printer has an auto-cutter (default false: tear-off). */
  autoCut?: boolean;
}

// ── Service ──────────────────────────────────────────────────────────

class PrinterService {
  private bluetoothDevice: BluetoothDevice | null = null;
  private bluetoothCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private serialPort: SerialPort | null = null;
  private config: PrinterConfig = { type: null, name: '' };
  private listeners = new Set<() => void>();
  private reconnecting: Promise<boolean> | null = null;
  private manualDisconnect = false;

  constructor() {
    this.loadConfig();
    this.watchSerialHotplug();
  }

  // ── Status subscription ──────────────────────────────────────────

  /** Subscribe to connection changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  /**
   * Re-open a USB printer automatically when its cable is plugged back in,
   * and drop the stale port when it's unplugged.
   */
  private watchSerialHotplug() {
    if (!this.isWebSerialAvailable) return;
    navigator.serial!.addEventListener('disconnect', (event) => {
      if (event.target === this.serialPort) {
        this.serialPort = null;
        this.notify();
      }
    });
    navigator.serial!.addEventListener('connect', () => {
      if (this.config.type === 'serial' && !this.isConnected) {
        void this.reconnect();
      }
    });
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

  get autoCut(): boolean {
    return this.config.autoCut ?? false;
  }

  set autoCut(value: boolean) {
    this.config.autoCut = value;
    this.saveConfig();
    this.notify();
  }

  get printerName(): string {
    return this.config.name;
  }

  /** A direct printer has been set up on this device (connected or not). */
  get isConfigured(): boolean {
    return this.config.type !== null;
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
      // Clear the characteristic only — keep the device and config so we can
      // reconnect without the user having to pick the printer again.
      this.bluetoothCharacteristic = null;
      this.notify();
      if (!this.manualDisconnect && this.config.type === 'bluetooth') {
        void this.autoReconnectBluetooth(device);
      }
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
        autoCut: this.config.autoCut,
        type: 'bluetooth',
        name: device.name ?? 'Bluetooth Printer',
        id: device.id,
      };
      this.saveConfig();

      this.manualDisconnect = false;
      this.registerBleDisconnectHandler(device);
      this.notify();

      return true;
    } catch (err) {
      if ((err as Error).name === 'NotFoundError') {
        return false;
      }
      throw err;
    }
  }

  /** Retry a dropped BLE link with backoff (printer went to sleep, out of range, etc). */
  private async autoReconnectBluetooth(device: BluetoothDevice) {
    for (let attempt = 1; attempt <= BLE_AUTO_RECONNECT_ATTEMPTS; attempt++) {
      await sleep(1000 * attempt);
      if (this.manualDisconnect || this.isConnected) return;
      if (await this.connectGatt(device)) return;
    }
  }

  private async connectGatt(device: BluetoothDevice): Promise<boolean> {
    if (!device.gatt) return false;
    try {
      const server = await device.gatt.connect();
      this.bluetoothCharacteristic = await this.findBluetoothWriteCharacteristic(server);
      this.bluetoothDevice = device;
      this.notify();
      return true;
    } catch {
      return false;
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
        autoCut: this.config.autoCut,
        type: 'serial',
        name: `USB Printer (vendor ${info.usbVendorId ?? 'unknown'})`,
        usbVendorId: info.usbVendorId,
        usbProductId: info.usbProductId,
        baudRate: DEFAULT_BAUD_RATE,
      };
      this.saveConfig();
      this.manualDisconnect = false;
      this.notify();

      return true;
    } catch (err) {
      if ((err as Error).name === 'NotFoundError') {
        return false;
      }
      throw err;
    }
  }

  // ── Reconnect ────────────────────────────────────────────────────

  /**
   * Restore the saved printer without showing a device picker.
   * Safe to call repeatedly; concurrent calls share one attempt.
   */
  async reconnect(): Promise<boolean> {
    if (!this.config.type) return false;
    if (this.isConnected) return true;
    if (this.reconnecting) return this.reconnecting;

    this.reconnecting = (async () => {
      if (this.config.type === 'bluetooth' && this.isWebBluetoothAvailable) {
        return this.reconnectBluetooth();
      }
      if (this.config.type === 'serial' && this.isWebSerialAvailable) {
        return this.reconnectSerial();
      }
      return false;
    })();

    try {
      return await this.reconnecting;
    } finally {
      this.reconnecting = null;
      this.notify();
    }
  }

  private async reconnectBluetooth(): Promise<boolean> {
    // Same session: reuse the device object we already have.
    if (this.bluetoothDevice) {
      return this.connectGatt(this.bluetoothDevice);
    }

    if (!this.config.id) return false;

    try {
      // getDevices() lists previously-permitted printers (needs a recent Chrome/Edge).
      const devices = (await navigator.bluetooth!.getDevices?.()) ?? [];
      const device = devices.find((d: BluetoothDevice) => d.id === this.config.id);
      if (!device) return false;

      if (!(await this.connectGatt(device))) return false;
      this.registerBleDisconnectHandler(device);
      return true;
    } catch {
      return false;
    }
  }

  private async reconnectSerial(): Promise<boolean> {
    try {
      const ports = await navigator.serial!.getPorts();
      const { usbVendorId, usbProductId } = this.config;
      const port =
        // Prefer an exact vendor+product match, then vendor only, then the only permitted port.
        ports.find((p) => {
          const info = p.getInfo();
          return info.usbVendorId === usbVendorId && info.usbProductId === usbProductId;
        }) ??
        ports.find((p) => usbVendorId != null && p.getInfo().usbVendorId === usbVendorId) ??
        (ports.length === 1 ? ports[0] : undefined);

      if (!port) return false;

      // The port may still be open from before (e.g. a failed write); reuse it.
      if (!port.writable) {
        const baudRate = this.config.baudRate ?? DEFAULT_BAUD_RATE;
        await port.open({ baudRate });
      }

      this.serialPort = port;
      return true;
    } catch {
      return false;
    }
  }

  // ── Disconnect ───────────────────────────────────────────────────

  /** Explicit user-triggered disconnect — clears everything. */
  disconnect() {
    this.manualDisconnect = true;
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
    this.notify();
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
        await sleep(BLE_CHUNK_DELAY_MS);
      } else {
        await characteristic.writeValueWithResponse(chunk);
      }
    }
  }

  private async printSerial(data: Uint8Array) {
    if (!this.serialPort?.writable) throw new Error('Printer not connected');

    const port = this.serialPort;
    const writer = port.writable!.getWriter();
    try {
      await writer.write(data);
    } catch (err) {
      // Port is broken (cable pulled, printer power-cycled). Close it so the
      // next reconnect re-opens it cleanly instead of reusing a dead handle.
      this.serialPort = null;
      port.close().catch(() => {});
      this.notify();
      throw err;
    } finally {
      writer.releaseLock();
    }
  }

  // ── Receipt printing ─────────────────────────────────────────────

  /**
   * Print a receipt on the thermal printer, reconnecting first if the link dropped.
   *
   * IMPORTANT: on failure we throw rather than retry automatically, so the
   * cashier sees the problem and we never print duplicate receipts when the
   * printer already received part of the data.
   */
  async printReceipt(
    data: ReceiptData,
    {
      copies = ['customer', 'accounts'],
      reprint = false,
      settings,
    }: { copies?: ReceiptCopy[]; reprint?: boolean; settings?: Partial<ReceiptSettings> } = {},
  ) {
    if (!this.config.type) {
      throw new Error('No printer set up. Connect one via USB or Bluetooth first.');
    }
    if (!(await this.reconnect())) {
      throw new Error(
        `Can't reach ${this.config.name || 'the printer'}. Check it is switched on and the cable/Bluetooth is connected, then press Print again.`,
      );
    }
    try {
      // All copies go in one job so they come out back-to-back, each cut separately.
      await this.print(encodeReceiptCopies(data, copies, { reprint, autoCut: this.autoCut, settings }));
    } catch (err) {
      console.error('Direct printer communication failed:', err);
      throw new Error(
        'Printer communication failed. Please check the printer before printing again.',
      );
    }
  }
}

export const printer = new PrinterService();
