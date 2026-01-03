export function getEasingFunction(name: string): (t: number) => number {
  switch (name) {
    case 'linear':
      return (t) => t;
    case 'easeInQuad':
      return (t) => t * t;
    case 'easeOutQuad':
      return (t) => 1 - (1 - t) * (1 - t);
    case 'easeInOutQuad':
      return (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    case 'easeInSine':
      return (t) => 1 - Math.cos((t * Math.PI) / 2);
    case 'easeOutSine':
      return (t) => Math.sin((t * Math.PI) / 2);
    case 'easeInOutSine':
      return (t) => -(Math.cos(Math.PI * t) - 1) / 2;
    case 'easeInExpo':
      return (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10));
    case 'easeOutExpo':
      return (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
    case 'easeInOutExpo':
      return (t) => {
        if (t === 0) return 0;
        if (t === 1) return 1;
        return t < 0.5
          ? Math.pow(2, 20 * t - 10) / 2
          : (2 - Math.pow(2, -20 * t + 10)) / 2;
      };
    case 'easeInElastic':
      return (t) => {
        if (t === 0 || t === 1) return t;
        return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3));
      };
    case 'easeOutElastic':
      return (t) => {
        if (t === 0 || t === 1) return t;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
      };
    case 'easeInOutElastic':
      return (t) => {
        if (t === 0 || t === 1) return t;
        const c5 = (2 * Math.PI) / 4.5;
        return t < 0.5
          ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
          : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
      };
    case 'easeInBounce':
      return (t) => 1 - easeOutBounce(1 - t);
    case 'easeOutBounce':
      return (t) => easeOutBounce(t);
    case 'easeInOutBounce':
      return (t) => (t < 0.5
        ? (1 - easeOutBounce(1 - 2 * t)) / 2
        : (1 + easeOutBounce(2 * t - 1)) / 2);
    default:
      return (t) => t;
  }
}

function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

/**
 * Get list of all easing function names.
 * Used by UI components for easing selection dropdowns.
 */
export function getEasingNames(): string[] {
  return [
    'linear',
    'easeInQuad',
    'easeOutQuad',
    'easeInOutQuad',
    'easeInSine',
    'easeOutSine',
    'easeInOutSine',
    'easeInExpo',
    'easeOutExpo',
    'easeInOutExpo',
    'easeInElastic',
    'easeOutElastic',
    'easeInOutElastic',
    'easeInBounce',
    'easeOutBounce',
    'easeInOutBounce',
  ];
}
