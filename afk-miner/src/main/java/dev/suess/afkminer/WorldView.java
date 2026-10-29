package dev.suess.afkminer;

/** The slice of the world the planner is allowed to ask about. */
public interface WorldView {
	boolean solid(BlockPoint point);

	boolean lava(BlockPoint point);

	boolean water(BlockPoint point);

	/** A body can occupy this block: not solid and not lava. Water counts as passable. */
	boolean passable(BlockPoint point);
}
