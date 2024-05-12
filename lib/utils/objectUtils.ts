export const unflatten = (data: any) => {
  'use strict';
  if (Object(data) !== data || Array.isArray(data)) return data;
  const regex = /\.?([^.\[\]]+)|\[(\d+)\]/g;
  const result: any = {};

  for (const p in data) {
    let cur: any = result;
    let prop = '';
    let m;

    while ((m = regex.exec(p))) {
      cur = cur[prop] || (cur[prop] = m[2] ? [] : {});
      prop = m[2] || m[1];
    }
    cur[prop] = data[p];
  }
  return result[''] || result;
};

export const flatten = (obj: any, parentKey = '') => {
  return Object.keys(obj).reduce((acc: any, key) => {
    const fullKey = parentKey ? `${parentKey}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      Object.assign(acc, flatten(obj[key], fullKey));
    } else {
      acc[fullKey] = obj[key];
    }
    return acc;
  }, {});
};

export const pick = <T extends object, K extends keyof T>(base: T, ...keys: K[]): Pick<T, K> => {
  const entries = keys.map((key) => [key, base[key]]);
  return Object.fromEntries(entries);
};
