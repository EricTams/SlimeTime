import type { Vector2 } from './types';

export const ZERO: Vector2 = { x: 0, y: 0 };

export function vec(x = 0, y = 0): Vector2 {
  return { x, y };
}

export function add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vector2, scalar: number): Vector2 {
  return { x: a.x * scalar, y: a.y * scalar };
}

export function lengthSquared(a: Vector2): number {
  return a.x * a.x + a.y * a.y;
}

export function length(a: Vector2): number {
  return Math.sqrt(lengthSquared(a));
}

export function normalize(a: Vector2): Vector2 {
  const magnitude = length(a);
  return magnitude > 0 ? scale(a, 1 / magnitude) : vec();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function distanceSquared(a: Vector2, b: Vector2): number {
  return lengthSquared(subtract(a, b));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
