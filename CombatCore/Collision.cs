namespace CombatCore;

public static class Collision
{
    /// <summary>
    /// Axis-aligned box overlap test. Chosen over capsules/spheres for this
    /// slice because AABB-vs-AABB needs no sqrt and no trig - it's three
    /// independent 1D interval overlap checks - which keeps the determinism
    /// surface area as small as possible. Capsule hitboxes are a reasonable
    /// upgrade later (better fit for limbs) but would only be worth the added
    /// complexity once the frame-data authoring pipeline is mature.
    /// </summary>
    public static bool AabbOverlap(
        FixedVector3 centerA, FixedVector3 halfExtentsA,
        FixedVector3 centerB, FixedVector3 halfExtentsB)
    {
        return Fixed.Abs(centerA.X - centerB.X) <= (halfExtentsA.X + halfExtentsB.X)
            && Fixed.Abs(centerA.Y - centerB.Y) <= (halfExtentsA.Y + halfExtentsB.Y)
            && Fixed.Abs(centerA.Z - centerB.Z) <= (halfExtentsA.Z + halfExtentsB.Z);
    }

    /// <summary>
    /// Resolves a FrameBox (authored in the attacker's local, facing-relative
    /// space) into a world-space center point for this frame, given the
    /// player's current position and facing direction.
    /// </summary>
    public static FixedVector3 ResolveWorldCenter(FixedVector3 playerPosition, int facingSign, FrameBox box)
    {
        return new FixedVector3(
            playerPosition.X + box.LocalOffset.X * facingSign,
            playerPosition.Y + box.LocalOffset.Y,
            playerPosition.Z + box.LocalOffset.Z);
    }
}
