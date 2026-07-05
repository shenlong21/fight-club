import { Fixed } from "./Fixed.ts";
import { FixedVector3 } from "./FixedVector3.ts";
import type { FrameBox } from "./FrameData.ts";

export function aabbOverlap(
  centerA: FixedVector3, halfExtentsA: FixedVector3,
  centerB: FixedVector3, halfExtentsB: FixedVector3,
): boolean {
  return (
    Fixed.abs(Fixed.sub(centerA.x, centerB.x)).raw <= Fixed.add(halfExtentsA.x, halfExtentsB.x).raw &&
    Fixed.abs(Fixed.sub(centerA.y, centerB.y)).raw <= Fixed.add(halfExtentsA.y, halfExtentsB.y).raw &&
    Fixed.abs(Fixed.sub(centerA.z, centerB.z)).raw <= Fixed.add(halfExtentsA.z, halfExtentsB.z).raw
  );
}

export function resolveWorldCenter(playerPosition: FixedVector3, facingSign: number, box: FrameBox): FixedVector3 {
  return new FixedVector3(
    Fixed.add(playerPosition.x, Fixed.mulInt(box.localOffset.x, facingSign)),
    Fixed.add(playerPosition.y, box.localOffset.y),
    Fixed.add(playerPosition.z, box.localOffset.z),
  );
}
