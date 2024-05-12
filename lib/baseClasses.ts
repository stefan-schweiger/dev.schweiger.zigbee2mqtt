'use strict';

import Homey from 'homey';
import { DeviceInfo } from './model';

export abstract class Zigbee2MqttApp extends Homey.App {
  abstract getDevices(): DeviceInfo[];
  abstract getDevice(deviceId: string): DeviceInfo | undefined;
  abstract setDeviceListener(id: string, callback: (payload: Record<string, any>) => void): Promise<void>;
  abstract setDeviceProperties(id: string, properties: Record<string, any>): Promise<void>;
};

export abstract class Zigbee2MqttDeviceDriver extends Homey.Driver {
  get app(): Zigbee2MqttApp {
    return this.homey.app as Zigbee2MqttApp;
  }

  abstract getTriggerCard(name: string): Homey.FlowCardTriggerDevice | undefined;
};


export type UnavailabilityReason = 'initializing' | 'device-offline' | 'device-not-found' | 'bridge-offline' | 'other';

export abstract class Zigbee2MqttDevice extends Homey.Device {
  declare driver: Zigbee2MqttDeviceDriver;

  #unavailabilityReason: UnavailabilityReason | undefined;

  get app(): Zigbee2MqttApp {
    return this.homey.app as Zigbee2MqttApp;
  }

  get deviceId(): string {
    return this.getSetting('friendly_name') || this.getData().id;
  }
  getData(): DeviceInfo['data'] {
    return super.getData();
  }
  getStore(): DeviceInfo['store'] {
    return super.getStore();
  }
  getSetting(key: keyof DeviceInfo['settings'] | 'availability-handling') {
    return super.getSetting(key);
  }

  async setStore(store: DeviceInfo['store']) {
    for (const [k, v] of Object.entries(store)) {
      await this.setStoreValue(k, v);
    }
  }

  getAvailability(): { state: true } | { state: false, reason?: UnavailabilityReason; } {
      if (this.#unavailabilityReason) return { state: false, reason: this.#unavailabilityReason };
      return super.getAvailable() ? { state: true } : { state: false, reason: 'other' };
  }

  async setAvailable(): Promise<any> {
    const result = await super.setAvailable();
    this.#unavailabilityReason = undefined;
    return result;
  }
  async setUnavailable(reason: UnavailabilityReason, message?: string | null | undefined): Promise<any> {
    const result = await super.setUnavailable(message);
    this.#unavailabilityReason = reason;
    return result;
  }
}
