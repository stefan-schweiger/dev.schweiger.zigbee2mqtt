// This code is copied from the Zigbee2MQTT repository to make conversation easier

export function precisionRound(number: number, precision: number): number {
  if (typeof precision === 'number') {
    const factor = Math.pow(10, precision);
    return Math.round(number * factor) / factor;
  } else if (typeof precision === 'object') {
    const thresholds = Object.keys(precision)
      .map(Number)
      .sort((a, b) => b - a);
    for (const t of thresholds) {
      if (!isNaN(t) && number >= t) {
        return precisionRound(number, precision[t]);
      }
    }
  }
  return number;
}

/**
 * Converts color temp in Kelvins to mireds
 *
 * @param kelvin -color temp in Kelvins
 * @returns color temp in mireds
 */
function kelvinToMireds(kelvin: number): number {
  return 1000000 / kelvin;
}

/**
 * Class representing color in RGB space
 */
export class ColorRGB {
  /**
   * red component (0..1)
   */
  red: number;
  /**
   * green component (0..1)
   */
  green: number;
  /**
   * blue component (0..1)
   */
  blue: number;

  /**
   * Create RGB color
   * @param red - red component (0..1)
   * @param green - green component (0..1)
   * @param blue - blue component (0..1)
   */
  constructor(red: number, green: number, blue: number) {
    this.red = red;
    this.green = green;
    this.blue = blue;
  }

  /**
   * Create RGB color from object
   * @param rgb - object with properties red, green and blue
   * @returns new ColoRGB object
   */
  static fromObject(rgb: { red: number; green: number; blue: number }) {
    if (!rgb.hasOwnProperty('red') || !rgb.hasOwnProperty('green') || !rgb.hasOwnProperty('blue')) {
      throw new Error('One or more required properties missing. Required properties: "red", "green", "blue"');
    }
    return new ColorRGB(rgb.red, rgb.green, rgb.blue);
  }

  /**
   * Return this color with values rounded to given precision
   * @param precision - decimal places to round to
   */
  rounded(precision: number): ColorRGB {
    return new ColorRGB(precisionRound(this.red, precision), precisionRound(this.green, precision), precisionRound(this.blue, precision));
  }

  /**
   * Convert to HSV
   *
   * @returns color in HSV space
   */
  toHSV(): ColorHSV {
    const r = this.red;
    const g = this.green;
    const b = this.blue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    switch (max) {
      case min:
        h = 0;
        break;
      case r:
        h = g - b + d * (g < b ? 6 : 0);
        h /= 6 * d;
        break;
      case g:
        h = b - r + d * 2;
        h /= 6 * d;
        break;
      case b:
        h = r - g + d * 4;
        h /= 6 * d;
        break;
    }

    return new ColorHSV(h, s, v);
  }

  /**
   * Convert to CIE
   * @returns color in CIE space
   */
  toXY(): ColorXY {
    // From: https://github.com/usolved/cie-rgb-converter/blob/master/cie_rgb_converter.js

    // RGB values to XYZ using the Wide RGB D65 conversion formula
    const X = this.red * 0.664511 + this.green * 0.154324 + this.blue * 0.162028;
    const Y = this.red * 0.283881 + this.green * 0.668433 + this.blue * 0.047685;
    const Z = this.red * 0.000088 + this.green * 0.07231 + this.blue * 0.986039;
    const sum = X + Y + Z;

    const retX = sum == 0 ? 0 : X / sum;
    const retY = sum == 0 ? 0 : Y / sum;

    return new ColorXY(retX, retY);
  }

  /**
   * Returns color after sRGB gamma correction
   * @returns corrected RGB
   */
  gammaCorrected(): ColorRGB {
    function transform(v: number) {
      return v > 0.04045 ? Math.pow((v + 0.055) / (1.0 + 0.055), 2.4) : v / 12.92;
    }
    return new ColorRGB(transform(this.red), transform(this.green), transform(this.blue));
  }

  /**
   * Returns color after reverse sRGB gamma correction
   * @returns raw RGB
   */
  gammaUncorrected(): ColorRGB {
    function transform(v: number) {
      return v <= 0.0031308 ? 12.92 * v : (1.0 + 0.055) * Math.pow(v, 1.0 / 2.4) - 0.055;
    }
    return new ColorRGB(transform(this.red), transform(this.green), transform(this.blue));
  }
}

/**
 *  Class representing color in CIE space
 */
export class ColorXY {
  /** X component (0..1) */
  x: number;
  /** Y component (0..1) */
  y: number;

  /**
   * Create CIE color
   * @param x - x component (0..1)
   * @param y - y component (0..1)
   */
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /**
   * Create CIE color from object
   * @param xy - object with properties x and y
   * @returns new ColorXY object
   */
  static fromObject(xy: { x: number; y: number }): ColorXY {
    if (!xy.hasOwnProperty('x') || !xy.hasOwnProperty('y')) {
      throw new Error('One or more required properties missing. Required properties: "x", "y"');
    }
    return new ColorXY(xy.x, xy.y);
  }

  /**
   * Converts color in XY space to temperature in mireds
   * @returns color temp in mireds
   */
  toMireds(): number {
    const n = (this.x - 0.332) / (0.1858 - this.y);
    const kelvin = Math.abs(437 * Math.pow(n, 3) + 3601 * Math.pow(n, 2) + 6861 * n + 5517);
    return kelvinToMireds(kelvin);
  }

