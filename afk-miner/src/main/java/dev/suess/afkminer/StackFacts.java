package dev.suess.afkminer;

public record StackFacts(boolean empty, boolean food, boolean tool) {
	public boolean depositable() {
		return !empty && !food && !tool;
	}
}
