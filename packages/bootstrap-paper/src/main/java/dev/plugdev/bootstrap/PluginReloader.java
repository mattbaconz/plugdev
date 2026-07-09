package dev.plugdev.bootstrap;

import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.logging.Level;

/**
 * Safe plugin reload with classloader cleanup.
 * Techniques derived from PlugMan / PaperMake (MIT) — dev servers only.
 */
public final class PluginReloader {

    private final PlugDevBootstrap bootstrap;

    public PluginReloader(PlugDevBootstrap bootstrap) {
        this.bootstrap = bootstrap;
    }

    public void reloadDevPlugins() throws Exception {
        List<String> paths = readReloadList();
        if (paths.isEmpty()) {
            throw new IllegalStateException("reload.list is empty or missing in server root");
        }

        int loaded = 0;
        for (String path : paths) {
            File file = new File(path);
            if (!file.isAbsolute()) {
                file = new File(bootstrap.getServer().getWorldContainer(), path);
            }
            if (!file.exists()) {
                bootstrap.getLogger().warning("[PlugDev] Missing JAR: " + file.getAbsolutePath());
                continue;
            }

            Plugin existing = findPluginToUnload(file);
            if (existing != null && !existing.getName().equals(bootstrap.getName())) {
                unload(existing);
            }

            Plugin plugin = Bukkit.getPluginManager().loadPlugin(file);
            if (plugin == null) {
                throw new IllegalStateException("loadPlugin returned null for " + file.getName());
            }
            plugin.onLoad();
            Bukkit.getPluginManager().enablePlugin(plugin);
            bootstrap.setDevPluginName(plugin.getName());
            loaded++;
            // Stable success marker for CLI confirmReload() / CI smoke
            bootstrap.getLogger().info("[PlugDev] Loaded dev plugin: " + plugin.getName());
        }

        if (loaded == 0) {
            throw new IllegalStateException("No JARs from reload.list could be loaded");
        }
        bootstrap.getLogger().info("[PlugDev] Reload complete (" + loaded + " plugin(s))");
    }

    /**
     * reload.list always lives in the server root (world container), next to .reload-trigger.
     */
    private List<String> readReloadList() throws IOException {
        File serverRoot = bootstrap.getServer().getWorldContainer();
        File reloadList = new File(serverRoot, "reload.list");
        if (!reloadList.exists()) {
            bootstrap.getLogger().warning("[PlugDev] reload.list not found at " + reloadList.getAbsolutePath());
            return List.of();
        }
        return Files.readAllLines(reloadList.toPath()).stream()
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    /**
     * Prefer the stored dev plugin name (stable across timestamped reload JARs),
     * then fall back to classloader jarFile reflection.
     */
    private Plugin findPluginToUnload(File jar) {
        String devName = bootstrap.getDevPluginName();
        if (devName != null && !devName.isEmpty()) {
            Plugin byName = Bukkit.getPluginManager().getPlugin(devName);
            if (byName != null && !byName.getName().equals(bootstrap.getName())) {
                return byName;
            }
        }

        String jarName = jar.getName();
        String baseName = stripTimestampSuffix(jarName);

        for (Plugin plugin : Bukkit.getPluginManager().getPlugins()) {
            if (plugin.getName().equals(bootstrap.getName())) continue;
            try {
                var field = plugin.getClass().getClassLoader().getClass().getDeclaredField("jarFile");
                field.setAccessible(true);
                Object jarFile = field.get(plugin.getClass().getClassLoader());
                if (jarFile == null) continue;
                String loaded = jarFile.toString();
                if (loaded.contains(jarName) || (baseName != null && loaded.contains(baseName))) {
                    return plugin;
                }
            } catch (Exception ignored) {
                // try next plugin
            }
        }
        return null;
    }

    /** FixturePlugin-1710000000.jar → FixturePlugin */
    private static String stripTimestampSuffix(String jarName) {
        String withoutExt = jarName.endsWith(".jar")
                ? jarName.substring(0, jarName.length() - 4)
                : jarName;
        int dash = withoutExt.lastIndexOf('-');
        if (dash <= 0) return withoutExt;
        String suffix = withoutExt.substring(dash + 1);
        if (suffix.matches("\\d{10,}")) {
            return withoutExt.substring(0, dash);
        }
        return withoutExt;
    }

    @SuppressWarnings("deprecation")
    private void unload(Plugin plugin) throws Exception {
        bootstrap.getLogger().info("[PlugDev] Unloading " + plugin.getName());
        Bukkit.getPluginManager().disablePlugin(plugin);

        try {
            var pluginManager = Bukkit.getPluginManager();
            var pluginsField = pluginManager.getClass().getDeclaredField("plugins");
            pluginsField.setAccessible(true);
            Plugin[] plugins = (Plugin[]) pluginsField.get(pluginManager);
            List<Plugin> list = new ArrayList<>();
            for (Plugin p : plugins) {
                if (!p.getName().equals(plugin.getName())) {
                    list.add(p);
                }
            }
            pluginsField.set(pluginManager, list.toArray(new Plugin[0]));
        } catch (Exception e) {
            bootstrap.getLogger().log(Level.WARNING, "[PlugDev] Partial registry cleanup", e);
        }

        try {
            var pluginManager = Bukkit.getPluginManager();
            var lookupNamesField = pluginManager.getClass().getDeclaredField("lookupNames");
            lookupNamesField.setAccessible(true);
            @SuppressWarnings("unchecked")
            var lookupNames = (java.util.Map<String, Plugin>) lookupNamesField.get(pluginManager);
            lookupNames.remove(plugin.getName());
            lookupNames.remove(plugin.getName().toLowerCase());
        } catch (Exception e) {
            bootstrap.getLogger().log(Level.FINE, "[PlugDev] lookupNames cleanup skipped", e);
        }

        ClassLoader cl = plugin.getClass().getClassLoader();
        if (cl instanceof java.net.URLClassLoader urlCl) {
            try {
                urlCl.close();
            } catch (IOException e) {
                bootstrap.getLogger().log(Level.WARNING, "[PlugDev] ClassLoader close", e);
            }
        }
        System.gc();
    }
}
