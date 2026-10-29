package dev.suess.afkminer;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Behavior checks for the planner. These do not need Minecraft or an account. */
public final class LogicTests {
	public static void main(String[] args) {
		pitIsInclusiveAndTopDown();
		marksRememberTheSecondCorner();
		fallDamageMatchesMinecraft();
		waterBreaksALongFall();
		lavaAndFatalDropsAreRefused();
		safeDropIsAllowed();
		stepUpReachesALedge();
		aimFacesPositiveZAtYawZero();
		hungryCharacterEatsBeforeMining();
		fullInventoryEmptiesIntoTheChestThenFinishes();
		aFullChestStopsTheMiner();
		lavaOnTheWayStopsTheMiner();
		System.out.println("AFK miner logic tests passed.");
	}

	private static void pitIsInclusiveAndTopDown() {
		PitVolume pit = new PitVolume(new BlockPoint(0, 0, 0), new BlockPoint(1, 1, 0));
		eq(4, pit.blockCount());
		eq("2 by 2 by 1 (4 blocks)", pit.sizeLabel());
		eq(List.of(
			new BlockPoint(0, 1, 0),
			new BlockPoint(1, 1, 0),
			new BlockPoint(1, 0, 0),
			new BlockPoint(0, 0, 0)
		), pit.miningOrder());
		ok(pit.contains(new BlockPoint(1, 0, 0)));
		ok(!pit.contains(new BlockPoint(2, 0, 0)));
	}

	private static void marksRememberTheSecondCorner() {
		Marks marks = new Marks();
		ok(marks.markCorner(new BlockPoint(1, 2, 3)).contains("Corner A"));
		ok(marks.markCorner(new BlockPoint(4, 2, 6)).contains("Corner B"));
		eq(16, marks.pit().blockCount());
		marks.markCorner(new BlockPoint(0, 0, 0));
		ok(marks.cornerB() == null);
		eq(new BlockPoint(0, 0, 0), marks.cornerA());
	}

	private static void fallDamageMatchesMinecraft() {
		eq(0, FallSafety.damage(0));
		eq(0, FallSafety.damage(3));
		eq(1, FallSafety.damage(4));
		eq(20, FallSafety.damage(23));
	}

	private static void waterBreaksALongFall() {
		GridWorld world = new GridWorld();
		world.set(new BlockPoint(0, 0, 0), Cell.SOLID);
		world.set(new BlockPoint(0, 1, 0), Cell.WATER);
		Fall fall = FallSafety.inspect(world, new BlockPoint(0, 30, 0), 20f);
		eq(Hazard.NONE, fall.hazard());
	}

	private static void lavaAndFatalDropsAreRefused() {
		GridWorld lava = tunnel(0, 8);
		lava.set(new BlockPoint(4, 1, 0), Cell.LAVA);
		lava.set(new BlockPoint(4, 0, 0), Cell.LAVA);
		PathResult throughLava = Pathfinder.find(lava, new BlockPoint(0, 1, 0), new BlockPoint(8, 1, 0), 20f);
		ok(throughLava.blocked());
		ok(throughLava.blockedReason().contains("lava"));

		GridWorld hole = tunnel(0, 6);
		for (int y = 0; y >= -50; y--) {
			hole.set(new BlockPoint(3, y, 0), Cell.AIR);
		}
		PathResult throughHole = Pathfinder.find(hole, new BlockPoint(0, 1, 0), new BlockPoint(6, 1, 0), 20f);
		ok(throughHole.blocked());
		ok(throughHole.blockedReason().contains("fatal"));
	}

	private static void safeDropIsAllowed() {
		GridWorld world = tunnel(0, 2);
		world.set(new BlockPoint(1, 0, 0), Cell.AIR);
		world.set(new BlockPoint(1, -1, 0), Cell.SOLID);
		PathResult path = Pathfinder.find(world, new BlockPoint(0, 1, 0), new BlockPoint(2, 1, 0), 20f);
		ok(!path.blocked());
		ok(path.steps().contains(new BlockPoint(1, 0, 0)));
	}

