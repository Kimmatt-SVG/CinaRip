package dev.suess.afkminer;

/** One player slot inside an open chest menu. */
public record DepositSlot(int menuIndex, boolean empty, boolean food, boolean tool, String key, int count) {
	public boolean depositable() {
		return !empty && !food && !tool;
	}
}
