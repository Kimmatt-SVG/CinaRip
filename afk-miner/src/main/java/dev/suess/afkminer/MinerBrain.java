package dev.suess.afkminer;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Decides the next honest client action: walk, mine, eat, or empty into the chest.
 * It never sends raw packets and it never disguises those actions.
 */
public final class MinerBrain {
	private enum Activity {
		STOPPED,
		MINING,
		TO_CHEST,
		OPENING,
		DEPOSITING,
		EATING
	}

	private final Marks marks;
	private Activity activity = Activity.STOPPED;
	private Activity resume = Activity.MINING;
	private final Set<BlockPoint> deferred = new HashSet<>();
	private boolean retriedDeferred;
	private int stillTicks;
	private BlockPoint stillAt;
	private int openTicks;
	private int breakTicks;
	private BlockPoint breakingBlock;
	private int pendingDeposit = -1;
	private int pendingWait;
	private String pendingKey;
	private int pendingCount;
	private final Set<String> rejected = new HashSet<>();
	private boolean announcedEating;

	public MinerBrain(Marks marks) {
		this.marks = marks;
	}

	public boolean isRunning() {
		return activity != Activity.STOPPED;
	}

	public void toggle(MinerSensors sensors, MinerControl control) {
		if (isRunning()) {
			stop(control, "AFK miner stopped.");
		} else {
			start(sensors, control);
		}
	}

	public void tick(MinerSensors sensors, MinerControl control) {
		if (!isRunning()) {
			return;
		}
		if (!sensors.alive()) {
			stop(control, "The miner stopped because the character is no longer in the world.");
			return;
		}
		if (sensors.foreignScreenOpen()) {
			control.holdStill();
			control.stopMining();
			return;
		}
		if (EatPolicy.mustStop(sensors.health(), InventoryRules.hasFood(sensors.mainInventory()))) {
			stop(control, "Health is low and there is no food. Miner stopped.");
			return;
		}
		if (wantsToEat(sensors) && activity != Activity.OPENING && activity != Activity.DEPOSITING) {
			beginEating(control);
		}

		switch (activity) {
			case EATING -> tickEat(sensors, control);
			case MINING -> tickMine(sensors, control);
			case TO_CHEST -> tickToChest(sensors, control);
			case OPENING -> tickOpen(sensors, control);
			case DEPOSITING -> tickDeposit(sensors, control);
			case STOPPED -> {
			}
		}
	}

	private void start(MinerSensors sensors, MinerControl control) {
		PitVolume pit = marks.pit();
		if (pit == null) {
			control.say("Mark both pit corners before starting.");
			return;
		}
		if (marks.chest() == null) {
			control.say("Mark a chest before starting.");
			return;
		}
		if (!sensors.isChest(marks.chest())) {
			control.say("Look at a chest or barrel and mark it again. " + marks.chest() + " is not one.");
			return;
		}
		deferred.clear();
		retriedDeferred = false;
		rejected.clear();
		pendingDeposit = -1;
		pendingWait = 0;
		stillTicks = 0;
		stillAt = null;
		breakTicks = 0;
		breakingBlock = null;
		activity = Activity.MINING;
		control.say("AFK miner started. Pit is " + pit.sizeLabel() + ". Press the toggle key to take the keyboard back.");
	}

	public void stop(MinerControl control, String message) {
		activity = Activity.STOPPED;
		control.holdStill();
		control.stopMining();
		control.stopEating();
		control.closeMenu();
		if (message != null) {
			control.say(message);
		}
	}

	private boolean wantsToEat(MinerSensors sensors) {
		return EatPolicy.shouldEat(sensors.foodLevel(), sensors.health(), InventoryRules.hasFood(sensors.mainInventory()));
	}

	private void beginEating(MinerControl control) {
		if (activity != Activity.EATING) {
			resume = activity;
			control.stopMining();
			if (!announcedEating) {
				control.say("Eating.");
				announcedEating = true;
			}
			activity = Activity.EATING;
		}
	}

	private void tickEat(MinerSensors sensors, MinerControl control) {
		control.stopMining();
		control.holdStill();
		control.eat();
		if (!wantsToEat(sensors)) {
			control.stopEating();
			announcedEating = false;
			activity = resume == Activity.EATING ? Activity.MINING : resume;
		}
	}

	private void tickMine(MinerSensors sensors, MinerControl control) {
		if (InventoryRules.isFull(sensors.mainInventory())) {
			if (!InventoryRules.hasDepositable(sensors.mainInventory())) {
				stop(control, "Inventory is full of food and tools, so there is nothing to put in the chest. Miner stopped.");
				return;
			}
			rejected.clear();
			pendingDeposit = -1;
			pendingWait = 0;
			control.stopMining();
			control.say("Inventory is full. Taking items to the chest.");
			activity = Activity.TO_CHEST;
			return;
		}

		BlockPoint target = nextBlock(sensors);
		if (target == null) {
			if (!deferred.isEmpty() && !retriedDeferred) {
				deferred.clear();
				retriedDeferred = true;
				control.stopMining();
				return;
			}
			stop(control, deferred.isEmpty() ? "The pit is finished." : "Some blocks never broke. Miner stopped.");
			return;
		}

		BlockPoint stand = StandFinder.find(sensors.world(), target, sensors.x(), sensors.y(), sensors.z(), sensors.health());
		if (stand == null) {
			deferred.add(target);
			control.stopMining();
			return;
		}
		if (!travel(sensors, control, stand)) {
			control.stopMining();
			return;
		}
		if (!Reach.canReach(sensors.x(), sensors.y(), sensors.z(), target)) {
			deferred.add(target);
			control.stopMining();
			return;
		}

		control.lookAtBlock(target);
		control.holdStill();
		if (!target.equals(breakingBlock)) {
			breakingBlock = target;
			breakTicks = 0;
		}
		control.mine(target);
		if (!sensors.shouldMine(target)) {
			breakTicks = 0;
			breakingBlock = null;
			return;
		}
		if (sensors.breaking()) {
			breakTicks = 0;
		} else {
			breakTicks++;
		}
		if (breakTicks > 40) {
			deferred.add(target);
			breakingBlock = null;
			breakTicks = 0;
			control.stopMining();
			control.say("Skipping " + target + " for now. It is not breaking.");
		}
	}