	private static void stepUpReachesALedge() {
		GridWorld world = tunnel(0, 1);
		world.set(new BlockPoint(1, 1, 0), Cell.SOLID);
		PathResult path = Pathfinder.find(world, new BlockPoint(0, 1, 0), new BlockPoint(1, 2, 0), 20f);
		ok(!path.blocked());
		eq(List.of(new BlockPoint(1, 2, 0)), path.steps());
	}

	private static void aimFacesPositiveZAtYawZero() {
		ok(Math.abs(Aim.yaw(0, 0, 0, 1)) < 0.01f);
		ok(Math.abs(Aim.yaw(0, 0, 1, 0) - (-90f)) < 0.01f);
	}

	private static void hungryCharacterEatsBeforeMining() {
		Harness world = quarry();
		world.food = 10;
		MinerBrain brain = new MinerBrain(world.marks);
		brain.toggle(world, world);
		brain.tick(world, world);
		ok(world.messages.stream().anyMatch(message -> message.contains("Eating")));
		eq(0, world.mineCalls);
		world.food = 20;
		for (int tick = 0; tick < 30 && brain.isRunning(); tick++) {
			brain.tick(world, world);
			world.simulate();
		}
		ok(world.mined >= 1);
	}

	private static void fullInventoryEmptiesIntoTheChestThenFinishes() {
		Harness world = quarry();
		MinerBrain brain = new MinerBrain(world.marks);
		brain.toggle(world, world);
		for (int tick = 0; tick < 250 && brain.isRunning(); tick++) {
			brain.tick(world, world);
			world.simulate();
		}
		ok(!brain.isRunning());
		eq(2, world.mined);
		ok(world.messages.stream().anyMatch(message -> message.contains("Taking items to the chest")));
		ok(world.messages.stream().anyMatch(message -> message.contains("Back to mining")));
		ok(world.messages.stream().anyMatch(message -> message.contains("finished")));
		ok(!world.chestOpen);
		for (BlockPoint step : world.walked) {
			ok(!world.world.lava(step));
		}
	}

	private static void aFullChestStopsTheMiner() {
		Harness world = quarry();
		world.fillLoot();
		world.rejectDeposit = true;
		MinerBrain brain = new MinerBrain(world.marks);
		brain.toggle(world, world);
		for (int tick = 0; tick < 80 && brain.isRunning(); tick++) {
			brain.tick(world, world);
			world.simulate();
		}
		ok(!brain.isRunning());
		eq(0, world.mineCalls);
		ok(world.messages.stream().anyMatch(message -> message.contains("chest is full")));
	}

	private static void lavaOnTheWayStopsTheMiner() {
		Harness world = new Harness();
		world.world = walledTunnel(-2, 12);
		world.world.set(new BlockPoint(5, 1, 0), Cell.LAVA);
		world.world.set(new BlockPoint(5, 0, 0), Cell.LAVA);
		world.chest = new BlockPoint(-2, 1, 0);
		world.world.set(world.chest, Cell.SOLID);
		BlockPoint ore = new BlockPoint(10, 1, 0);
		world.ore.add(ore);
		world.world.set(ore, Cell.SOLID);
		world.place(-2, 1, 0);
		world.marks.markCorner(ore);
		world.marks.markCorner(ore);
		world.marks.markChest(world.chest);
		world.place(0, 1, 0);

		MinerBrain brain = new MinerBrain(world.marks);
		brain.toggle(world, world);
		for (int tick = 0; tick < 40 && brain.isRunning(); tick++) {
			brain.tick(world, world);
			world.simulate();
		}
		ok(!brain.isRunning());
		ok(world.messages.stream().anyMatch(message -> message.contains("lava")));
		ok(world.feet().x() < 5);
		for (BlockPoint step : world.walked) {
			ok(!world.world.lava(step));
			ok(step.x() != 5);
		}
	}

