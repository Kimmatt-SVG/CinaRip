package dev.suess.afkminer.client;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

import dev.suess.afkminer.Aim;
import dev.suess.afkminer.BlockPoint;
import dev.suess.afkminer.DepositSlot;
import dev.suess.afkminer.Marks;
import dev.suess.afkminer.MinerBrain;
import dev.suess.afkminer.MinerControl;
import dev.suess.afkminer.MinerSensors;
import dev.suess.afkminer.StackFacts;
import dev.suess.afkminer.WorldView;

import com.mojang.blaze3d.platform.InputConstants;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Options;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.multiplayer.MultiPlayerGameMode;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.tags.FluidTags;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.loader.api.FabricLoader;

/**
 * Drives the local player through the same keys and game-mode calls the window
 * already uses. Nothing here logs in, reads a password, or hides the mod from the server.
 */
public final class AfkMinerRuntime {
	private static final AfkMinerRuntime INSTANCE = new AfkMinerRuntime();

	private final Marks marks = new Marks();
	private final MinerBrain brain = new MinerBrain(marks);
	private final Bridge bridge = new Bridge();

	private KeyMapping toggleKey;
	private KeyMapping cornerKey;
	private KeyMapping chestKey;
	private KeyMapping clearKey;

	private boolean overrideInput;
	private boolean forward;
	private boolean jump;
	private boolean sneak;
	private BlockPoint lookBlock;
	private boolean lookAtCenter;

	private AfkMinerRuntime() {
	}

	public static AfkMinerRuntime get() {
		return INSTANCE;
	}

	public static void applyInput(LocalPlayer player) {
		INSTANCE.applyTo(player);
	}

	public void register() {
		KeyMapping.Category category = KeyMapping.Category.register(
			Identifier.fromNamespaceAndPath("afkminer", "keys"));
		toggleKey = bind(category, "key.afkminer.toggle", InputConstants.KEY_K);
		cornerKey = bind(category, "key.afkminer.corner", InputConstants.KEY_J);
		chestKey = bind(category, "key.afkminer.chest", InputConstants.KEY_U);
		clearKey = bind(category, "key.afkminer.clear", InputConstants.KEY_H);
		loadMarks();
		ClientTickEvents.START_CLIENT_TICK.register(client -> onTick());
	}

	private static KeyMapping bind(KeyMapping.Category category, String name, int key) {
		return KeyMappingHelper.registerKeyMapping(new KeyMapping(
			name,
			InputConstants.Type.KEYSYM,
			key,
			category
		));
	}

	private void onTick() {
		boolean wasRunning = brain.isRunning();
		Minecraft client = Minecraft.getInstance();
		while (toggleKey.consumeClick()) {
			if (client.player != null) {
				brain.toggle(bridge, bridge);
			}
		}
		while (cornerKey.consumeClick()) {
			markCorner();
		}
		while (chestKey.consumeClick()) {
			markChest();
		}
		while (clearKey.consumeClick()) {
			clearMarks();
		}

		if (client.player == null || client.level == null || client.gameMode == null) {
			if (brain.isRunning()) {
				brain.stop(bridge, "The miner stopped because the world closed.");
			}
		} else if (brain.isRunning()) {
			brain.tick(bridge, bridge);
		}

		overrideInput = brain.isRunning() || wasRunning;
		if (!brain.isRunning()) {
			forward = false;
			jump = false;
			sneak = false;
			if (!wasRunning) {
				lookBlock = null;
			}
		}
	}

	private void applyTo(LocalPlayer player) {
		if (!overrideInput) {
			return;
		}
		Minecraft client = Minecraft.getInstance();
		if (client.player != player) {
			return;
		}
		Options options = client.options;
		options.keyUp.setDown(forward);
		options.keyDown.setDown(false);
		options.keyLeft.setDown(false);
		options.keyRight.setDown(false);
		options.keyJump.setDown(jump);
		options.keyShift.setDown(sneak);
		options.keySprint.setDown(false);

		if (lookBlock != null) {
			double targetX = lookBlock.x() + 0.5;
			double targetZ = lookBlock.z() + 0.5;
			double targetY = lookAtCenter ? lookBlock.y() + 0.5 : player.getEyeY();
			float yaw = Aim.yaw(player.getX(), player.getZ(), targetX, targetZ);
			float pitch = Aim.pitch(player.getX(), player.getEyeY(), player.getZ(), targetX, targetY, targetZ);
			player.setYRot(yaw);
			player.setXRot(pitch);
			player.setYHeadRot(yaw);
		}
		if (!brain.isRunning()) {
			overrideInput = false;
			lookBlock = null;
		}
	}

