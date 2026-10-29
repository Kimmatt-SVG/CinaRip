package dev.suess.afkminer;

import java.util.List;

public final class InventoryRules {
	private InventoryRules() {
	}

	public static boolean isFull(List<StackFacts> mainInventory) {
		if (mainInventory.isEmpty()) {
			return false;
		}
		for (StackFacts stack : mainInventory) {
			if (stack.empty()) {
				return false;
			}
		}
		return true;
	}

	public static boolean hasFood(List<StackFacts> mainInventory) {
		for (StackFacts stack : mainInventory) {
			if (stack.food()) {
				return true;
			}
		}
		return false;
	}

	public static boolean hasDepositable(List<StackFacts> mainInventory) {
		for (StackFacts stack : mainInventory) {
			if (stack.depositable()) {
				return true;
			}
		}
		return false;
	}
}