	private static Harness quarry() {
		Harness world = new Harness();
		for (int x = -5; x <= 5; x++) {
			for (int z = -2; z <= 2; z++) {
				world.world.set(new BlockPoint(x, 63, z), Cell.SOLID);
			}
		}
		world.chest = new BlockPoint(-3, 64, 0);
		world.world.set(world.chest, Cell.SOLID);
		world.ore.add(new BlockPoint(1, 64, 0));
		world.ore.add(new BlockPoint(2, 64, 0));
		for (BlockPoint ore : world.ore) {
			world.world.set(ore, Cell.SOLID);
		}
		world.marks.markCorner(new BlockPoint(1, 64, 0));
		world.marks.markCorner(new BlockPoint(2, 64, 0));
		world.marks.markChest(world.chest);
		world.place(-1, 64, 0);
		return world;
	}

	private static GridWorld tunnel(int fromX, int toX) {
		GridWorld world = new GridWorld();
		for (int x = fromX; x <= toX; x++) {
			world.set(new BlockPoint(x, 0, 0), Cell.SOLID);
		}
		return world;
	}

	private static GridWorld walledTunnel(int fromX, int toX) {
		GridWorld world = new GridWorld();
		for (int x = fromX; x <= toX; x++) {
			for (int z = -4; z <= 4; z++) {
				world.set(new BlockPoint(x, 0, z), Cell.SOLID);
				world.set(new BlockPoint(x, 3, z), Cell.SOLID);
				if (z != 0) {
					world.set(new BlockPoint(x, 1, z), Cell.SOLID);
					world.set(new BlockPoint(x, 2, z), Cell.SOLID);
				}
			}
		}
		return world;
	}

	private static void eq(Object expected, Object actual) {
		if (expected == null ? actual != null : !expected.equals(actual)) {
			throw new AssertionError("expected " + expected + " but was " + actual);
		}
	}

	private static void ok(boolean condition) {
		if (!condition) {
			throw new AssertionError("expected condition to hold");
		}
	}

	private enum Cell {
		AIR,
		SOLID,
		LAVA,
		WATER
	}

	private static final class GridWorld implements WorldView {
		private final Map<BlockPoint, Cell> cells = new HashMap<>();

		void set(BlockPoint point, Cell cell) {
			if (cell == Cell.AIR) {
				cells.remove(point);
			} else {
				cells.put(point, cell);
			}
		}

		private Cell cell(BlockPoint point) {
			return cells.getOrDefault(point, Cell.AIR);
		}

		@Override
		public boolean solid(BlockPoint point) {
			return cell(point) == Cell.SOLID;
		}

		@Override
		public boolean lava(BlockPoint point) {
			return cell(point) == Cell.LAVA;
		}

		@Override
		public boolean water(BlockPoint point) {
			return cell(point) == Cell.WATER;
		}

		@Override
		public boolean passable(BlockPoint point) {
			return !solid(point) && !lava(point);
		}
	}

	private static final class Stack {
		private boolean empty = true;
		private boolean food;
		private boolean tool;
		private String key = "";
		private int count;
	}

	private static final class Harness implements MinerSensors, MinerControl {
		private GridWorld world = new GridWorld();
		private final Marks marks = new Marks();
		private final List<String> messages = new ArrayList<>();
		private final List<BlockPoint> walked = new ArrayList<>();
		private final Stack[] items = new Stack[36];
		private final Set<BlockPoint> ore = new HashSet<>();
		private double x;
		private double y;
		private double z;
		private float health = 20f;
		private int food = 20;
		private boolean chestOpen;
		private boolean breaking;
		private BlockPoint chest;
		private BlockPoint walk;
		private BlockPoint mining;
		private int mineTicks;
		private int mineCalls;
		private int mined;
		private boolean rejectDeposit;

		private Harness() {
			for (int i = 0; i < items.length; i++) {
				items[i] = new Stack();
			}
			items[0].empty = false;
			items[0].tool = true;
			items[0].key = "pick";
			items[0].count = 1;
			items[1].empty = false;
			items[1].food = true;
			items[1].key = "bread";
			items[1].count = 8;
		}

