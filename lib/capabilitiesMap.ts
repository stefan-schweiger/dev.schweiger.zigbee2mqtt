import { ColorHSV, ColorXY } from './color';
import { numberUtils } from './utils';

const { mapValueRange } = numberUtils;

export type CapabilityGetValueMapper = (v: Record<string, any>, opts: Record<string, any> & { property: string }) => any;
export type CapabilitySetValueMapper = (v: any, opts: Record<string, any> & { property: string }) => any;

type CapabilityMapValue = [string, CapabilityGetValueMapper, CapabilitySetValueMapper] | [string, CapabilityGetValueMapper];
type CapabilityMap = Record<string, CapabilityMapValue>;

const withTransition = <T>(value: T, duration: number | undefined): T & { transition: number | undefined } => {
  return { ...value, transition: duration ? duration / 1000 : undefined };
};

const measure = (capability: `measure_${string}`): [string, CapabilityGetValueMapper] => [capability, (v, opts) => v[opts.property]];
const meter = (capability: `meter_${string}`): [string, CapabilityGetValueMapper] => [capability, (v, opts) => Number(v[opts.property])];
const alarm = (capability: `alarm_${string}`, invert?: boolean): [string, CapabilityGetValueMapper] => [
  capability,
  (v, opts) => (invert ? !v[opts?.property] : v[opts?.property]),
];

