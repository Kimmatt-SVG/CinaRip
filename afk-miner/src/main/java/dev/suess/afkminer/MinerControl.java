package dev.suess.afkminer;

public interface MinerControl {
	void walkToward(BlockPoint feet, boolean jump, boolean sneak);

	void lookAtBlock(BlockPoint block);

	void holdStill();

	void mine(BlockPoint block);

	void stopMining();

	void interact(BlockPoint block);

	void deposit(int menuIndex);

	void closeMenu();

	void eat();

	void stopEating();

	void say(String message);
}
