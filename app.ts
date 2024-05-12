'use strict';

import mqtt, { MqttClient } from 'mqtt';
import { Access, DeviceInfo, Zigbee2MqttApp, mapBridgeDevice } from './lib';
import { objectUtils } from './lib/utils';

const DEFAULT_TOPIC = 'zigbee2mqtt';

const SETTING_SERVER = 'server';
const SETTING_TOPIC = 'topic';
const SETTING_USERNAME = 'username';
const SETTING_PASSWORD = 'password';

const MAX_LISTENERS = 200;

class App extends Zigbee2MqttApp {
  private mqttClient?: MqttClient;
  private baseTopic = DEFAULT_TOPIC;

  private devices: DeviceInfo[] = [];

  private getSetting = (key: string): any => this.homey.settings.get(key);
  private setSetting = (key: string, value: any): void => this.homey.settings.set(key, value);

  /** onInit is called when the app is initialized. */
  async onInit() {
    const bridgeStateTrigger = this.homey.flow.getTriggerCard('bridge_state');
    bridgeStateTrigger.registerRunListener((args, state) => args.state === state.state);

    this.homey.app.addListener('bridge-state-changed', (state) => {
      bridgeStateTrigger.trigger(undefined, { state });
    });

    if (this.getSetting(SETTING_TOPIC) === null) {
      this.setSetting('topic', DEFAULT_TOPIC);
    }

    if (this.getSetting(SETTING_SERVER)) {
      try {
        await this.connect();
      } catch (e) {
        this.log('Connection during onInit failed');
      }
    }
  }

  /** Connect to the MQTT broker with the current settings */
  async connect() {
    const server = this.homey.settings.get('server');
    this.log(`Try to connect to ${server}`);

    try {
      this.mqttClient = await mqtt.connectAsync(server, {
        username: this.getSetting(SETTING_USERNAME),
        password: this.getSetting(SETTING_PASSWORD),
      });
      this.baseTopic = this.getSetting(SETTING_TOPIC);

      this.mqttClient
        .setMaxListeners(MAX_LISTENERS)
        .subscribe(`${this.baseTopic}/bridge/devices`)
        .subscribe(`${this.baseTopic}/bridge/state`)
        .on('message', (topic, payload) => this.handleMessage(topic, JSON.parse(payload.toString())));
    } catch (e) {
      this.mqttClient = undefined;
      throw new Error(`Not able to connect to ${server}`);
    }

    this.log(`Connected to ${server}`);
  }

  private handleMessage(topic: string, payload: any) {
    switch (topic) {
      case `${this.baseTopic}/bridge/devices`:
        this.devices = payload
          // ignore coordinator and disabled devices
          .filter((d: { type: string; disabled: boolean }) => d.type !== 'Coordinator' && !d.disabled)
          .map(mapBridgeDevice);

        this.homey.app.emit('devices-changed');
        this.log(`${this.devices.length} devices loaded.`);
        break;
      case `${this.baseTopic}/bridge/state`:
        this.homey.app.emit('bridge-state-changed', payload.state);
        this.log(`Bridge state changed to ${payload.state}`);
        break;
    }
  }

  /** Adds a listener for device messages from Zigbee2MQTT */
  async setDeviceListener(id: string, callback: (payload: any) => void) {
    if (!this.mqttClient || this.mqttClient.disconnected) {
      throw new Error('Not connected to MQTT server');
    }

    const deviceTopic = `${this.baseTopic}/${id}`;

    this.mqttClient.on('message', (topic, payload) => {
      switch (topic) {
        case deviceTopic:
          callback(objectUtils.flatten(JSON.parse(payload.toString())));
          break;
        case `${deviceTopic}/availability`:
          const availability = JSON.parse(payload.toString());
          this.log(`${deviceTopic}/availability`, { availability: availability.state });
          callback({ availability: availability.state });
          break;
      }
    });

    await this.mqttClient.subscribeAsync(deviceTopic);
    await this.mqttClient.subscribeAsync(`${deviceTopic}/availability`);

    // try to get the current device state immediately
    // but we should only consider properties which are actually getable
    // for now only take first getable property, because otherwise multiple messages will be received
    const getableProp = this.getDevice(id)?.store.exposes.find((e) => (e.access & Access.Get) === Access.Get);
    const getable = getableProp && { [getableProp?.property ?? '']: '' };
    // const getable = Object.fromEntries(
    //   this.getDevice(id)
    //     ?.store.exposes.filter((e) => (e.access & Access.Get) === Access.Get)
    //     .map((e) => [e.property, '']) ?? [],
    // );

    getable && (await this.mqttClient.publishAsync(`${deviceTopic}/get`, JSON.stringify(objectUtils.unflatten(getable))));
    this.log(`Subscribed to ${deviceTopic}`);
  }

  /** Publish the properties for a certain device to Zigbee2MQTT. */
  async setDeviceProperties(id: string, properties: Record<string, any>): Promise<void> {
    if (!this.mqttClient || this.mqttClient.disconnected) {
      throw new Error('Not connected to MQTT server');
    }

    this.log(`${this.baseTopic}/${id}/set`, JSON.stringify(properties));

    await this.mqttClient.publishAsync(`${this.baseTopic}/${id}/set`, JSON.stringify(objectUtils.unflatten(properties)));
  }

  /** Get a single device by ieee_address or friendly_name */
  getDevice(deviceId: string): DeviceInfo | undefined {
    return this.devices.find((d) => d.data.id === deviceId || d.settings.friendly_name === deviceId);
  }

  /** Get all available devices */
  getDevices(): DeviceInfo[] {
    return this.devices;
  }
}

module.exports = App;
