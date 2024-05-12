'use strict';

import Homey from 'homey';

import { Zigbee2MqttApp, Zigbee2MqttDevice, Zigbee2MqttDeviceDriver } from '../../lib';
import { stringUtils } from '../../lib/utils';

class DeviceDriver extends Zigbee2MqttDeviceDriver {
  private triggerCards: Record<string, Homey.FlowCardTriggerDevice | undefined> = {};

  /** onInit is called when the driver is initialized.*/
  async onInit() {
    this.registerActionTrigger();
    this.registerOnOffTrigger();
    this.registerEffectAction();
    this.registerOnOffEndpointAction();
    this.registerDimEndpointAction();

    // change the device availability depending on the bridge state
    this.homey.app.on('bridge-state-changed', (state) => {
      switch (state) {
        case 'online':
          this.getDevices().forEach((d) => d.setAvailable());
          break;
        case 'offline':
          this.getDevices().forEach((d) => (d as Zigbee2MqttDevice).setUnavailable('bridge-offline', 'Bridge is offline'));
          break;
      }
    });

    // when the devices change set device which have been removed to unavailable (or reverse if they have been found again)
    this.homey.app.on('devices-changed', () => {
      for (const device of this.getDevices() as Zigbee2MqttDevice[]) {
        if (this.app.getDevice(device.getData().id)) {
          const availability = device.getAvailability();
          if (!availability.state && availability.reason === 'device-not-found') {
            device.setAvailable();
          }
        } else {
          device.setUnavailable('device-not-found', 'Device removed or disabled');
        }
      }
    });

    this.log('DeviceDriver has been initialized');
  }

  /**
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    const existingDeviceIds = this.getDevices().map((d) => d.getData().id);
    return [...(this.homey.app as Zigbee2MqttApp).getDevices().filter((d) => !existingDeviceIds.includes(d.data.id))];
  }

  getTriggerCard(name: string) {
    return this.triggerCards[name];
  }

  private getEndpointAutocomplete(device: Zigbee2MqttDevice, capability: string) {
    return (
      device
        .getCapabilities()
        .filter((c) => c.startsWith(`${capability}.`))
        .map((c) => c.split('.')[1])
        .map((value: string) => ({ name: stringUtils.toHuman(value), description: value, value })) ?? []
    );
  }

  private registerActionTrigger() {
    const actionTriggerCard = this.homey.flow.getDeviceTriggerCard('action');

    // if the device exposes action (= has capability trigger_action)
    // this will add a WHEN card with autocomplete for the possible actions
    actionTriggerCard
      .registerArgumentAutocompleteListener(
        'action',
        async (query, args) =>
          (args.device as Zigbee2MqttDevice)
            .getStore()
            .exposes?.find((f) => f.property === 'action' && f.type === 'enum')
            ?.values?.filter((x: string) => x.toLowerCase().startsWith(query.toLowerCase()))
            .map((value: string) => ({ name: stringUtils.toHuman(value), description: value, value })) ?? [],
      )
      .registerRunListener((args, state) => args.action.value === state.value);

    this.triggerCards['action'] = actionTriggerCard;
  }

  private registerOnOffTrigger() {
    const onoffTriggerCard = this.homey.flow.getDeviceTriggerCard('onoff.endpoint');

    onoffTriggerCard
      .registerArgumentAutocompleteListener('endpoint', async (_query, args) =>
        this.getEndpointAutocomplete(args.device as Zigbee2MqttDevice, 'onoff'),
      )
      .registerRunListener((args, state) => args.endpoint.value === state.endpoint && (args.val === 'on') === state.value);

    this.triggerCards['onoff.endpoint'] = onoffTriggerCard;
  }

  private registerEffectAction() {
    const effectActionCard = this.homey.flow.getActionCard('effect');

    // if the device exposes effect (= has capability action_effect)
    // this will add a THEN card with autocomplete for the possible effects
    effectActionCard
      .registerArgumentAutocompleteListener(
        'effect',
        async (query, args) =>
          (args.device as Zigbee2MqttDevice)
            .getStore()
            .exposes?.find((f) => f.property === 'effect' && f.type === 'enum')
            ?.values?.filter((x: string) => x.toLowerCase().startsWith(query.toLowerCase()))
            .map((value: string) => ({ name: stringUtils.toHuman(value), description: value, value })) ?? [],
      )
      .registerRunListener((args, _state) => {
        const device = args.device as Zigbee2MqttDevice;
        device && this.app.setDeviceProperties(device.deviceId, { effect: args.effect.value });
      });
  }

  private registerOnOffEndpointAction() {
    const onoffActionCard = this.homey.flow.getActionCard('onoff.endpoint');

    onoffActionCard
      .registerArgumentAutocompleteListener('endpoint', async (_query, args) =>
        this.getEndpointAutocomplete(args.device as Zigbee2MqttDevice, 'onoff'),
      )
      .registerRunListener((args, _state) => {
        const device = args.device as Zigbee2MqttDevice;
        device && device.setCapabilityValue(`onoff.${args.endpoint.value}`, args.val === 'on');
        device && device.triggerCapabilityListener(`onoff.${args.endpoint.value}`, args.val === 'on');
      });
  }

  private registerDimEndpointAction() {
    const dimActionCard = this.homey.flow.getActionCard('dim.endpoint');

    dimActionCard
      .registerArgumentAutocompleteListener('endpoint', async (_query, args) =>
        this.getEndpointAutocomplete(args.device as Zigbee2MqttDevice, 'dim'),
      )
      .registerRunListener((args, _state) => {
        const device = args.device as Zigbee2MqttDevice;
        device && device.setCapabilityValue(`dim.${args.endpoint.value}`, args.val);
        device && device.triggerCapabilityListener(`dim.${args.endpoint.value}`, args.val);
      });
  }
}

module.exports = DeviceDriver;
