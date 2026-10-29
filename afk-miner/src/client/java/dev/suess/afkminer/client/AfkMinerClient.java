package dev.suess.afkminer.client;

import net.fabricmc.api.ClientModInitializer;

public final class AfkMinerClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		AfkMinerRuntime.get().register();
	}
}
