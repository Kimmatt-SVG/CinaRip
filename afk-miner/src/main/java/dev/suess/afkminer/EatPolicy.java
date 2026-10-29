package dev.suess.afkminer;

public final class EatPolicy {
	private EatPolicy() {
	}

	/** Eat when hunger has room and either health or hunger is getting low. */
	public static boolean shouldEat(int foodLevel, float health, boolean hasFood) {
		if (!hasFood || foodLevel >= 20) {
			return false;
		}
		return health <= 12f || foodLevel <= 14;
	}

	public static boolean mustStop(float health, boolean hasFood) {
		return health <= 6f && !hasFood;
	}
}
