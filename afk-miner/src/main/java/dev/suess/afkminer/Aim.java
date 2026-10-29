package dev.suess.afkminer;

/** Yaw and pitch in degrees, matching Minecraft's look convention. */
public final class Aim {
	private Aim() {
	}

	public static float yaw(double fromX, double fromZ, double toX, double toZ) {
		return (float) Math.toDegrees(Math.atan2(-(toX - fromX), toZ - fromZ));
	}

	public static float pitch(double fromX, double fromY, double fromZ, double toX, double toY, double toZ) {
		double dx = toX - fromX;
		double dy = toY - fromY;
		double dz = toZ - fromZ;
		double horizontal = Math.sqrt(dx * dx + dz * dz);
		return (float) Math.toDegrees(-Math.atan2(dy, horizontal));
	}
}
