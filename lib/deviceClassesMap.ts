export type DeviceClass = 'light' | 'sensor' | 'socket' | 'button' | 'windowcoverings' | 'lock' | 'other';

type ClassConfig = {
  keywords: string[];
  subClass?: Record<string, string[]>;
};

export const deviceClasses: Record<DeviceClass, ClassConfig> = {
  light: {
    keywords: ['led', 'bulb', 'e27', 'e14', 'gu10', 'dimmer'],
    subClass: { module: ['module'] },
  },
  sensor: {
    keywords: ['sensor'],
    subClass: {
      contact: ['contact', 'window', 'door'],
      temperature: ['humidity', 'temperature'],
      vibration: ['vibration', 'pressure'],
      motion: ['motion', 'pir'],
    },
  },
  socket: { keywords: ['plug', 'socket'] },
  windowcoverings: { keywords: ['curtain', 'shade', 'blind'] },
  lock: { keywords: ['lock'] },
  button: { keywords: ['switch', 'button'] },
  other: { keywords: [] },
};
