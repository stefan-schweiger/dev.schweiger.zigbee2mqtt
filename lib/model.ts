'use strict';

import { capabilities, CapabilityGetValueMapper, CapabilitySetValueMapper } from './capabilitiesMap';
import { DeviceClass, deviceClasses } from './deviceClassesMap';

export { DeviceClass } from './deviceClassesMap';

type Capability = {
  capability: string;
  subCapability?: string;
  property: string;
  unit?: string;
  min?: number;
  max?: number;
  get: CapabilityGetValueMapper;
  set?: CapabilitySetValueMapper;
};

export enum Access {
  Publish = 1 << 0, // 0001
  Set = 1 << 1, // 0010
  Get = 1 << 2, // 0100
}

type Feature = {
  lookup_property: string;
  property: string;
  type: 'numeric' | 'binary' | 'enum';
  access: number;
  unit?: string;
  value_min?: number;
  value_max?: number;
  values?: string[];
};

export type DeviceInfo = {
  name: string;
  icon: string;
  data: { id: string };
  store: {
    power: string;
    type: string;
    exposes: Feature[];
    options: { property: string }[];
    endpoints: Record<string, unknown>;
  };
  settings: {
    ieee_address: string;
    friendly_name: string;
    vendor: string;
    model: string;
    description: string;
    device_class: DeviceClass;
  };
};

const findCapability = (feat: Feature): Capability | undefined => {
  // some capabilities have sub properties like brightness_l1, so we need to extract the sub property
  // and expose them as sub capabilities to show multiple ui elements
  const [_, _property, endpoint, _subProperty] = /^(state|brightness|color_temp|color_mode|color)(?:_([A-z0-9]+))?(?:\.(\w))?$/.exec(
    feat.property,
  ) ?? [null, feat.property];

  const [capability, get, set] = capabilities[feat.lookup_property] ?? [];

  if (capability) {
    const result = {
      capability: `${capability}${endpoint ? `.${endpoint}` : ''}`,
      subCapability: endpoint ?? undefined,
      property: feat.property,
      unit: feat.unit,
      min: feat.value_min,
      max: feat.value_max,
      get,
      set,
    };
    return result;
  }
};

export const findCapabilities = (exposes: Feature[]): Capability[] => {
  // remove undefined entries for unmapped capabilities
  const capabilities = exposes.map((e) => findCapability(e)).filter(Boolean) as Capability[];
  // remove duplicates in case of multiple features for the same capability
  return [...new Map(capabilities.map((item) => [item.capability, item])).values()];
};

export const findDeviceClass = (description: string): DeviceClass =>
  (Object.entries(deviceClasses).find(([_, v]) => v.keywords.some((k) => description.toLowerCase().includes(k)))?.[0] as DeviceClass) ??
  'other';

const findDeviceSubClass = (deviceClass: keyof typeof deviceClasses, description: string) => {
  const subClasses = deviceClasses[deviceClass].subClass ?? {};
  const subClass = Object.entries(subClasses).find(([_, v]) => v.some((k) => description.toLowerCase().includes(k)))?.[0];
  return subClass ? `${deviceClass}_${subClass}` : deviceClass;
};

/**
 * Build up lookup property in the format "type#composite_property.property".
 * for example "illuminance", "light#brightness" or "light#color.hue"
 */
const getLookupProp = (parent: any, property: string = ''): string => {
  let [_, baseProperty] = /^(state|brightness|color_temp|color_mode|color)_/.exec(property) ?? [null, property];

  if (parent?.property) {
    baseProperty = `${parent.property}.${baseProperty}`;
  } else if (parent?.type) {
    baseProperty = `${parent.type}#${baseProperty}`;
  }

  return parent?.parent ? getLookupProp(parent.parent, baseProperty) : baseProperty;
};

/**
 * Flatten the nested type/composite features to a list of features with a lookup property and a property name.
 */
const flattenFeatures = (features: any[], parent?: any): any[] => {
  return features.reduce((acc, x) => {
    if (parent) {
      x.parent = parent;
    }

    x.lookup_property = getLookupProp(parent, x.property);
    x.property = x.lookup_property.split('#').at(-1);
    if (x.features) {
      acc = acc.concat(flattenFeatures(x.features, x));
      delete x.features;
      delete x.lookup_property;
    } else if (x.property) {
      acc = acc.concat(x);
    }
    return acc;
  }, []);
};

/**
 * Map the Zigbee2MQTT device to typed DeviceInfo record
 */
export const mapBridgeDevice = (device: any): DeviceInfo => {
  const description = device.definition?.description || device.model_id || '';
  const deviceClass = findDeviceClass(description);
  const icon = findDeviceSubClass(deviceClass, description);

  // flatten the structure of exposes to an array
  const exposes: Feature[] = flattenFeatures(device.definition?.exposes);

  // color_mode is not exposed for whatever reason, but it will be supplied if light.color
  if (exposes.some((e) => e.lookup_property.startsWith('light#color.'))) {
    exposes.push({
      property: 'color_mode',
      lookup_property: 'light#color_mode',
      type: 'enum',
      access: Access.Get,
    });
  }

  return {
    name: device.friendly_name,
    icon: `${icon}.svg`,
    data: {
      id: device.ieee_address,
    },
    store: {
      power: device.power_source,
      type: device.type,
      exposes,
      options: device.definition?.options,
      endpoints: device.endpoints,
    },
    settings: {
      ieee_address: device.ieee_address,
      friendly_name: device.friendly_name,
      description,
      vendor: device.definition?.vendor || device.manufacturer,
      model: device.definition?.model || device.model_id,
      device_class: deviceClass,
    },
  };
};