	private BlockPoint nextBlock(MinerSensors sensors) {
		PitVolume pit = marks.pit();
		if (pit == null) {
			return null;
		}
		for (BlockPoint point : pit.miningOrder()) {
			if (deferred.contains(point) || point.equals(marks.chest())) {
				continue;
			}
			if (sensors.shouldMine(point)) {
				return point;
			}
		}
		return null;
	}

	private void tickToChest(MinerSensors sensors, MinerControl control) {
		BlockPoint chest = marks.chest();
		if (chest == null || !sensors.isChest(chest)) {
			stop(control, "The marked chest is not there anymore. Miner stopped.");
			return;
		}
		BlockPoint stand = StandFinder.find(sensors.world(), chest, sensors.x(), sensors.y(), sensors.z(), sensors.health());
		if (stand == null) {
			stop(control, "There is no safe place to stand next to the chest. Miner stopped.");
			return;
		}
		if (!travel(sensors, control, stand)) {
			return;
		}
		openTicks = 0;
		activity = Activity.OPENING;
	}

	private void tickOpen(MinerSensors sensors, MinerControl control) {
		if (sensors.chestMenuOpen()) {
			pendingDeposit = -1;
			pendingWait = 0;
			activity = Activity.DEPOSITING;
			return;
		}
		BlockPoint chest = marks.chest();
		if (!Reach.canReach(sensors.x(), sensors.y(), sensors.z(), chest)) {
			activity = Activity.TO_CHEST;
			return;
		}
		control.lookAtBlock(chest);
		control.holdStill();
		if (openTicks % 10 == 0) {
			control.interact(chest);
		}
		openTicks++;
		if (openTicks > 60) {
			stop(control, "The chest did not open. Miner stopped.");
		}
	}

	private void tickDeposit(MinerSensors sensors, MinerControl control) {
		if (!sensors.chestMenuOpen()) {
			activity = Activity.OPENING;
			openTicks = 0;
			return;
		}
		control.holdStill();
		List<DepositSlot> slots = sensors.openDepositSlots();
		if (pendingDeposit >= 0) {
			DepositSlot current = findSlot(slots, pendingDeposit);
			boolean moved = current == null
				|| current.empty()
				|| current.count() != pendingCount
				|| !current.key().equals(pendingKey);
			if (!moved && pendingWait < 10) {
				pendingWait++;
				return;
			}
			if (!moved) {
				rejected.add(pendingKey);
			}
			pendingDeposit = -1;
			pendingWait = 0;
		}

		DepositSlot next = null;
		for (DepositSlot slot : slots) {
			if (slot.depositable() && !rejected.contains(slot.key())) {
				next = slot;
				break;
			}
		}
		if (next == null) {
			control.closeMenu();
			boolean stillFull = InventoryRules.isFull(sensors.mainInventory());
			boolean anythingLeft = InventoryRules.hasDepositable(sensors.mainInventory());
			if (stillFull && anythingLeft) {
				stop(control, "The chest is full. Miner stopped.");
				return;
			}
			activity = Activity.MINING;
			control.say("Items are in the chest. Back to mining.");
			return;
		}
		control.deposit(next.menuIndex());
		pendingDeposit = next.menuIndex();
		pendingKey = next.key();
		pendingCount = next.count();
	}

	private static DepositSlot findSlot(List<DepositSlot> slots, int menuIndex) {
		for (DepositSlot slot : slots) {
			if (slot.menuIndex() == menuIndex) {
				return slot;
			}
		}
		return null;
	}

	/** @return true when the player is standing on the goal and centered on it */
	private boolean travel(MinerSensors sensors, MinerControl control, BlockPoint goal) {
		if (Reach.arrived(sensors.x(), sensors.y(), sensors.z(), goal)) {
			control.holdStill();
			stillTicks = 0;
			return true;
		}
		if (sensors.feet().equals(goal)) {
			control.walkToward(goal, false, false);
			return false;
		}

		PathResult path = Pathfinder.find(sensors.world(), sensors.feet(), goal, sensors.health());
		if (path.blocked()) {
			stop(control, path.blockedReason());
			return false;
		}
		BlockPoint next = path.steps().isEmpty() ? goal : path.steps().get(0);
		if (sensors.feet().equals(stillAt)) {
			stillTicks++;
		} else {
			stillAt = sensors.feet();
			stillTicks = 0;
		}
		if (stillTicks > 80) {
			stop(control, "The miner is stuck and stopped so it would not keep pushing.");
			return false;
		}

		boolean drop = next.y() < sensors.feet().y();
		boolean sameColumn = sensors.feet().x() == next.x() && sensors.feet().z() == next.z();
		if (sameColumn && drop) {
			control.lookAtBlock(next);
			control.holdStill();
			return false;
		}
		boolean jump = next.y() > sensors.feet().y();
		boolean sneak = !drop && !jump && FallSafety.riskySide(sensors.world(), sensors.feet(), next, sensors.health());
		control.walkToward(next, jump, sneak);
		return false;
	}
}
