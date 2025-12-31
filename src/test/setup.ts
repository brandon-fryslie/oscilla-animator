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

  HTMLCanvasElement.prototype.getContext = function(contextId: string, ...args: any[]): any {
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
        scale(x: number, y: number) {},
        rotate(angle: number) {},
        translate(x: number, y: number) {},
        transform(a: number, b: number, c: number, d: number, e: number, f: number) {},
        setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {},
        resetTransform() {},

        // Path methods
        beginPath() {},
        closePath() {},
        moveTo(x: number, y: number) {},
        lineTo(x: number, y: number) {},
        bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {},
        quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {},
        arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean) {},
        arcTo(x1: number, y1: number, x2: number, y2: number, radius: number) {},
        ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterclockwise?: boolean) {},
        rect(x: number, y: number, w: number, h: number) {},

        // Drawing methods
        fill() {},
        stroke() {},
        clip() {},
        fillRect(x: number, y: number, w: number, h: number) {},
        strokeRect(x: number, y: number, w: number, h: number) {},
        clearRect(x: number, y: number, w: number, h: number) {},

        // Image methods
        drawImage(...args: any[]) {},

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
        putImageData(imagedata: ImageData, dx: number, dy: number, ...args: any[]) {
          const key = `${dx},${dy},${imagedata.width},${imagedata.height}`;
          imageData.set(key, imagedata);
        },

        // Gradient methods
        createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
          return {
            addColorStop(offset: number, color: string) {},
          } as CanvasGradient;
        },
        createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient {
          return {
            addColorStop(offset: number, color: string) {},
          } as CanvasGradient;
        },
        createConicGradient(startAngle: number, x: number, y: number): CanvasGradient {
          return {
            addColorStop(offset: number, color: string) {},
          } as CanvasGradient;
        },

        // Pattern methods
        createPattern(image: any, repetition: string | null): CanvasPattern | null {
          return {} as CanvasPattern;
        },

        // Text methods (minimal)
        fillText(text: string, x: number, y: number, maxWidth?: number) {},
        strokeText(text: string, x: number, y: number, maxWidth?: number) {},
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
    return originalGetContext.call(this, contextId, ...args);
  };
}
