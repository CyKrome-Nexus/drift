import { describe, expect, it } from 'vitest';
import { boxOffset, farthestCorner, gradientLine } from './paint';

describe('painting the art like CSS does', () => {
  it('sizes radial gradients to the farthest corner', () => {
    // Centred circle in a 300×400 box: the corner is 250 away.
    expect(farthestCorner({ x: 50, y: 50, shape: 'circle' }, 300, 400)).toEqual({ rx: 250, ry: 250 });
    // An ellipse keeps the farthest-side ratio and passes through the corner: (dx/rx)² + (dy/ry)² = 1.
    const { rx, ry } = farthestCorner({ x: 25, y: 10, shape: 'ellipse' }, 400, 200);
    expect((300 / rx) ** 2 + (180 / ry) ** 2).toBeCloseTo(1, 9);
    expect(rx / ry).toBeCloseTo(300 / 180, 9);
  });

  it('runs a linear gradient line corner to corner along its angle', () => {
    // 180deg is top to bottom.
    const round = (line: number[]) => line.map((v) => Math.round(v) + 0);
    expect(round(gradientLine(180, 100, 50))).toEqual([50, 0, 50, 50]);
    // 90deg is left to right.
    expect(round(gradientLine(90, 100, 50))).toEqual([0, 25, 100, 25]);
  });

  it('places the 170% box like background-position drift% drift%', () => {
    expect(boxOffset(0, 100, 50, 170, 85).map((v) => v + 0)).toEqual([0, 0]);
    expect(boxOffset(1, 100, 50, 170, 85)).toEqual([-70, -35]);
  });
});
