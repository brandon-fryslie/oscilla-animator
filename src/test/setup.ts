/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
const storage = new Map<string, string>();

const localStorageShim: Storage = {
  get length() {
    return storage.size;
  },
  clear() {
    storage.clear();
  },
  getItem(key: string) {
    return storage.has(key) ? storage.get(key) ?? null : null;
  },
  key(index: number) {
    return Array.from(storage.keys())[index] ?? null;
  },
  removeItem(key: string) {
    storage.delete(key);
  },
  setItem(key: string, value: string) {
    storage.set(key, String(value));
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageShim,
  configurable: true,
});

if (typeof globalThis.window !== 'undefined') {
  Object.defineProperty(globalThis.window, 'localStorage', {
    value: localStorageShim,
    configurable: true,
  });
}

// Canvas 2D polyfill for testing
// Provides a minimal CanvasRenderingContext2D implementation for vitest tests
if (typeof HTMLCanvasElement !== 'undefined') {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.getContext = function(contextId: string, ..._args: any[]): any {
    if (contextId === '2d') {
      // Create a minimal canvas 2D context mock
      const canvas = this;
      const imageData = new Map<string, ImageData>();

      return {
        canvas,
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        miterLimit: 10,
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        filter: 'none',

        // Transform methods
        save() {},
        restore() {},
        scale(_x: number, _y: number) {},
        rotate(_angle: number) {},
        translate(_x: number, _y: number) {},
        transform(_a: number, _b: number, _c: number, _d: number, _e: number, _f: number) {},
        setTransform(_a: number, _b: number, _c: number, _d: number, _e: number, _f: number) {},
        resetTransform() {},

        // Path methods
        beginPath() {},
        closePath() {},
        moveTo(_x: number, _y: number) {},
        lineTo(_x: number, _y: number) {},
        bezierCurveTo(_cp1x: number, _cp1y: number, _cp2x: number, _cp2y: number, _x: number, _y: number) {},
        quadraticCurveTo(_cpx: number, _cpy: number, _x: number, _y: number) {},
        arc(_x: number, _y: number, _radius: number, _startAngle: number, _endAngle: number, _counterclockwise?: boolean) {},
        arcTo(_x1: number, _y1: number, _x2: number, _y2: number, _radius: number) {},
        ellipse(_x: number, _y: number, _radiusX: number, _radiusY: number, _rotation: number, _startAngle: number, _endAngle: number, _counterclockwise?: boolean) {},
        rect(_x: number, _y: number, _w: number, _h: number) {},

        // Drawing methods
        fill() {},
        stroke() {},
        clip() {},
        fillRect(_x: number, _y: number, _w: number, _h: number) {},
        strokeRect(_x: number, _y: number, _w: number, _h: number) {},
        clearRect(_x: number, _y: number, _w: number, _h: number) {},

        // Image methods
        drawImage(..._args: any[]) {},

        // ImageData methods
        createImageData(sw: number, sh: number): ImageData {
          return {
            width: sw,
            height: sh,
            data: new Uint8ClampedArray(sw * sh * 4),
            colorSpace: 'srgb' as PredefinedColorSpace,
          };
        },
        getImageData(sx: number, sy: number, sw: number, sh: number): ImageData {
          const key = `${sx},${sy},${sw},${sh}`;
          if (!imageData.has(key)) {
            imageData.set(key, this.createImageData(sw, sh));
          }
          return imageData.get(key)!;
        },
        putImageData(imagedata: ImageData, dx: number, dy: number, ..._args: any[]) {
          const key = `${dx},${dy},${imagedata.width},${imagedata.height}`;
          imageData.set(key, imagedata);
        },

        // Gradient methods
        createLinearGradient(_x0: number, _y0: number, _x1: number, _y1: number): CanvasGradient {
          return {
            addColorStop(_offset: number, _color: string) {},
          } as CanvasGradient;
        },
        createRadialGradient(_x0: number, _y0: number, _r0: number, _x1: number, _y1: number, _r1: number): CanvasGradient {
          return {
            addColorStop(_offset: number, _color: string) {},
          } as CanvasGradient;
        },
        createConicGradient(_startAngle: number, _x: number, _y: number): CanvasGradient {
          return {
            addColorStop(_offset: number, _color: string) {},
          } as CanvasGradient;
        },

        // Pattern methods
        createPattern(_image: any, _repetition: string | null): CanvasPattern | null {
          return {} as CanvasPattern;
        },

        // Text methods (minimal)
        fillText(_text: string, _x: number, _y: number, _maxWidth?: number) {},
        strokeText(_text: string, _x: number, _y: number, _maxWidth?: number) {},
        measureText(text: string): TextMetrics {
          return { width: text.length * 8 } as TextMetrics;
        },

        // State
        font: '10px sans-serif',
        textAlign: 'start',
        textBaseline: 'alphabetic',
        direction: 'inherit',
        shadowBlur: 0,
        shadowColor: 'rgba(0, 0, 0, 0)',
        shadowOffsetX: 0,
        shadowOffsetY: 0,
      };
    }

    // Fallback to original implementation for other context types
    return originalGetContext.call(this, contextId, ..._args);
  };
}
