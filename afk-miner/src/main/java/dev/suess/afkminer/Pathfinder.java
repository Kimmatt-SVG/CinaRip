package dev.suess.afkminer;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Cardinal steps only. Drops are allowed when the landing is not lava and the fall is not fatal. */
public final class Pathfinder {
	private static final int MAX_NODES = 10000;
	private static final int[] DX = {1, -1, 0, 0};
	private static final int[] DZ = {0, 0, 1, -1};

	private Pathfinder() {
	}

	public static PathResult find(WorldView world, BlockPoint start, BlockPoint goal, float health) {
		if (start.equals(goal)) {
			return PathResult.path(List.of());
		}

		Map<BlockPoint, BlockPoint> parent = new HashMap<>();
		ArrayDeque<BlockPoint> queue = new ArrayDeque<>();
		Set<BlockPoint> seen = new HashSet<>();
		parent.put(start, null);
		queue.add(start);
		seen.add(start);

		while (!queue.isEmpty() && seen.size() <= MAX_NODES) {
			BlockPoint at = queue.removeFirst();
			for (BlockPoint next : neighbors(world, at, health)) {
				if (!seen.add(next)) {
					continue;
				}
				parent.put(next, at);
				if (next.equals(goal)) {
					return PathResult.path(rebuild(parent, goal));
				}
				queue.add(next);
			}
		}
		return PathResult.blocked(reason(world, start, goal, health));
	}

	private static List<BlockPoint> neighbors(WorldView world, BlockPoint at, float health) {
		List<BlockPoint> next = new ArrayList<>(8);
		for (int i = 0; i < DX.length; i++) {
			BlockPoint entered = at.offset(DX[i], 0, DZ[i]);
			Fall fall = FallSafety.inspect(world, entered, health);
			if (fall.hazard() == Hazard.NONE && fall.landing() != null) {
				next.add(fall.landing());
			}
			BlockPoint up = at.offset(DX[i], 1, DZ[i]);
			if (canStepUp(world, at, up, health)) {
				next.add(up);
			}
		}
		return next;
	}

	private static boolean canStepUp(WorldView world, BlockPoint from, BlockPoint up, float health) {
		if (!world.solid(up.below())) {
			return false;
		}
		if (!world.passable(from.above().above())) {
			return false;
		}
		Fall fall = FallSafety.inspect(world, up, health);
		return fall.hazard() == Hazard.NONE && fall.blocks() == 0 && up.equals(fall.landing());
	}

	private static List<BlockPoint> rebuild(Map<BlockPoint, BlockPoint> parent, BlockPoint goal) {
		List<BlockPoint> reversed = new ArrayList<>();
		BlockPoint cursor = goal;
		while (cursor != null && parent.containsKey(cursor)) {
			BlockPoint previous = parent.get(cursor);
			if (previous == null) {
				break;
			}
			reversed.add(cursor);
			cursor = previous;
		}
		List<BlockPoint> steps = new ArrayList<>(reversed.size());
		for (int i = reversed.size() - 1; i >= 0; i--) {
			steps.add(reversed.get(i));
		}
		return steps;
	}

	private static String reason(WorldView world, BlockPoint start, BlockPoint goal, float health) {
		boolean fatal = false;
		BlockPoint cursor = start;
		int guard = 0;
		while (!cursor.equals(goal) && guard++ < 64) {
			int dx = Integer.compare(goal.x(), cursor.x());
			int dz = Integer.compare(goal.z(), cursor.z());
			if (dx != 0 && dz != 0) {
				dz = 0;
			}
			if (dx == 0 && dz == 0) {
				break;
			}
			cursor = cursor.offset(dx, 0, dz);
			Fall ahead = FallSafety.inspect(world, cursor, health);
			if (ahead.hazard() == Hazard.LAVA) {
				return "Stopped. The way forward is lava.";
			}
			if (ahead.hazard() == Hazard.LETHAL_DROP) {
				fatal = true;
			}
		}
		if (fatal) {
			return "Stopped. The way forward is a drop that would be fatal.";
		}
		return "Stopped. There is no safe path from here.";
	}
}
