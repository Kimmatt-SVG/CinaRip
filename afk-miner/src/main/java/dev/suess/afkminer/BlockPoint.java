package dev.suess.afkminer;

import java.util.List;

/** A block coordinate. The player "feet" point is the air block their legs occupy. */
public record BlockPoint(int x, int y, int z) {
	public static BlockPoint of(double x, double y, double z) {
		return new BlockPoint((int) Math.floor(x), (int) Math.floor(y), (int) Math.floor(z));
	}

	public BlockPoint offset(int dx, int dy, int dz) {
		return new BlockPoint(x + dx, y + dy, z + dz);
	}

	public BlockPoint below() {
		return offset(0, -1, 0);
	}

	public BlockPoint above() {
		return offset(0, 1, 0);
	}

	public List<BlockPoint> cardinals() {
		return List.of(offset(1, 0, 0), offset(-1, 0, 0), offset(0, 0, 1), offset(0, 0, -1));
	}

	@Override
	public String toString() {
		return x + " " + y + " " + z;
	}
}
