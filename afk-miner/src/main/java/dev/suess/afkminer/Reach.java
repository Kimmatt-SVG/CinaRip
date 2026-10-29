package dev.suess.afkminer;

public final class Reach {
	public static final double BLOCK_REACH = 4.5;
	public static final double EYE_HEIGHT = 1.62;
	private static final double CENTERED = 0.4;

	private Reach() {
	}

	public static boolean canReach(double feetX, double feetY, double feetZ, BlockPoint block) {
		double dx = (block.x() + 0.5) - feetX;
		double dy = (block.y() + 0.5) - (feetY + EYE_HEIGHT);
		double dz = (block.z() + 0.5) - feetZ;
		return dx * dx + dy * dy + dz * dz <= BLOCK_REACH * BLOCK_REACH;
	}

	public static boolean centered(double feetX, double feetZ, BlockPoint block) {
		double dx = feetX - (block.x() + 0.5);
		double dz = feetZ - (block.z() + 0.5);
		return dx * dx + dz * dz <= CENTERED * CENTERED;
	}

	public static boolean arrived(double feetX, double feetY, double feetZ, BlockPoint block) {
		return BlockPoint.of(feetX, feetY, feetZ).equals(block) && centered(feetX, feetZ, block);
	}
}
