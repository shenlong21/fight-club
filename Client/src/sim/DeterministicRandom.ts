export class DeterministicRandom {
  state: number; // treated as an unsigned 32-bit integer throughout

  constructor(seed: number) {
    this.state = (seed === 0 ? 0x9e3779b9 : seed) >>> 0;
  }

  nextUInt(): number {
    let x = this.state >>> 0;
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    this.state = x >>> 0;
    return this.state;
  }

  /** Returns a value in [minInclusive, maxExclusive). */
  nextRange(minInclusive: number, maxExclusive: number): number {
    const span = (maxExclusive - minInclusive) >>> 0;
    return minInclusive + (this.nextUInt() % span);
  }

  clone(): DeterministicRandom {
    const r = new DeterministicRandom(1);
    r.state = this.state;
    return r;
  }
}