  /**
   * Converts CIE color space to RGB color space
   * From: https://github.com/usolved/cie-rgb-converter/blob/master/cie_rgb_converter.js
   */
  toRGB(): ColorRGB {
    // use maximum brightness
    const brightness = 254;

    const z = 1.0 - this.x - this.y;
    const Y = Number((brightness / 254).toFixed(2));
    const X = (Y / this.y) * this.x;
    const Z = (Y / this.y) * z;

    // Convert to RGB using Wide RGB D65 conversion
    let red = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
    let green = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
    let blue = X * 0.051713 - Y * 0.121364 + Z * 1.01153;

    // If red, green or blue is larger than 1.0 set it back to the maximum of 1.0
    if (red > blue && red > green && red > 1.0) {
      green = green / red;
      blue = blue / red;
      red = 1.0;
    } else if (green > blue && green > red && green > 1.0) {
      red = red / green;
      blue = blue / green;
      green = 1.0;
    } else if (blue > red && blue > green && blue > 1.0) {
      red = red / blue;
      green = green / blue;
      blue = 1.0;
    }

    // This fixes situation when due to computational errors value get slightly below 0, or NaN in case of zero-division.
    red = isNaN(red) || red < 0 ? 0 : red;
    green = isNaN(green) || green < 0 ? 0 : green;
    blue = isNaN(blue) || blue < 0 ? 0 : blue;

    return new ColorRGB(red, green, blue);
  }

  /**
   * Convert to HSV
   * @returns color in HSV space
   */
  toHSV(): ColorHSV {
    return this.toRGB().toHSV();
  }

  /**
   * Return this color with value rounded to given precision
   * @param precision - decimal places to round to
   */
  rounded(precision: number): ColorXY {
    return new ColorXY(precisionRound(this.x, precision), precisionRound(this.y, precision));
  }

  /**
   * Convert to object
   * @returns object with properties x and y
   */
  toObject(): { x: number; y: number } {
    return {
      x: this.x,
      y: this.y,
    };
  }
}

/**
 * Class representing color in HSV space
 */
export class ColorHSV {
  /** hue component (0..1) */
  hue: number;
  /** saturation component (0..1) */
  saturation: number;
  /** value component (0..1) */
  value: number;

  /**
   * Create color in HSV space
   * @param hue - hue component (0..1)
   * @param saturation - saturation component (0..1)
   * @param value - value component (0..1)
   */
  constructor(hue: number, saturation: number = 1, value: number = 1) {
    this.hue = hue % 1;
    this.saturation = saturation;
    this.value = value;
  }

  /**
   * Create HSV color from object
   */
  static fromObject(hsv: { hue: number; saturation?: number; value?: number }): ColorHSV {
    if (!hsv.hasOwnProperty('hue') && !hsv.hasOwnProperty('saturation')) {
      throw new Error('HSV color must specify at least hue or saturation.');
    }
    return new ColorHSV(hsv.hue, hsv.saturation ?? 1, hsv.value ?? 1);
  }

  /**
   * Return this color with value rounded to given precision
   * @param precision - decimal places to round to
   */
  rounded(precision: number): ColorHSV {
    return new ColorHSV(
      precisionRound(this.hue, precision),
      precisionRound(this.saturation, precision),
      precisionRound(this.value, precision),
    );
  }

  /**
   * Convert to object
   * @param short - return h, s, v instead of hue, saturation, value
   * @param includeValue - omit v(alue) from return
   */
  toObject(
    short: boolean = false,
    includeValue: boolean = true,
  ): { h?: number; hue?: number; s?: number; saturation?: number; v?: number; value?: number } {
    const ret: { h?: number; hue?: number; s?: number; saturation?: number; v?: number; value?: number } = {};
    if (this.hue !== null) {
      if (short) {
        ret.h = this.hue;
      } else {
        ret.hue = this.hue;
      }
    }
    if (this.saturation !== null) {
      if (short) {
        ret.s = this.saturation;
      } else {
        ret.saturation = this.saturation;
      }
    }
    if (this.value !== null && includeValue) {
      if (short) {
        ret.v = this.value;
      } else {
        ret.value = this.value;
      }
    }
    return ret;
  }

  /**
   * Convert RGB color
   * @returns
   */
  toRGB(): ColorRGB {
    const h = this.hue;
    const s = this.saturation;
    const v = this.value;

    let r;
    let g;
    let b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0:
        (r = v), (g = t), (b = p);
        break;
      case 1:
        (r = q), (g = v), (b = p);
        break;
      case 2:
        (r = p), (g = v), (b = t);
        break;
      case 3:
        (r = p), (g = q), (b = v);
        break;
      case 4:
        (r = t), (g = p), (b = v);
        break;
      case 5:
        (r = v), (g = p), (b = q);
        break;
    }
    return new ColorRGB(r!, g!, b!);
  }

  /**
   * Create CIE color from HSV
   */
  toXY(): ColorXY {
    return this.toRGB().toXY();
  }

  /**
   * Create Mireds from HSV
   * @returns color temp in mireds
   */
  toMireds(): number {
    return this.toRGB().toXY().toMireds();
  }
}
