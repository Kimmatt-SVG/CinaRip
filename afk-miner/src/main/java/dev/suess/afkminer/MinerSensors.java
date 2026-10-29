package dev.suess.afkminer;

import java.util.List;

public interface MinerSensors {
	boolean alive();

	double x();

	double y();

	double z();

	default BlockPoint feet() {
		return BlockPoint.of(x(), y(), z());
	}

	float health();

	int foodLevel();

	boolean foreignScreenOpen();

	boolean chestMenuOpen();

	boolean breaking();

	boolean shouldMine(BlockPoint point);

	boolean isChest(BlockPoint point);

	List<StackFacts> mainInventory();

	List<DepositSlot> openDepositSlots();

	WorldView world();
}