	private void markCorner() {
		if (refuseMarksWhileRunning()) {
			return;
		}
		BlockPoint looked = lookedAtBlock();
		if (looked == null) {
			say("Look at a block, then mark the pit corner.");
			return;
		}
		say(marks.markCorner(looked));
		saveMarks();
	}

	private void markChest() {
		if (refuseMarksWhileRunning()) {
			return;
		}
		BlockPoint looked = lookedAtBlock();
		if (looked == null) {
			say("Look at a chest or barrel, then mark it.");
			return;
		}
		if (!bridge.isChest(looked)) {
			say("That block is not a chest or barrel.");
			return;
		}
		say(marks.markChest(looked));
		saveMarks();
	}

	private void clearMarks() {
		if (brain.isRunning()) {
			brain.stop(bridge, "AFK miner stopped.");
		}
		marks.clear();
		saveMarks();
		say("Pit corners and chest cleared.");
	}

	private boolean refuseMarksWhileRunning() {
		if (!brain.isRunning()) {
			return false;
		}
		say("Stop the miner before changing the pit or the chest.");
		return true;
	}

	private BlockPoint lookedAtBlock() {
		Minecraft client = Minecraft.getInstance();
		if (!(client.hitResult instanceof BlockHitResult hit) || hit.getType() == HitResult.Type.MISS) {
			return null;
		}
		BlockPos pos = hit.getBlockPos();
		return new BlockPoint(pos.getX(), pos.getY(), pos.getZ());
	}

	private void say(String message) {
		bridge.say(message);
	}

	private Path configFile() {
		return FabricLoader.getInstance().getConfigDir().resolve("afkminer.properties");
	}

	private void loadMarks() {
		Path file = configFile();
		if (!Files.exists(file)) {
			return;
		}
		Properties properties = new Properties();
		try (Reader reader = Files.newBufferedReader(file)) {
			properties.load(reader);
		} catch (IOException exception) {
			return;
		}
		marks.set(readPoint(properties, "cornerA"), readPoint(properties, "cornerB"), readPoint(properties, "chest"));
	}

	private void saveMarks() {
		Properties properties = new Properties();
		writePoint(properties, "cornerA", marks.cornerA());
		writePoint(properties, "cornerB", marks.cornerB());
		writePoint(properties, "chest", marks.chest());
		try {
			Files.createDirectories(configFile().getParent());
			try (Writer writer = Files.newBufferedWriter(configFile())) {
				properties.store(writer, "AFK miner marks. Not an account and not a password.");
			}
		} catch (IOException ignored) {
			say("Could not save the pit marks.");
		}
	}

	private static void writePoint(Properties properties, String key, BlockPoint point) {
		properties.setProperty(key, point == null ? "" : point.x() + "," + point.y() + "," + point.z());
	}

	private static BlockPoint readPoint(Properties properties, String key) {
		String value = properties.getProperty(key, "");
		if (value.isBlank()) {
			return null;
		}
		String[] parts = value.split(",");
		if (parts.length != 3) {
			return null;
		}
		try {
			return new BlockPoint(Integer.parseInt(parts[0].trim()), Integer.parseInt(parts[1].trim()), Integer.parseInt(parts[2].trim()));
		} catch (NumberFormatException exception) {
			return null;
		}
	}

	private final class Bridge implements MinerSensors, MinerControl, WorldView {
		@Override
		public boolean alive() {
			LocalPlayer player = player();
			return player != null && player.isAlive() && level() != null;
		}

		@Override
		public double x() {
			return player().getX();
		}

		@Override
		public double y() {
			return player().getY();
		}

		@Override
		public double z() {
			return player().getZ();
		}

		@Override
		public float health() {
			return player().getHealth();
		}

		@Override
		public int foodLevel() {
			return player().getFoodData().getFoodLevel();
		}

		@Override
		public boolean foreignScreenOpen() {
			Minecraft client = Minecraft.getInstance();
			LocalPlayer player = player();
			return client.screen != null && player.containerMenu == player.inventoryMenu;
		}

