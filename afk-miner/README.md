# AFK Miner

A Fabric client mod for **Minecraft Java Edition 26.3**. It mines a rectangle you mark, and when your inventory fills it walks your character to a chest you marked and empties the blocks into it. It eats when you get hungry, and it will not walk into lava or off a drop that would kill you.

This is not a second account and it does not use [Mineflayer](https://github.com/PrismarineJS/mineflayer). Mineflayer is only a reference for the kind of job (mine, deposit, stay alive). The mod runs inside the Minecraft window you already have open and drives the character you are already logged in as. It never asks for or stores your account password. Put it in your own client. The friend's server does not need the mod installed.

The game has to stay open and connected. On a multiplayer server the world keeps ticking when the window is in the background, so you can leave the keyboard. Press the toggle key when you come back and the miner lets go of the movement keys.

## Keys

Change these under Options, Controls, AFK Miner.

| Key | Action |
| --- | --- |
| `J` | Mark a pit corner. The first press sets corner A. The next sets corner B. A third press starts over. |
| `U` | Mark the chest or barrel you are looking at. |
| `K` | Start mining, or stop and take the keyboard back. |
| `H` | Clear the saved corners and chest. |

Marks are saved in `.minecraft/config/afkminer.properties`. That file is only coordinates.

## What it keeps

Food and tools (pickaxe, axe, shovel, hoe, sword) stay in your inventory. Other items are shift-clicked into the chest. Keep a pickaxe and ordinary food on you. Any food item may be eaten, so do not carry food you care about losing.

## Build

Install JDK 25, then from this directory:

```
./gradlew build
```

The jar is `build/libs/afkminer-1.0.0.jar`. Install Fabric Loader 0.20.1 for Minecraft 26.3, install Fabric API `0.165.0+26.3`, and put this jar in your `mods` folder. Launch the account you already use from the Minecraft launcher and join the server.

The planner (pit order, pathing, eating, chest trips) can be checked without the game:

```
javac --release 21 -d build/logic-test $(find src/main/java src/test/java -name '*.java')
java -cp build/logic-test dev.suess.afkminer.LogicTests
```

## Limits

It mines the solid blocks inside the marked box, top layer first, and skips air, liquids, and unbreakable blocks. It walks on cardinal steps and will stop rather than cross lava or a fatal fall. It does not fight mobs, and it does not try to look like a person to a server check.