export const capabilities: CapabilityMap = {
  // "placeholder" capabilities for cards
  action: ['trigger_action', (v, opts) => v[opts.property]],
  effect: ['action_effect', (v, opts) => v[opts.property]],

  // complex composite capabilities
  'light#state': [
    'onoff',
    (v, opts) => v[opts.property] === 'ON',
    // state might have some subprops like brightness_l1 so use the property name from the options
    (v: boolean, opts) => withTransition({ [opts.property]: v ? 'ON' : 'OFF' }, opts?.duration),
  ],
  'light#brightness': [
    'dim',
    (v, opts) => mapValueRange(opts.min, opts.max, 0, 1, v[opts.property]),
    // brightness might have some subprops like brightness_l1 so use the property name from the options
    (v: number, opts) => withTransition({ [opts.property]: mapValueRange(0, 1, opts.min, opts.max, v) }, opts?.duration),
  ],
  'light#color_temp': [
    'light_temperature',
    (v, opts) => (opts.color_mode !== 'color_temp' ? mapValueRange(opts.min, opts.max, 0, 1, v[opts.property]) : null),
    (v: number, opts) => withTransition({ color_temp: mapValueRange(0, 1, opts.min, opts.max, v) }, opts?.duration),
  ],
  'light#color_mode': [
    'light_mode',
    (v) => (v.color_mode === 'color_temp' ? 'temperature' : 'color'),
    (v: string, opts) =>
      v === 'temperature'
        ? { color_temp: 250 }
        : {
            color: {
              hue: opts.hue * 360,
              saturation: opts.saturation * 100,
              ...new ColorHSV(opts.hue, opts.saturation, 1).toXY().toObject(),
            },
          },
  ],

  'light#color.hue': [
    'light_hue',
    (v) => ({ xy: new ColorXY(v['color.x'], v['color.y']).toHSV().hue, hs: v['color.hue'] / 360 }[v.color_mode as string]),
    (v: number, opts) => ({ color: { hue: v * 360, saturation: opts.saturation * 100 } }),
  ],
  'light#color.saturation': [
    'light_saturation',
    (v) => ({ xy: new ColorXY(v['color.x'], v['color.y']).toHSV().hue, hs: v['color.saturation'] / 100 }[v.color_mode as string]),
    (v: number, opts) => ({ color: { hue: opts.hue * 360, saturation: v * 100 } }),
  ],
  'light#color.x': [
    'light_hue',
    (v) => ({ xy: new ColorXY(v['color.x'], v['color.y']).toHSV().hue, hs: v['color.hue'] / 360 }[v.color_mode as string]),
    (v: number, opts) => ({ color: new ColorHSV(v, opts.saturation).toXY().toObject() }),
  ],
  'light#color.y': [
    'light_saturation',
    (v) => ({ xy: new ColorXY(v['color.x'], v['color.y']).toHSV().hue, hs: v['color.saturation'] / 100 }[v.color_mode as string]),
    (v: number, opts) => ({ color: new ColorHSV(opts.hue, v).toXY().toObject() }),
  ],

  'switch#state': [
    'onoff',
    (v, opts) => v[opts.property] === 'ON',
    (v: boolean, opts) => withTransition({ [opts.property]: v ? 'ON' : 'OFF' }, opts?.duration),
  ],

  'fan#state': [
    'onoff',
    (v, opts) => v[opts.property] === 'ON',
    (v: boolean, opts) => withTransition({ [opts.property]: v ? 'ON' : 'OFF' }, opts?.duration),
  ],

  'cover#state': [
    'windowcoverings_state',
    // "state" will remain open until fully closed but is used for controlling movement
    // so we must map the shown state to "moving"
    (v, opts) => ({ UP: 'up', STOP: 'idle', DOWN: 'down' }[(v['moving'] ?? v[opts.property]) as string]),
    (v: string, opts) => ({ [opts.property]: { up: 'OPEN', idle: 'STOP', down: 'CLOSE' }[v] }),
  ],
  'cover#position': ['windowcoverings_set', (v, opts) => v[opts.property] / 100, (v: number, opts) => ({ [opts.property]: v * 100 })],
  'cover#tilt': ['windowcoverings_tilt_set', (v, opts) => v[opts.property] / 100, (v: number, opts) => ({ [opts.property]: v * 100 })],

  'lock#state': ['locked', (v, opts) => v[opts.property] === 'LOCK', (v: string, opts) => ({ [opts.property]: v ? 'LOCK' : 'UNLOCK' })],
  'lock#lock_state': ['lock_state', (v, opts) => v[opts.property], (v: string, opts) => ({ [opts.property]: v })],

  'climate#current_heating_setpoint': ['target_temperature', (v, opts) => v[opts.property], (v: number, opts) => ({ [opts.property]: v })],

  // simple capabilities such as measure, meter, alarm
  // ambience
  temperature: measure('measure_temperature'),
  local_temperature: measure('measure_temperature.local'),
  device_temperature: measure('measure_temperature.device'),
  humidity: measure('measure_humidity'),
  soil_moisture: measure('measure_humidity.soil'),
  pressure: measure('measure_pressure'),

  // air
  co: measure('measure_co'),
  co2: measure('measure_co2'),
  smoke_concentration: measure('measure_pm25'),

  // electricity
  energy: meter('meter_power'),
  battery: measure('measure_battery'),
  power: measure('measure_power'),
  voltage: measure('measure_voltage'),
  current: measure('measure_current'),

  // luminance
  illuminance: measure('measure_luminance'),
  illuminance_lux: measure('measure_luminance.lux'),

  // water
  flow: measure('measure_water'),
  water_flow: measure('measure_water'),
  'cyclic_quantitative_irrigation#irrigation_capacity': meter('meter_water'),
  water_consumed: meter('meter_water'),

  // alarms
  contact: alarm('alarm_contact', true),

  // Homey currently does not expose subcapabilities for alarms in the zone activity
  // since there currently is only one zigbee2mqtt device with overlap, expose all of them to alarm_motion
  occupancy: alarm('alarm_motion'),
  presence: alarm('alarm_motion'),
  vibration: alarm('alarm_motion'),

  tamper: alarm('alarm_tamper'),
  carbon_monoxide: alarm('alarm_co'),
  smoke: alarm('alarm_smoke'),
  water_leak: alarm('alarm_water'),
  rain: alarm('alarm_water.rain'),
  battery_low: alarm('alarm_battery'),

  current_device_status: ['alarm_water', (v, opts) => v[opts.property] !== 'normal_state'],
};
