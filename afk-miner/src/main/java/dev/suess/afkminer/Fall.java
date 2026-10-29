package dev.suess.afkminer;

/** What happens if the player moves into a feet-level block and gravity does the rest. */
public record Fall(Hazard hazard, BlockPoint landing, int blocks) {
	public static Fall blocked() {
		return new Fall(Hazard.BLOCKED, null, 0);
	}
}
