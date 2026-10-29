package dev.suess.afkminer;

import java.util.ArrayList;
import java.util.List;

/** Inclusive axis-aligned box between the two marked corners. */
public final class PitVolume {
	private final int minX;
	private final int maxX;
	private final int minY;
	private final int maxY;
	private final int minZ;
	private final int maxZ;

	public PitVolume(BlockPoint a, BlockPoint b) {
		this.minX = Math.min(a.x(), b.x());
		this.maxX = Math.max(a.x(), b.x());
		this.minY = Math.min(a.y(), b.y());
		this.maxY = Math.max(a.y(), b.y());
		this.minZ = Math.min(a.z(), b.z());
		this.maxZ = Math.max(a.z(), b.z());
	}

	public boolean contains(BlockPoint point) {
		return point.x() >= minX && point.x() <= maxX
			&& point.y() >= minY && point.y() <= maxY
			&& point.z() >= minZ && point.z() <= maxZ;
	}

	public int blockCount() {
		return width() * height() * depth();
	}

	public int width() {
		return maxX - minX + 1;
	}

	public int height() {
		return maxY - minY + 1;
	}

	public int depth() {
		return maxZ - minZ + 1;
	}

	public String sizeLabel() {
		return width() + " by " + height() + " by " + depth() + " (" + blockCount() + " blocks)";
	}

	/**
	 * Top layer first, so the miner stands on stone that has not been removed yet.
	 * Rows alternate direction so the walk back across a layer stays short.
	 */
	public List<BlockPoint> miningOrder() {
		List<BlockPoint> order = new ArrayList<>(blockCount());
		int row = 0;
		for (int y = maxY; y >= minY; y--) {
			for (int z = minZ; z <= maxZ; z++) {
				if ((row & 1) == 0) {
					for (int x = minX; x <= maxX; x++) {
						order.add(new BlockPoint(x, y, z));
					}
				} else {
					for (int x = maxX; x >= minX; x--) {
						order.add(new BlockPoint(x, y, z));
					}
				}
				row++;
			}
		}
		return order;
	}
}
