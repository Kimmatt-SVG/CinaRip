package dev.suess.afkminer.mixin;

import dev.suess.afkminer.client.AfkMinerRuntime;
import net.minecraft.client.player.LocalPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Applies the miner's walk and look just before the game samples the movement keys.
 * That sample still happens when the window is in the background, which is what lets
 * the same character keep mining while nobody is at the keyboard.
 */
@Mixin(LocalPlayer.class)
public abstract class LocalPlayerInputMixin {
	@Inject(method = "aiStep", at = @At("HEAD"))
	private void afkminer$applyInput(CallbackInfo callback) {
		AfkMinerRuntime.applyInput((LocalPlayer) (Object) this);
	}
}
