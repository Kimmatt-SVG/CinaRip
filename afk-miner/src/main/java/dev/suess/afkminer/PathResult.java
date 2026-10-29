package dev.suess.afkminer;

import java.util.List;

public record PathResult(List<BlockPoint> steps, String blockedReason) {
	public static PathResult path(List<BlockPoint> steps) {
		return new PathResult(List.copyOf(steps), null);
	}

	public static PathResult blocked(String reason) {
		return new PathResult(List.of(), reason);
	}

	public boolean blocked() {
		return blockedReason != null;
	}
}
