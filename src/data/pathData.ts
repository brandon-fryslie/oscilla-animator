/**
 * Path data extracted from original HTML animations
 * Used by line drawing animations for both logo and text targets
 */

export interface PathPoint {
  x: number;
  y: number;
  type?: 'L' | 'Q' | 'A';
  // For quadratic curves
  cx?: number;
  cy?: number;
  // For arcs
  rx?: number;
  ry?: number;
  rotation?: number;
  largeArc?: 0 | 1;
  sweep?: 0 | 1;
}

export interface LineData {
  startX: number;
  startY: number;
  points: PathPoint[];
  color: string;
  delay: number;
  duration: number;
  foldDuration?: number;
}

// Color constants - vibrant neon palette
export const ELECTRIC_BLUE = '#00f0ff';
export const NEON_PURPLE = '#bf00ff';
export const HOT_PINK = '#ff0080';
export const NEON_GREEN = '#00ff88';
export const SUNSET_ORANGE = '#ff6b00';
export const GOLDEN = '#ffcc00';

// Legacy aliases
export const CYAN = ELECTRIC_BLUE;
export const PURPLE = NEON_PURPLE;
export const PINK = HOT_PINK;
export const RED = '#ff2d75';
export const ORANGE = SUNSET_ORANGE;
export const YELLOW = GOLDEN;

/**
 * Logo path data - loom99 logo
 * Vertical stacked layout: "loom" on top, "99" below
 * Designed for ~400x300 viewport, centered
 * Stylistic flowing letterforms with neon colors
 */
export const LOGO_PATHS: LineData[] = [
  // ========================================
  // TOP ROW: "loom" centered around y=80
  // ========================================

  // ===== L - Stylized with curved foot =====
  {
    startX: -100,
    startY: 50,
    points: [
      { x: 80, y: 30 },
      { x: 80, y: 110 },
      { type: 'Q', cx: 80, cy: 130, x: 100, y: 130 },
      { x: 130, y: 130 },
    ],
    color: '#00f0ff', // Electric blue
    delay: 0,
    duration: 500,
  },

  // ===== O (first) - Smooth oval =====
  {
    startX: -80,
    startY: 80,
    points: [
      { x: 155, y: 80 },
      { type: 'Q', cx: 155, cy: 30, x: 185, y: 30 },
      { type: 'Q', cx: 215, cy: 30, x: 215, y: 80 },
      { type: 'Q', cx: 215, cy: 130, x: 185, y: 130 },
      { type: 'Q', cx: 155, cy: 130, x: 155, y: 80 },
    ],
    color: '#bf00ff', // Neon purple
    delay: 80,
    duration: 500,
  },

  // ===== O (second) - Smooth oval =====
  {
    startX: 500,
    startY: 80,
    points: [
      { x: 240, y: 80 },
      { type: 'Q', cx: 240, cy: 30, x: 270, y: 30 },
      { type: 'Q', cx: 300, cy: 30, x: 300, y: 80 },
      { type: 'Q', cx: 300, cy: 130, x: 270, y: 130 },
      { type: 'Q', cx: 240, cy: 130, x: 240, y: 80 },
    ],
    color: '#ff0080', // Hot pink
    delay: 160,
    duration: 500,
  },

  // ===== M - Stylized with pointed peaks =====
  // Left leg
  {
    startX: 500,
    startY: 130,
    points: [
      { x: 325, y: 130 },
      { x: 325, y: 35 },
    ],
    color: '#00ff88', // Neon green
    delay: 240,
    duration: 400,
  },
  // Left peak
  {
    startX: 480,
    startY: 30,
    points: [
      { x: 325, y: 35 },
      { type: 'Q', cx: 340, cy: 30, x: 355, y: 80 },
    ],
    color: '#00ff88',
    delay: 280,
    duration: 400,
  },
  // Right peak
  {
    startX: 520,
    startY: 30,
    points: [
      { x: 355, y: 80 },
      { type: 'Q', cx: 370, cy: 30, x: 385, y: 35 },
    ],
    color: '#00ff88',
    delay: 320,
    duration: 400,
  },
  // Right leg
  {
    startX: 550,
    startY: 130,
    points: [
      { x: 385, y: 35 },
      { x: 385, y: 130 },
    ],
    color: '#00ff88',
    delay: 360,
    duration: 400,
  },

  // ========================================
  // BOTTOM ROW: "99" centered around y=220
  // ========================================

  // ===== 9 (first) - Large stylized =====
  // Circle head
  {
    startX: -100,
    startY: 200,
    points: [
      { x: 140, y: 185 },
      { type: 'Q', cx: 140, cy: 155, x: 175, y: 155 },
      { type: 'Q', cx: 210, cy: 155, x: 210, y: 185 },
      { type: 'Q', cx: 210, cy: 215, x: 175, y: 215 },
      { type: 'Q', cx: 140, cy: 215, x: 140, y: 185 },
    ],
    color: '#ff6b00', // Sunset orange
    delay: 450,
    duration: 500,
  },
  // Flowing tail
  {
    startX: -80,
    startY: 260,
    points: [
      { x: 210, y: 195 },
      { type: 'Q', cx: 215, cy: 240, x: 195, y: 260 },
      { type: 'Q', cx: 170, cy: 285, x: 135, y: 280 },
    ],
    color: '#ff6b00',
    delay: 520,
    duration: 500,
  },

  // ===== 9 (second) - Large stylized =====
  // Circle head
  {
    startX: 500,
    startY: 200,
    points: [
      { x: 225, y: 185 },
      { type: 'Q', cx: 225, cy: 155, x: 260, y: 155 },
      { type: 'Q', cx: 295, cy: 155, x: 295, y: 185 },
      { type: 'Q', cx: 295, cy: 215, x: 260, y: 215 },
      { type: 'Q', cx: 225, cy: 215, x: 225, y: 185 },
    ],
    color: '#ffcc00', // Golden
    delay: 600,
    duration: 500,
  },
  // Flowing tail
  {
    startX: 520,
    startY: 260,
    points: [
      { x: 295, y: 195 },
      { type: 'Q', cx: 300, cy: 240, x: 280, y: 260 },
      { type: 'Q', cx: 255, cy: 285, x: 220, y: 280 },
    ],
    color: '#ffcc00',
    delay: 670,
    duration: 500,
  },
];

