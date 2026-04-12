import type { Point } from '../hex';
import type { BoardInstance } from './boardModel';

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function boardLocalToWorld(instance: BoardInstance, point: Point): Point {
  const s = Math.max(0.0001, instance.scale || 1);
  const rad = degToRad(instance.rotationDeg);
  const x = point.x * s;
  const y = point.y * s;
  return {
    x: instance.worldX + x * Math.cos(rad) - y * Math.sin(rad),
    y: instance.worldY + x * Math.sin(rad) + y * Math.cos(rad),
  };
}

export function worldToBoardLocal(instance: BoardInstance, world: Point): Point {
  const s = Math.max(0.0001, instance.scale || 1);
  const rad = degToRad(-instance.rotationDeg);
  const dx = world.x - instance.worldX;
  const dy = world.y - instance.worldY;
  return {
    x: (dx * Math.cos(rad) - dy * Math.sin(rad)) / s,
    y: (dx * Math.sin(rad) + dy * Math.cos(rad)) / s,
  };
}