		@Override
		public boolean chestMenuOpen() {
			Minecraft client = Minecraft.getInstance();
			LocalPlayer player = player();
			return client.screen != null && player.containerMenu != player.inventoryMenu;
		}

		@Override
		public boolean breaking() {
			MultiPlayerGameMode gameMode = Minecraft.getInstance().gameMode;
			return gameMode != null && gameMode.isDestroying() && gameMode.getDestroyStage() >= 0;
		}

		@Override
		public boolean shouldMine(BlockPoint point) {
			if (marks.pit() == null || !marks.pit().contains(point) || point.equals(marks.chest())) {
				return false;
			}
			ClientLevel level = level();
			BlockPos pos = blockPos(point);
			BlockState state = level.getBlockState(pos);
			if (state.isAir()) {
				return false;
			}
			if (!state.getFluidState().isEmpty() && state.getCollisionShape(level, pos).isEmpty()) {
				return false;
			}
			return state.getDestroySpeed(level, pos) >= 0f;
		}

		@Override
		public boolean isChest(BlockPoint point) {
			ClientLevel level = level();
			if (level == null) {
				return false;
			}
			BlockState state = level.getBlockState(blockPos(point));
			return state.is(Blocks.CHEST) || state.is(Blocks.TRAPPED_CHEST) || state.is(Blocks.BARREL);
		}

		@Override
		public List<StackFacts> mainInventory() {
			Inventory inventory = player().getInventory();
			List<StackFacts> facts = new ArrayList<>();
			for (int slot = 0; slot < inventory.getContainerSize(); slot++) {
				if (slot == Inventory.SLOT_OFFHAND) {
					continue;
				}
				ItemStack stack = inventory.getItem(slot);
				facts.add(new StackFacts(stack.isEmpty(), isFood(stack), isTool(stack)));
			}
			return facts;
		}

		@Override
		public List<DepositSlot> openDepositSlots() {
			if (!chestMenuOpen()) {
				return List.of();
			}
			LocalPlayer player = player();
			List<DepositSlot> slots = new ArrayList<>();
			for (Slot slot : player.containerMenu.slots) {
				if (slot.container != player.getInventory()) {
					continue;
				}
				int inventoryIndex = slot.getContainerSlot();
				if (inventoryIndex == Inventory.SLOT_OFFHAND || inventoryIndex >= player.getInventory().getContainerSize()) {
					continue;
				}
				ItemStack stack = slot.getItem();
				String key = stack.isEmpty() ? "" : String.valueOf(BuiltInRegistries.ITEM.getKey(stack.getItem()));
				slots.add(new DepositSlot(slot.index, stack.isEmpty(), isFood(stack), isTool(stack), key, stack.getCount()));
			}
			return slots;
		}

		@Override
		public WorldView world() {
			return this;
		}

		@Override
		public boolean solid(BlockPoint point) {
			ClientLevel level = level();
			BlockPos pos = blockPos(point);
			return !level.getBlockState(pos).getCollisionShape(level, pos).isEmpty();
		}

		@Override
		public boolean lava(BlockPoint point) {
			return level().getBlockState(blockPos(point)).getFluidState().is(FluidTags.LAVA);
		}

		@Override
		public boolean water(BlockPoint point) {
			return level().getBlockState(blockPos(point)).getFluidState().is(FluidTags.WATER);
		}

		@Override
		public boolean passable(BlockPoint point) {
			return !solid(point) && !lava(point);
		}

		@Override
		public void walkToward(BlockPoint feet, boolean shouldJump, boolean shouldSneak) {
			lookBlock = feet;
			lookAtCenter = false;
			forward = true;
			jump = shouldJump;
			sneak = shouldSneak;
		}

		@Override
		public void lookAtBlock(BlockPoint block) {
			lookBlock = block;
			lookAtCenter = true;
		}

		@Override
		public void holdStill() {
			forward = false;
			jump = false;
			sneak = false;
		}

		@Override
		public void mine(BlockPoint block) {
			LocalPlayer player = player();
			MultiPlayerGameMode gameMode = Minecraft.getInstance().gameMode;
			BlockPos pos = blockPos(block);
			Direction face = faceToward(player, pos);
			gameMode.continueDestroyBlock(pos, face);
			player.swing(InteractionHand.MAIN_HAND);
		}

