package dev.suess.afkminer;

/**
 * Minecraft fall damage is {@code max(0, fallenBlocks - 3)} health points.
 * A 4-block fall deals 1. A 23-block fall deals 20, which kills a healthy player.
 */
public final class FallSafety {
	public static final int MAX_SCAN = 48;

	private FallSafety() {
	}

	public static int damage(int fallenBlocks) {
		return Math.max(0, fallenBlocks - 3);
	}

	public static Fall inspect(WorldView world, BlockPoint enter, float health) {
		if (enter.y() < -128 || enter.y() > 400) {
			return new Fall(Hazard.LETHAL_DROP, null, MAX_SCAN);
		}
		if (world.lava(enter) || world.lava(enter.above())) {
			return new Fall(Hazard.LAVA, null, 0);
		}
		if (!world.passable(enter) || !world.passable(enter.above())) {
			return Fall.blocked();
		}

		int fallen = 0;
		boolean touchedWater = false;
		BlockPoint feet = enter;
		while (!world.solid(feet.below())) {
			BlockPoint under = feet.below();
			if (world.lava(under)) {
				return new Fall(Hazard.LAVA, null, fallen + 1);
			}
			if (world.water(under)) {
				touchedWater = true;
			}
			feet = under;
			fallen++;
			if (fallen > MAX_SCAN || feet.y() < -128) {
				return new Fall(Hazard.LETHAL_DROP, null, fallen);
			}
			if (!world.passable(feet)) {
				return Fall.blocked();
			}
		}

		if (!touchedWater && damage(fallen) >= health) {
			return new Fall(Hazard.LETHAL_DROP, feet, fallen);
		}
		return new Fall(Hazard.NONE, feet, fallen);
	}

	/** A side column that would hurt if the player slid off the planned step. */
	public static boolean riskySide(WorldView world, BlockPoint feet, BlockPoint plannedStep, float health) {
		for (BlockPoint side : feet.cardinals()) {
			if (sameColumn(side, plannedStep)) {
				continue;
			}
			Fall fall = inspect(world, side, health);
			if (fall.hazard() == Hazard.LAVA || fall.hazard() == Hazard.LETHAL_DROP) {
				return true;
			}
			if (fall.hazard() == Hazard.NONE && fall.blocks() >= 1) {
				return true;
			}
		}
		return false;
	}

	private static boolean sameColumn(BlockPoint side, BlockPoint plannedStep) {
		return plannedStep != null && side.x() == plannedStep.x() && side.z() == plannedStep.z();
	}
}
