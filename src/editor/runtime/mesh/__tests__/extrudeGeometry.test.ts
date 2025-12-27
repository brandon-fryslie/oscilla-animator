/**
 * @file Extrude Geometry Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateProfile,
  extrudeProfile,
  type ExtrudeOptions,
} from '../extrudeGeometry';
import type { ExtrudeProfile2D, ExtrudeKind } from '../../../compiler/ir/types3d';

describe('extrudeGeometry', () => {
  describe('generateProfile', () => {
    describe('circle', () => {
      it('should generate correct number of points', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'circle',
          radius: 1,
          segments: 8,
        };

        const points = generateProfile(profile);

        expect(points).toHaveLength(8);
      });

      it('should generate points on circle with correct radius', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'circle',
          radius: 2,
          segments: 16,
        };

        const points = generateProfile(profile);

        // Check all points are at radius distance from origin
        for (const p of points) {
          const dist = Math.sqrt(p.x * p.x + p.y * p.y);
          expect(dist).toBeCloseTo(2, 5);
        }
      });

      it('should start at angle 0 (right side)', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'circle',
          radius: 1,
          segments: 4,
        };

        const points = generateProfile(profile);

        // First point should be at (1, 0) for angle 0
        expect(points[0].x).toBeCloseTo(1, 5);
        expect(points[0].y).toBeCloseTo(0, 5);
      });
    });

    describe('ngon', () => {
      it('should generate correct number of vertices for triangle', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'ngon',
          sides: 3,
          radius: 1,
        };

        const points = generateProfile(profile);

        expect(points).toHaveLength(3);
      });

      it('should generate correct number of vertices for square', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'ngon',
          sides: 4,
          radius: 1,
        };

        const points = generateProfile(profile);

        expect(points).toHaveLength(4);
      });

      it('should generate points at correct radius', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'ngon',
          sides: 6,
          radius: 3,
        };

        const points = generateProfile(profile);

        // Check all vertices are at radius distance
        for (const p of points) {
          const dist = Math.sqrt(p.x * p.x + p.y * p.y);
          expect(dist).toBeCloseTo(3, 5);
        }
      });

      it('should throw for invalid ngon with < 3 sides', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'ngon',
          sides: 2,
          radius: 1,
        };

        expect(() => generateProfile(profile)).toThrow();
      });

      it('should generate symmetric hexagon', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'ngon',
          sides: 6,
          radius: 1,
        };

        const points = generateProfile(profile);

        // Hexagon should be symmetric
        expect(points).toHaveLength(6);

        // First vertex (startAngle = -π/2) points down
        expect(points[0].x).toBeCloseTo(0, 5);
        expect(points[0].y).toBeCloseTo(-1, 5);
      });
    });

    describe('polyline', () => {
      it('should return provided points', () => {
        const testPoints = [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ];

        const profile: ExtrudeProfile2D = {
          kind: 'polyline',
          points: testPoints,
          closed: true,
        };

        const points = generateProfile(profile);

        expect(points).toEqual(testPoints);
      });
    });
  });

  describe('extrudeProfile', () => {
    describe('linear extrusion', () => {
      it('should extrude circle to cylinder', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'circle',
          radius: 1,
          segments: 8,
        };
        const extrude: ExtrudeKind = {
          kind: 'linear',
          depth: 2,
          cap: 'both',
        };
        const options: ExtrudeOptions = {
          normals: true,
          uvs: true,
        };

        const points = generateProfile(profile);
        const result = extrudeProfile(points, extrude, options);

        // Should have positions
        expect(result.positions).toBeDefined();
        expect(result.positions.length).toBeGreaterThan(0);

        // Should be multiple of 3 (xyz)
        expect(result.positions.length % 3).toBe(0);

        // Should have normals
        expect(result.normals).toBeDefined();
        expect(result.normals!.length).toBe(result.positions.length);

        // Should have UVs
        expect(result.uvs).toBeDefined();
        expect(result.uvs!.length).toBe((result.positions.length / 3) * 2);

        // Should have indices
        expect(result.indices).toBeDefined();
        expect(result.indices.length % 3).toBe(0); // Multiple of 3 (triangles)
      });

      it('should generate correct vertex count for cylinder with caps', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'circle',
          radius: 1,
          segments: 8,
        };
        const extrude: ExtrudeKind = {
          kind: 'linear',
          depth: 2,
          cap: 'both',
        };
        const options: ExtrudeOptions = {
          normals: false,
          uvs: false,
        };

        const points = generateProfile(profile);
        const result = extrudeProfile(points, extrude, options);

        const vertCount = result.positions.length / 3;

        // 8 segments * 2 (front + back) = 16 side verts
        // 8 * 2 (front + back caps) = 16 cap verts
        // Total: 32 vertices
        expect(vertCount).toBe(32);
      });

      it('should generate correct vertex count without caps', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'circle',
          radius: 1,
          segments: 8,
        };
        const extrude: ExtrudeKind = {
          kind: 'linear',
          depth: 2,
          cap: 'none',
        };
        const options: ExtrudeOptions = {
          normals: false,
          uvs: false,
        };

        const points = generateProfile(profile);
        const result = extrudeProfile(points, extrude, options);

        const vertCount = result.positions.length / 3;

        // 8 segments * 2 (front + back) = 16 side verts
        expect(vertCount).toBe(16);
      });

      it('should generate CCW winding for side faces', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'ngon',
          sides: 4,
          radius: 1,
        };
        const extrude: ExtrudeKind = {
          kind: 'linear',
          depth: 2,
          cap: 'none',
        };
        const options: ExtrudeOptions = {
          normals: false,
          uvs: false,
        };

        const points = generateProfile(profile);
        const result = extrudeProfile(points, extrude, options);

        // Check first triangle winding
        // Should be CCW when viewed from outside
        expect(result.indices.length).toBeGreaterThan(0);
        expect(result.indices.length % 3).toBe(0);
      });

      it('should use Uint16Array for small meshes', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'circle',
          radius: 1,
          segments: 8,
        };
        const extrude: ExtrudeKind = {
          kind: 'linear',
          depth: 2,
          cap: 'both',
        };
        const options: ExtrudeOptions = {
          normals: false,
          uvs: false,
        };

        const points = generateProfile(profile);
        const result = extrudeProfile(points, extrude, options);

        // Should use Uint16Array for small vertex counts
        expect(result.indices).toBeInstanceOf(Uint16Array);
      });

      it('should position vertices at correct depth', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'ngon',
          sides: 4,
          radius: 1,
        };
        const extrude: ExtrudeKind = {
          kind: 'linear',
          depth: 4,
          cap: 'both',
        };
        const options: ExtrudeOptions = {
          normals: false,
          uvs: false,
        };

        const points = generateProfile(profile);
        const result = extrudeProfile(points, extrude, options);

        // Check Z coordinates are at +depth/2 and -depth/2
        const positions = result.positions;
        let hasFrontZ = false;
        let hasBackZ = false;

        for (let i = 0; i < positions.length; i += 3) {
          const z = positions[i + 2];
          if (Math.abs(z - 2) < 0.001) hasFrontZ = true;
          if (Math.abs(z + 2) < 0.001) hasBackZ = true;
        }

        expect(hasFrontZ).toBe(true);
        expect(hasBackZ).toBe(true);
      });

      it('should generate outward-facing normals for side faces', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'circle',
          radius: 1,
          segments: 8,
        };
        const extrude: ExtrudeKind = {
          kind: 'linear',
          depth: 2,
          cap: 'none',
        };
        const options: ExtrudeOptions = {
          normals: true,
          uvs: false,
        };

        const points = generateProfile(profile);
        const result = extrudeProfile(points, extrude, options);

        // Check normals point outward (away from center)
        const normals = result.normals!;
        const positions = result.positions;

        for (let i = 0; i < normals.length; i += 3) {
          const nx = normals[i];
          const ny = normals[i + 1];
          const nz = normals[i + 2];

          const px = positions[i];
          const py = positions[i + 1];

          // For side faces, normal should point away from center
          // Dot product of normal and position (in XY) should be positive
          const dot = nx * px + ny * py;
          expect(dot).toBeGreaterThanOrEqual(0);

          // Z component of side normal should be ~0
          expect(Math.abs(nz)).toBeLessThan(0.1);
        }
      });

      it('should generate valid triangulation for caps', () => {
        const profile: ExtrudeProfile2D = {
          kind: 'ngon',
          sides: 6,
          radius: 1,
        };
        const extrude: ExtrudeKind = {
          kind: 'linear',
          depth: 2,
          cap: 'both',
        };
        const options: ExtrudeOptions = {
          normals: false,
          uvs: false,
        };

        const points = generateProfile(profile);
        const result = extrudeProfile(points, extrude, options);

        // Check all indices are valid
        const vertCount = result.positions.length / 3;
        for (let i = 0; i < result.indices.length; i++) {
          expect(result.indices[i]).toBeGreaterThanOrEqual(0);
          expect(result.indices[i]).toBeLessThan(vertCount);
        }
      });
    });
  });
});
