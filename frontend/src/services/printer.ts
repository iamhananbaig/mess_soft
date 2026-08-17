import { encodeReceipt } from '@/lib/escpos';
import type { ReceiptData } from '@/components/Receipt';
import { printReceipt as browserPrint } from '@/components/Receipt';

const STORAGE_KEY = 'printer_config';

interface PrinterConfig {
  type: 'bluetooth' | 'serial' | null;
  name: string;
  id?: string;
}

class PrinterService {
  private bluetoothDevice: BluetoothDevice | null = null;
  private bluetoothCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private serialPort: SerialPort | null = null;
  private config: PrinterConfig = { type: null, name: '' };

  constructor() {
    this.loadConfig();
  }

  private loadConfig() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.config = JSON.parse(stored);
      }
    } catch {
      // ignore
    }
  }

  private saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      // ignore
    }
  }

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
      return this.serialPort?.readable !== null && this.serialPort?.writable !== null;
    }
    return false;
  }

  get isWebBluetoothAvailable(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  get isWebSerialAvailable(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.serial;
  }

  async connectBluetooth(): Promise<boolean> {
    if (!this.isWebBluetoothAvailable) {
      throw new Error('Web Bluetooth is not supported in this browser. Use Chrome or Edge.');
    }

    try {
      const device = await navigator.bluetooth!.requestDevice({
        filters: [{ services: ['battery_service'] }],
        optionalServices: ['battery_service'],
      });

      if (!device.gatt) {
        throw new Error('Printer does not support GATT');
      }

      const server = await device.gatt.connect();

      const serviceUUIDs = [
        '000018f0-0000-1000-8000-00805f9b34fb',
        '0000fee7-0000-1000-8000-00805f9b34fb',
        '00001101-0000-1000-8000-00805f9b34fb',
      ];

      let characteristic: BluetoothRemoteGATTCharacteristic | null = null;

      for (const serviceUUID of serviceUUIDs) {
        try {
          const service = await server.getPrimaryService(serviceUUID);
          const chars = await service.getCharacteristics();
          characteristic = chars.find(
            (c: BluetoothRemoteGATTCharacteristic) => c.properties.write || c.properties.writeWithoutResponse
          ) ?? null;
          if (characteristic) break;
        } catch {
          // Service not found, try next
        }
      }

      if (!characteristic) {
        const services = await server.getPrimaryServices();
        for (const svc of services) {
          const chars = await svc.getCharacteristics();
          characteristic = chars.find(
            (c: BluetoothRemoteGATTCharacteristic) => c.properties.write || c.properties.writeWithoutResponse
          ) ?? null;
          if (characteristic) break;
        }
      }

      if (!characteristic) {
        throw new Error('Could not find a writable characteristic on the printer');
      }

      this.bluetoothDevice = device;
      this.bluetoothCharacteristic = characteristic;
      this.config = {
        type: 'bluetooth',
        name: device.name ?? 'Bluetooth Printer',
        id: device.id,
      };
      this.saveConfig();

      device.addEventListener('gattserverdisconnected', () => {
        this.bluetoothDevice = null;
        this.bluetoothCharacteristic = null;
        this.config = { type: null, name: '' };
        this.saveConfig();
      });

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

      await port.open({ baudRate: 9600 });

      this.serialPort = port;
      const info = port.getInfo();
      this.config = {
        type: 'serial',
        name: `USB Printer (vendor ${info.usbVendorId ?? 'unknown'})`,
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

  async reconnect(): Promise<boolean> {
    if (!this.config.type || !this.config.id) return false;

    if (this.config.type === 'bluetooth' && this.isWebBluetoothAvailable) {
      try {
        const devices = await navigator.bluetooth!.getDevices();
        const device = devices.find((d: BluetoothDevice) => d.id === this.config.id);
        if (device?.gatt) {
          const server = await device.gatt.connect();
          const services = await server.getPrimaryServices();
          for (const svc of services) {
            const chars = await svc.getCharacteristics();
            const found = chars.find(
              (c: BluetoothRemoteGATTCharacteristic) => c.properties.write || c.properties.writeWithoutResponse
            );
            if (found) {
              this.bluetoothDevice = device;
              this.bluetoothCharacteristic = found;
              return true;
            }
          }
        }
      } catch {
        // Reconnect failed
      }
    }

    return false;
  }

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
    const MTU = 20;

    for (let i = 0; i < data.length; i += MTU) {
      const chunk = data.slice(i, i + MTU);
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

  async printReceipt(data: ReceiptData) {
    if (this.isConnected && this.config.type) {
      try {
        const escposData = encodeReceipt(data);
        await this.print(escposData);
        return;
      } catch (err) {
        console.warn('Direct print failed, falling back to browser print:', err);
      }
    }

    browserPrint(data);
  }
}

export const printer = new PrinterService();