		private void place(int blockX, int blockY, int blockZ) {
			x = blockX + 0.5;
			y = blockY;
			z = blockZ + 0.5;
		}

		private void fillLoot() {
			for (Stack item : items) {
				if (item.food || item.tool) {
					continue;
				}
				item.empty = false;
				item.key = "cobble";
				item.count = 64;
			}
		}

		private void simulate() {
			if (walk == null) {
				return;
			}
			walked.add(walk);
			BlockPoint here = feet();
			int dx = Math.abs(here.x() - walk.x());
			int dy = Math.abs(here.y() - walk.y());
			int dz = Math.abs(here.z() - walk.z());
			if (dx <= 1 && dy <= 1 && dz <= 1) {
				place(walk.x(), walk.y(), walk.z());
			} else if (here.x() != walk.x()) {
				x = here.x() + Integer.signum(walk.x() - here.x()) + 0.5;
			} else if (here.z() != walk.z()) {
				z = here.z() + Integer.signum(walk.z() - here.z()) + 0.5;
			} else if (here.y() != walk.y()) {
				y = walk.y();
			}
			walk = null;
		}

		@Override
		public boolean alive() {
			return true;
		}

		@Override
		public double x() {
			return x;
		}

		@Override
		public double y() {
			return y;
		}

		@Override
		public double z() {
			return z;
		}

		@Override
		public float health() {
			return health;
		}

		@Override
		public int foodLevel() {
			return food;
		}

		@Override
		public boolean foreignScreenOpen() {
			return false;
		}

		@Override
		public boolean chestMenuOpen() {
			return chestOpen;
		}

		@Override
		public boolean breaking() {
			return breaking;
		}

		@Override
		public boolean shouldMine(BlockPoint point) {
			return ore.contains(point);
		}

		@Override
		public boolean isChest(BlockPoint point) {
			return point.equals(chest);
		}

		@Override
		public List<StackFacts> mainInventory() {
			List<StackFacts> facts = new ArrayList<>();
			for (Stack item : items) {
				facts.add(new StackFacts(item.empty, item.food, item.tool));
			}
			return facts;
		}

		@Override
		public List<DepositSlot> openDepositSlots() {
			if (!chestOpen) {
				return List.of();
			}
			List<DepositSlot> slots = new ArrayList<>();
			for (int i = 0; i < items.length; i++) {
				Stack item = items[i];
				slots.add(new DepositSlot(i, item.empty, item.food, item.tool, item.key, item.count));
			}
			return slots;
		}

		@Override
		public WorldView world() {
			return world;
		}

		@Override
		public void walkToward(BlockPoint feet, boolean jump, boolean sneak) {
			walk = feet;
		}

		@Override
		public void lookAtBlock(BlockPoint block) {
		}

		@Override
		public void holdStill() {
			walk = null;
		}

		@Override
		public void mine(BlockPoint block) {
			mineCalls++;
			if (!block.equals(mining)) {
				mining = block;
				mineTicks = 0;
			}
			mineTicks++;
			breaking = true;
			if (mineTicks >= 3) {
				ore.remove(block);
				world.set(block, Cell.AIR);
				mined++;
				mining = null;
				breaking = false;
				if (mined == 1) {
					fillLoot();
				}
			}
		}

		@Override
		public void stopMining() {
			breaking = false;
		}

		@Override
		public void interact(BlockPoint block) {
			if (block.equals(chest)) {
				chestOpen = true;
			}
		}

		@Override
		public void deposit(int menuIndex) {
			if (rejectDeposit || menuIndex < 0 || menuIndex >= items.length) {
				return;
			}
			Stack item = items[menuIndex];
			item.empty = true;
			item.food = false;
			item.tool = false;
			item.key = "";
			item.count = 0;
		}

		@Override
		public void closeMenu() {
			chestOpen = false;
		}

		@Override
		public void eat() {
		}

		@Override
		public void stopEating() {
		}

		@Override
		public void say(String message) {
			messages.add(message);
		}
	}
}
