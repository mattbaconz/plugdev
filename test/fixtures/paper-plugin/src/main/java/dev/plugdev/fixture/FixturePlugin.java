package dev.plugdev.fixture;

import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.plugin.java.JavaPlugin;

public final class FixturePlugin extends JavaPlugin {

    @Override
    public void onEnable() {
        getLogger().info("FixturePlugin enabled for PlugDev smoke tests");
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (command.getName().equalsIgnoreCase("fixture")) {
            sender.sendMessage("FixturePlugin OK");
            return true;
        }
        return false;
    }
}
