package dev.plugdev.bootstrap;

import org.bukkit.plugin.java.JavaPlugin;

public final class PlugDevBootstrap extends JavaPlugin {

    private ReloadWatcher reloadWatcher;
    private String devPluginName;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        devPluginName = getConfig().getString("dev-plugin-name", "");

        var reloadCommand = getCommand("plugdev");
        if (reloadCommand != null) {
            var executor = new PlugDevCommand(this);
            reloadCommand.setExecutor(executor);
            reloadCommand.setTabCompleter(executor);
        }

        reloadWatcher = new ReloadWatcher(this);
        reloadWatcher.start();

        getLogger().info("PlugDev bootstrap enabled");
    }

    @Override
    public void onDisable() {
        if (reloadWatcher != null) {
            reloadWatcher.stop();
        }
    }

    public String getDevPluginName() {
        return devPluginName;
    }

    public void setDevPluginName(String name) {
        this.devPluginName = name;
        getConfig().set("dev-plugin-name", name);
        saveConfig();
    }

    public PluginReloader getReloader() {
        return new PluginReloader(this);
    }
}
