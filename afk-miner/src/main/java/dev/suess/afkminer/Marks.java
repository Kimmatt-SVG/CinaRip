package dev.suess.afkminer;

/** The two pit corners and the chest, as marked in the world. */
public final class Marks {
	private BlockPoint cornerA;
	private BlockPoint cornerB;
	private BlockPoint chest;

	public BlockPoint cornerA() {
		return cornerA;
	}

	public BlockPoint cornerB() {
		return cornerB;
	}

	public BlockPoint chest() {
		return chest;
	}

	public void set(BlockPoint cornerA, BlockPoint cornerB, BlockPoint chest) {
		this.cornerA = cornerA;
		this.cornerB = cornerB;
		this.chest = chest;
	}

	public PitVolume pit() {
		if (cornerA == null || cornerB == null) {
			return null;
		}
		return new PitVolume(cornerA, cornerB);
	}

	public String markCorner(BlockPoint point) {
		if (cornerA == null || cornerB != null) {
			cornerA = point;
			cornerB = null;
			return "Corner A set to " + point + ". Look at the opposite corner and press the pit key again.";
		}
		cornerB = point;
		return "Corner B set to " + point + ". Pit is " + pit().sizeLabel() + ".";
	}

	public String markChest(BlockPoint point) {
		chest = point;
		return "Chest set to " + point + ".";
	}

	public void clear() {
		cornerA = null;
		cornerB = null;
		chest = null;
	}
}