/**
 * Text path data - "DO MORE NOW" text
 */
export const TEXT_PATHS: LineData[] = [
  // ===== DO =====
  // D - vertical
  {
    startX: -150,
    startY: 70,
    points: [
      { x: 100, y: 20 },
      { x: 100, y: 100 },
    ],
    color: RED,
    delay: 0,
    duration: 400,
    foldDuration: 180,
  },
  // D - curve
  {
    startX: 350,
    startY: 70,
    points: [
      { x: 100, y: 20 },
      { type: 'Q', cx: 160, cy: 20, x: 160, y: 60 },
      { type: 'Q', cx: 160, cy: 100, x: 100, y: 100 },
    ],
    color: RED,
    delay: 20,
    duration: 400,
    foldDuration: 180,
  },
  // O - left arc
  {
    startX: -150,
    startY: 70,
    points: [
      { x: 200, y: 60 },
      { type: 'Q', cx: 200, cy: 20, x: 240, y: 20 },
      { type: 'Q', cx: 280, cy: 20, x: 280, y: 60 },
    ],
    color: RED,
    delay: 40,
    duration: 400,
    foldDuration: 180,
  },
  // O - right arc
  {
    startX: 500,
    startY: 70,
    points: [
      { x: 280, y: 60 },
      { type: 'Q', cx: 280, cy: 100, x: 240, y: 100 },
      { type: 'Q', cx: 200, cy: 100, x: 200, y: 60 },
    ],
    color: RED,
    delay: 50,
    duration: 400,
    foldDuration: 180,
  },

  // ===== MORE =====
  // M - left vertical
  {
    startX: -150,
    startY: 170,
    points: [
      { x: 80, y: 200 },
      { x: 80, y: 140 },
    ],
    color: ORANGE,
    delay: 450,
    duration: 400,
    foldDuration: 180,
  },
  // M - left diagonal
  {
    startX: -120,
    startY: 140,
    points: [
      { x: 80, y: 140 },
      { x: 110, y: 180 },
    ],
    color: ORANGE,
    delay: 460,
    duration: 400,
    foldDuration: 180,
  },
  // M - right diagonal
  {
    startX: 400,
    startY: 140,
    points: [
      { x: 110, y: 180 },
      { x: 140, y: 140 },
    ],
    color: ORANGE,
    delay: 470,
    duration: 400,
    foldDuration: 180,
  },
  // M - right vertical
  {
    startX: 400,
    startY: 170,
    points: [
      { x: 140, y: 140 },
      { x: 140, y: 200 },
    ],
    color: ORANGE,
    delay: 480,
    duration: 400,
    foldDuration: 180,
  },
  // O - left arc
  {
    startX: -100,
    startY: 170,
    points: [
      { x: 175, y: 170 },
      { type: 'Q', cx: 175, cy: 140, x: 200, y: 140 },
      { type: 'Q', cx: 225, cy: 140, x: 225, y: 170 },
    ],
    color: ORANGE,
    delay: 490,
    duration: 400,
    foldDuration: 180,
  },
  // O - right arc
  {
    startX: 400,
    startY: 170,
    points: [
      { x: 225, y: 170 },
      { type: 'Q', cx: 225, cy: 200, x: 200, y: 200 },
      { type: 'Q', cx: 175, cy: 200, x: 175, y: 170 },
    ],
    color: ORANGE,
    delay: 500,
    duration: 400,
    foldDuration: 180,
  },
  // R - vertical
  {
    startX: -150,
    startY: 170,
    points: [
      { x: 260, y: 140 },
      { x: 260, y: 200 },
    ],
    color: ORANGE,
    delay: 510,
    duration: 400,
    foldDuration: 180,
  },
  // R - top curve
  {
    startX: 400,
    startY: 155,
    points: [
      { x: 260, y: 140 },
      { type: 'Q', cx: 300, cy: 140, x: 300, y: 160 },
      { type: 'Q', cx: 300, cy: 175, x: 260, y: 175 },
    ],
    color: ORANGE,
    delay: 520,
    duration: 400,
    foldDuration: 180,
  },
  // R - leg
  {
    startX: 400,
    startY: 190,
    points: [
      { x: 270, y: 175 },
      { x: 300, y: 200 },
    ],
    color: ORANGE,
    delay: 530,
    duration: 400,
    foldDuration: 180,
  },
  // E - vertical
  {
    startX: -150,
    startY: 170,
    points: [
      { x: 330, y: 140 },
      { x: 330, y: 200 },
    ],
    color: ORANGE,
    delay: 540,
    duration: 400,
    foldDuration: 180,
  },
  // E - top horizontal
  {
    startX: 500,
    startY: 140,
    points: [
      { x: 330, y: 140 },
      { x: 370, y: 140 },
    ],
    color: ORANGE,
    delay: 550,
    duration: 400,
    foldDuration: 180,
  },
  // E - middle horizontal
  {
    startX: 500,
    startY: 170,
    points: [
      { x: 330, y: 170 },
      { x: 360, y: 170 },
    ],
    color: ORANGE,
    delay: 560,
    duration: 400,
    foldDuration: 180,
  },
  // E - bottom horizontal
  {
    startX: 500,
    startY: 200,
    points: [
      { x: 330, y: 200 },
      { x: 370, y: 200 },
    ],
    color: ORANGE,
    delay: 570,
    duration: 400,
    foldDuration: 180,
  },

  // ===== NOW =====
  // N - left vertical
  {
    startX: -150,
    startY: 240,
    points: [
      { x: 80, y: 220 },
      { x: 80, y: 280 },
    ],
    color: YELLOW,
    delay: 1020,
    duration: 400,
    foldDuration: 180,
  },
  // N - diagonal
  {
    startX: -100,
    startY: 240,
    points: [
      { x: 80, y: 220 },
      { x: 140, y: 280 },
    ],
    color: YELLOW,
    delay: 1030,
    duration: 400,
    foldDuration: 180,
  },
  // N - right vertical
  {
    startX: 800,
    startY: 240,
    points: [
      { x: 140, y: 220 },
      { x: 140, y: 280 },
    ],
    color: YELLOW,
    delay: 1040,
    duration: 400,
    foldDuration: 180,
  },
  // O - left arc
  {
    startX: -150,
    startY: 250,
    points: [
      { x: 180, y: 250 },
      { type: 'Q', cx: 180, cy: 220, x: 215, y: 220 },
      { type: 'Q', cx: 250, cy: 220, x: 250, y: 250 },
    ],
    color: YELLOW,
    delay: 1050,
    duration: 400,
    foldDuration: 180,
  },
  // O - right arc
  {
    startX: 800,
    startY: 250,
    points: [
      { x: 250, y: 250 },
      { type: 'Q', cx: 250, cy: 280, x: 215, y: 280 },
      { type: 'Q', cx: 180, cy: 280, x: 180, y: 250 },
    ],
    color: YELLOW,
    delay: 1060,
    duration: 400,
    foldDuration: 180,
  },
  // W - left vertical
  {
    startX: -150,
    startY: 240,
    points: [
      { x: 290, y: 220 },
      { x: 290, y: 280 },
    ],
    color: YELLOW,
    delay: 1070,
    duration: 400,
    foldDuration: 180,
  },
  // W - left diagonal
  {
    startX: -100,
    startY: 280,
    points: [
      { x: 290, y: 280 },
      { x: 310, y: 240 },
    ],
    color: YELLOW,
    delay: 1080,
    duration: 400,
    foldDuration: 180,
  },
  // W - middle diagonal
  {
    startX: 800,
    startY: 240,
    points: [
      { x: 310, y: 240 },
      { x: 330, y: 280 },
    ],
    color: YELLOW,
    delay: 1090,
    duration: 400,
    foldDuration: 180,
  },
  // W - right diagonal
  {
    startX: -100,
    startY: 280,
    points: [
      { x: 330, y: 280 },
      { x: 350, y: 240 },
    ],
    color: YELLOW,
    delay: 1100,
    duration: 400,
    foldDuration: 180,
  },
  // W - right vertical
  {
    startX: 800,
    startY: 240,
    points: [
      { x: 350, y: 240 },
      { x: 350, y: 280 },
    ],
    color: YELLOW,
    delay: 1110,
    duration: 400,
    foldDuration: 180,
  },
];

