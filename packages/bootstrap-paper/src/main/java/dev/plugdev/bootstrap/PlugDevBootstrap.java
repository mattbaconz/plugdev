package dev.plugdev.bootstrap;

import org.bukkit.plugin.java.JavaPlugin;

import java.io.BufferedReader;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

public final class PlugDevBootstrap extends JavaPlugin {

    private ReloadWatcher reloadWatcher;
    private String devPluginName;
    private PluginReloader reloader;
    private boolean autoOp = true;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        devPluginName = getConfig().getString("dev-plugin-name", "");
        reloader = new PluginReloader(this);
        autoOp = readAutoOpFromDevJson();

        var reloadCommand = getCommand("plugdev");
        if (reloadCommand != null) {
            var executor = new PlugDevCommand(this);
            reloadCommand.setExecutor(executor);
            reloadCommand.setTabCompleter(executor);
        }

        reloadWatcher = new ReloadWatcher(this);
        reloadWatcher.start();

        if (autoOp) {
            getServer().getPluginManager().registerEvents(new DevJoinListener(this), this);
            getLogger().info("[PlugDev] Auto-OP enabled for dev server");
        } else {
            getLogger().info("[PlugDev] Auto-OP disabled (dev.op: false)");
        }

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

    public boolean isAutoOp() {
        return autoOp;
    }

    /**
     * Read {@code plugdev-dev.json} written by the CLI into the server root.
     * Defaults to auto-OP on when the file is missing (matches schema default).
     */
    private boolean readAutoOpFromDevJson() {
        File file = new File(getServer().getWorldContainer(), "plugdev-dev.json");
        if (!file.isFile()) {
            return true;
        }
        try (BufferedReader reader = Files.newBufferedReader(file.toPath(), StandardCharsets.UTF_8)) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            String json = sb.toString();
            // Minimal parse: look for "op": false (case-insensitive around keys)
            int idx = json.toLowerCase().indexOf("\"op\"");
            if (idx < 0) return true;
            int colon = json.indexOf(':', idx);
            if (colon < 0) return true;
            String rest = json.substring(colon + 1).trim().toLowerCase();
            if (rest.startsWith("false")) return false;
            return true;
        } catch (Exception e) {
            getLogger().warning("[PlugDev] Could not read plugdev-dev.json — defaulting auto-OP on");
            return true;
        }
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
