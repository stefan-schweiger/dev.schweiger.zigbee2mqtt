'use strict';

import { stringUtils } from '../../lib/utils';
import { DeviceClass, findCapabilities, Zigbee2MqttDevice } from '../../lib';

class Device extends Zigbee2MqttDevice {
  /** onInit is called when the device is initialized. */
  async onInit() {
    await this.setUnavailable('initializing', 'Initializing');

    try {
      await this.initializeDevice();
      await this.setAvailable();
    } catch (e) {
      await this.setUnavailable('other', e instanceof Error ? e.message : 'Could not initialize device');
    }

    this.registerCapabilityListener('button.repair', async () => {
      await this.initializeDevice();
      await this.setAvailable();
    });

    this.log(`${this.getName()} has been initialized`);
  }

  private async initializeDevice() {
    const deviceInfo = this.app.getDevice(this.deviceId);

    if (!deviceInfo) {
      throw new Error(`Device ${this.deviceId} not found`);
    }

    const {
      // don't re-apply device_class from bridge device info because the user might have changed it
      settings: { device_class, ...settings },
      store,
    } = deviceInfo;

    // re-apply settings and store in case something has changed
    this.setSettings({ ...settings });
    await this.setStore({ ...store });

    await this.applyCapabilities(this.getSetting('device_class') ?? 'other');
  }

  private async applyCapabilities(deviceClass: DeviceClass) {
    this.setClass(deviceClass);
    const store = this.getStore();

    const capabilities = findCapabilities(store.exposes);

    // register capabilities
    for (const cap of capabilities) {
      await this.addCapability(cap.capability);
      const options: Record<string, any> = {};

      if (cap.subCapability) {
        options.title = stringUtils.toHuman(cap.subCapability);
      }

      if (store.options.some((o) => o.property === 'transition')) {
        // if device can accept a transition duration add it as an option for the capabilities
        options.duration = true;
      }
      if (cap.capability.startsWith('measure_') && cap.unit) {
        // add units for measures
        options.units = { en: cap.unit };
      }

      await this.setCapabilityOptions(cap.capability, options);

      this.registerCapabilityListener(cap.capability, async (v, opts) => {
        const options = {
          ...opts,
          // add as helpers for setting color values correctly
          hue: this.getCapabilityValue('light_hue'),
          saturation: this.getCapabilityValue('light_saturation'),
          dim: this.getCapabilityValue('dim'),
          // helpers to map values to the correct range
          min: cap.min,
          max: cap.max,
          // used to expose the correct value to Zigbee2MQTT
          property: cap.property,
        };

        cap.set && (await this.app.setDeviceProperties(this.deviceId, cap.set(v, options)));
      });
    }

    // remove capabilities which aren't used anymore
    for (const cap of this.getCapabilities()) {
      !capabilities.some((c) => c.capability === cap) && cap !== 'button.repair' && (await this.removeCapability(cap));
    }

    // listen for new device messages from mqtt
    await this.app.setDeviceListener(this.deviceId, (payload) => {
      for (const property of Object.keys(payload)) {
        if (property === 'availability') {
          this.handleDeviceAvailability(payload[property]);
          continue;
        }

        const caps = capabilities.filter((c) => c.property === property);

        for (const cap of caps) {
          const options = { min: cap.min, max: cap.max, property };
          // trigger capabilities are only placeholder capabilities to trigger flows
          if (cap?.capability.startsWith('trigger')) {
            this.driver.getTriggerCard(cap.capability.split('_')[1])?.trigger(this, undefined, { value: cap.get(payload, options) });
          } else if (cap) {
            const capValue = cap.get(payload, options);
            capValue != null && this.setCapabilityValue(cap.capability, capValue);

            // trigger card for onoff sub capabilities
            if (cap.capability.startsWith('onoff.')) {
              this.driver.getTriggerCard('onoff.endpoint')?.trigger(this, undefined, { endpoint: cap.subCapability, value: capValue });
            }
            // TODO: implement dim trigger with token
            // else if (cap.capability.startsWith('dim.')) {
            //   this.driver.getTriggerCard('dim.endpoint')?.trigger(this, undefined, { endpoint: cap.subCapability, value: capValue });
            // }
          }
        }
      }
    });
  }

  /** Handle the Zigbee2MQTT device availability feature */
  private handleDeviceAvailability(value: string) {
    if (value === 'online') {
      // set device back to available if it was unavailable because the device was offline
      const availability = this.getAvailability();
      !availability.state && availability.reason === 'device-offline' && this.setAvailable();
    } else if (value === 'offline') {
      switch (this.getSetting('availability-handling')) {
        case 'ignore':
          this.log('Device offline: Ignore');
          break;
        case 'power-off':
          this.log('Device offline: Power Off');
          this.hasCapability('onoff') && this.setCapabilityValue('onoff', false);
          break;
        default:
          this.log('Device offline: Set Unavailable');
          this.setUnavailable('device-offline', 'Device is offline');
          break;
      }
    }
  }

  async onSettings({ newSettings, changedKeys }: { newSettings: any; changedKeys: string[] }): Promise<string | void> {
    if (changedKeys.includes('device_class')) {
      await this.applyCapabilities(newSettings.device_class);
    }
  }
}

module.exports = Device;