/**
 * Heart path data - concentric heart shapes, all red tones
 */
export const HEART_PATHS: LineData[] = [
  // Outermost heart - left
  {
    startX: 200,
    startY: 70,
    points: [
      { type: 'Q', cx: 110, cy: 0, x: 60, y: 80 },
      { type: 'Q', cx: 10, cy: 160, x: 70, y: 200 },
      { type: 'Q', cx: 130, cy: 250, x: 200, y: 300 },
    ],
    color: '#cc0000',
    delay: 0,
    duration: 500,
  },
  // Outermost heart - right
  {
    startX: 200,
    startY: 70,
    points: [
      { type: 'Q', cx: 290, cy: 0, x: 340, y: 80 },
      { type: 'Q', cx: 390, cy: 160, x: 330, y: 200 },
      { type: 'Q', cx: 270, cy: 250, x: 200, y: 300 },
    ],
    color: '#dd0000',
    delay: 30,
    duration: 500,
  },
  // Second heart - left
  {
    startX: 200,
    startY: 85,
    points: [
      { type: 'Q', cx: 125, cy: 25, x: 85, y: 90 },
      { type: 'Q', cx: 45, cy: 155, x: 90, y: 190 },
      { type: 'Q', cx: 140, cy: 235, x: 200, y: 275 },
    ],
    color: '#ee0000',
    delay: 60,
    duration: 500,
  },
  // Second heart - right
  {
    startX: 200,
    startY: 85,
    points: [
      { type: 'Q', cx: 275, cy: 25, x: 315, y: 90 },
      { type: 'Q', cx: 355, cy: 155, x: 310, y: 190 },
      { type: 'Q', cx: 260, cy: 235, x: 200, y: 275 },
    ],
    color: '#ff0000',
    delay: 90,
    duration: 500,
  },
  // Third heart - left
  {
    startX: 200,
    startY: 100,
    points: [
      { type: 'Q', cx: 140, cy: 50, x: 110, y: 100 },
      { type: 'Q', cx: 80, cy: 150, x: 110, y: 180 },
      { type: 'Q', cx: 150, cy: 220, x: 200, y: 250 },
    ],
    color: '#ff1111',
    delay: 120,
    duration: 500,
  },
  // Third heart - right
  {
    startX: 200,
    startY: 100,
    points: [
      { type: 'Q', cx: 260, cy: 50, x: 290, y: 100 },
      { type: 'Q', cx: 320, cy: 150, x: 290, y: 180 },
      { type: 'Q', cx: 250, cy: 220, x: 200, y: 250 },
    ],
    color: '#ff2222',
    delay: 150,
    duration: 500,
  },
  // Fourth heart - left
  {
    startX: 200,
    startY: 115,
    points: [
      { type: 'Q', cx: 155, cy: 75, x: 135, y: 115 },
      { type: 'Q', cx: 115, cy: 155, x: 135, y: 175 },
      { type: 'Q', cx: 165, cy: 205, x: 200, y: 225 },
    ],
    color: '#ff3333',
    delay: 180,
    duration: 500,
  },
  // Fourth heart - right
  {
    startX: 200,
    startY: 115,
    points: [
      { type: 'Q', cx: 245, cy: 75, x: 265, y: 115 },
      { type: 'Q', cx: 285, cy: 155, x: 265, y: 175 },
      { type: 'Q', cx: 235, cy: 205, x: 200, y: 225 },
    ],
    color: '#ff4444',
    delay: 210,
    duration: 500,
  },
  // Fifth heart (inner) - left
  {
    startX: 200,
    startY: 130,
    points: [
      { type: 'Q', cx: 170, cy: 100, x: 160, y: 130 },
      { type: 'Q', cx: 150, cy: 160, x: 165, y: 175 },
      { type: 'Q', cx: 180, cy: 190, x: 200, y: 200 },
    ],
    color: '#ff5555',
    delay: 240,
    duration: 500,
  },
  // Fifth heart (inner) - right
  {
    startX: 200,
    startY: 130,
    points: [
      { type: 'Q', cx: 230, cy: 100, x: 240, y: 130 },
      { type: 'Q', cx: 250, cy: 160, x: 235, y: 175 },
      { type: 'Q', cx: 220, cy: 190, x: 200, y: 200 },
    ],
    color: '#ff6666',
    delay: 270,
    duration: 500,
  },
  // Innermost heart - left
  {
    startX: 200,
    startY: 145,
    points: [
      { type: 'Q', cx: 185, cy: 130, x: 180, y: 145 },
      { type: 'Q', cx: 175, cy: 160, x: 185, y: 168 },
      { type: 'Q', cx: 192, cy: 175, x: 200, y: 180 },
    ],
    color: '#ff7777',
    delay: 300,
    duration: 500,
  },
  // Innermost heart - right
  {
    startX: 200,
    startY: 145,
    points: [
      { type: 'Q', cx: 215, cy: 130, x: 220, y: 145 },
      { type: 'Q', cx: 225, cy: 160, x: 215, y: 168 },
      { type: 'Q', cx: 208, cy: 175, x: 200, y: 180 },
    ],
    color: '#ff8888',
    delay: 330,
    duration: 500,
  },
];

/**
 * Convert path points to SVG path string
 */
export function pathPointsToSVGPath(points: PathPoint[]): string {
  if (points.length === 0) return '';

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    if (point.type === 'Q' && point.cx !== undefined && point.cy !== undefined) {
      d += ` Q ${point.cx} ${point.cy} ${point.x} ${point.y}`;
    } else if (point.type === 'A') {
      d += ` A ${point.rx} ${point.ry} ${point.rotation} ${point.largeArc} ${point.sweep} ${point.x} ${point.y}`;
    } else {
      d += ` L ${point.x} ${point.y}`;
    }
  }

  return d;
}

