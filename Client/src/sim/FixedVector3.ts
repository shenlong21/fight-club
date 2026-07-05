import { Fixed } from "./Fixed.ts";

export class FixedVector3 {
  readonly x: Fixed;
  readonly y: Fixed;
  readonly z: Fixed;

  constructor(x: Fixed, y: Fixed, z: Fixed) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  static readonly ZERO = new FixedVector3(Fixed.ZERO, Fixed.ZERO, Fixed.ZERO);

  static fromFloats(x: number, y: number, z: number): FixedVector3 {
    return new FixedVector3(Fixed.fromFloat(x), Fixed.fromFloat(y), Fixed.fromFloat(z));
  }

  static add(a: FixedVector3, b: FixedVector3): FixedVector3 {
    return new FixedVector3(Fixed.add(a.x, b.x), Fixed.add(a.y, b.y), Fixed.add(a.z, b.z));
  }

  static sub(a: FixedVector3, b: FixedVector3): FixedVector3 {
    return new FixedVector3(Fixed.sub(a.x, b.x), Fixed.sub(a.y, b.y), Fixed.sub(a.z, b.z));
  }

  static scale(a: FixedVector3, s: Fixed): FixedVector3 {
    return new FixedVector3(Fixed.mul(a.x, s), Fixed.mul(a.y, s), Fixed.mul(a.z, s));
  }

  static scaleInt(a: FixedVector3, s: number): FixedVector3 {
    return new FixedVector3(Fixed.mulInt(a.x, s), Fixed.mulInt(a.y, s), Fixed.mulInt(a.z, s));
  }

  equals(other: FixedVector3): boolean {
    return this.x.equals(other.x) && this.y.equals(other.y) && this.z.equals(other.z);
  }

  toString(): string {
    return `(${this.x}, ${this.y}, ${this.z})`;
  }
}