		@Override
		public void stopMining() {
			MultiPlayerGameMode gameMode = Minecraft.getInstance().gameMode;
			if (gameMode != null && gameMode.isDestroying()) {
				gameMode.stopDestroyBlock();
			}
		}

		@Override
		public void interact(BlockPoint block) {
			LocalPlayer player = player();
			BlockPos pos = blockPos(block);
			Direction face = faceToward(player, pos);
			Vec3 center = new Vec3(pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5);
			Minecraft.getInstance().gameMode.useItemOn(player, InteractionHand.MAIN_HAND, new BlockHitResult(center, face, pos, false));
		}

		@Override
		public void deposit(int menuIndex) {
			LocalPlayer player = player();
			Minecraft.getInstance().gameMode.handleContainerInput(
				player.containerMenu.containerId,
				menuIndex,
				0,
				ContainerInput.QUICK_MOVE,
				player
			);
		}

		@Override
		public void closeMenu() {
			LocalPlayer player = player();
			if (player != null && chestMenuOpen()) {
				player.closeContainer();
			}
		}

		@Override
		public void eat() {
			selectFood();
			Minecraft.getInstance().options.keyUse.setDown(true);
		}

		@Override
		public void stopEating() {
			Minecraft client = Minecraft.getInstance();
			client.options.keyUse.setDown(false);
			LocalPlayer player = player();
			if (player != null && player.isUsingItem() && client.gameMode != null) {
				client.gameMode.releaseUsingItem(player);
			}
		}

		@Override
		public void say(String message) {
			LocalPlayer player = player();
			if (player != null && message != null) {
				player.sendSystemMessage(Component.literal(message));
			}
		}

		private void selectFood() {
			LocalPlayer player = player();
			Inventory inventory = player.getInventory();
			int selected = inventory.getSelectedSlot();
			if (isFood(inventory.getSelectedItem())) {
				return;
			}
			int hotbar = -1;
			int stored = -1;
			for (int slot = 0; slot < inventory.getContainerSize(); slot++) {
				if (!isFood(inventory.getItem(slot))) {
					continue;
				}
				if (Inventory.isHotbarSlot(slot)) {
					hotbar = slot;
				} else {
					stored = slot;
				}
			}
			if (hotbar >= 0) {
				inventory.setSelectedSlot(hotbar);
				return;
			}
			if (stored < 0) {
				return;
			}
			int menuIndex = menuIndex(stored);
			if (menuIndex < 0) {
				return;
			}
			Minecraft.getInstance().gameMode.handleContainerInput(
				player.inventoryMenu.containerId,
				menuIndex,
				selected,
				ContainerInput.SWAP,
				player
			);
		}

		private int menuIndex(int inventoryIndex) {
			LocalPlayer player = player();
			for (Slot slot : player.inventoryMenu.slots) {
				if (slot.container == player.getInventory() && slot.getContainerSlot() == inventoryIndex) {
					return slot.index;
				}
			}
			return -1;
		}

		private LocalPlayer player() {
			return Minecraft.getInstance().player;
		}

		private ClientLevel level() {
			return Minecraft.getInstance().level;
		}
	}

	private static boolean isFood(ItemStack stack) {
		return !stack.isEmpty() && stack.has(DataComponents.FOOD);
	}

	private static boolean isTool(ItemStack stack) {
		return stack.is(ItemTags.PICKAXES)
			|| stack.is(ItemTags.AXES)
			|| stack.is(ItemTags.SHOVELS)
			|| stack.is(ItemTags.HOES)
			|| stack.is(ItemTags.SWORDS);
	}

	private static BlockPos blockPos(BlockPoint point) {
		return new BlockPos(point.x(), point.y(), point.z());
	}

	private static Direction faceToward(LocalPlayer player, BlockPos pos) {
		double dx = player.getX() - (pos.getX() + 0.5);
		double dy = player.getEyeY() - (pos.getY() + 0.5);
		double dz = player.getZ() - (pos.getZ() + 0.5);
		double ax = Math.abs(dx);
		double ay = Math.abs(dy);
		double az = Math.abs(dz);
		if (ax >= ay && ax >= az) {
			return dx > 0 ? Direction.EAST : Direction.WEST;
		}
		if (ay >= ax && ay >= az) {
			return dy > 0 ? Direction.UP : Direction.DOWN;
		}
		return dz > 0 ? Direction.SOUTH : Direction.NORTH;
	}
}
