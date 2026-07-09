package dev.plugdev.bootstrap;

import org.bukkit.plugin.java.JavaPlugin;

public final class PlugDevBootstrap extends JavaPlugin {

    private ReloadWatcher reloadWatcher;
    private String devPluginName;
    private PluginReloader reloader;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        devPluginName = getConfig().getString("dev-plugin-name", "");
        reloader = new PluginReloader(this);

        var reloadCommand = getCommand("plugdev");
        if (reloadCommand != null) {
            var executor = new PlugDevCommand(this);
            reloadCommand.setExecutor(executor);
            reloadCommand.setTabCompleter(executor);
        }

        reloadWatcher = new ReloadWatcher(this);
        reloadWatcher.start();

        getLogger().info("[PlugDev] bootstrap enabled");
        if (isFoliaServer()) {
            getLogger().warning(
                    "[PlugDev] Running on Folia — /plugdev reload uses the global scheduler and may be unsafe. "
                            + "Prefer restarting the dev server after code changes.");
        }
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
        return reloader;
    }

    /** Best-effort Folia detection without a hard Folia API dependency. */
    public boolean isFoliaServer() {
        try {
            Class.forName("io.papermc.paper.threadedregions.RegionizedServer");
            return true;
        } catch (ClassNotFoundException e) {
            return false;
        }
    }
}
