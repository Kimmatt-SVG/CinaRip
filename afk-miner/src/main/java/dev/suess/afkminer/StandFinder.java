package dev.suess.afkminer;

/**
 * A feet position the player can occupy and still reach the target block.
 * The player never stands on the block they are about to break.
 */
public final class StandFinder {
	private static final int RADIUS = 4;

	private StandFinder() {
	}

	public static BlockPoint find(WorldView world, BlockPoint target, double feetX, double feetY, double feetZ, float health) {
		BlockPoint best = null;
		double bestDistance = Double.MAX_VALUE;
		for (int dy = -2; dy <= 3; dy++) {
			for (int dx = -RADIUS; dx <= RADIUS; dx++) {
				for (int dz = -RADIUS; dz <= RADIUS; dz++) {
					BlockPoint feet = target.offset(dx, dy, dz);
					if (!standsCleanly(world, feet, target, health)) {
						continue;
					}
					double sx = feet.x() + 0.5;
					double sz = feet.z() + 0.5;
					if (!Reach.canReach(sx, feet.y(), sz, target)) {
						continue;
					}
					double dist = squared(sx - feetX, feet.y() - feetY, sz - feetZ);
					if (dist < bestDistance) {
						bestDistance = dist;
						best = feet;
					}
				}
			}
		}
		return best;
	}

	private static boolean standsCleanly(WorldView world, BlockPoint feet, BlockPoint target, float health) {
		if (feet.below().equals(target)) {
			return false;
		}
		if (!world.passable(feet) || !world.passable(feet.above())) {
			return false;
		}
		if (!world.solid(feet.below()) || world.lava(feet) || world.lava(feet.above()) || world.lava(feet.below())) {
			return false;
		}
		Fall fall = FallSafety.inspect(world, feet, health);
		return fall.hazard() == Hazard.NONE && fall.blocks() == 0;
	}

	private static double squared(double x, double y, double z) {
		return x * x + y * y + z * z;
	}
}
