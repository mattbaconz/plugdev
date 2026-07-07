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
            throw new IllegalStateException("reload.list is empty");
        }

        for (String path : paths) {
            File file = new File(path);
            if (!file.exists()) {
                bootstrap.getLogger().warning("Missing JAR: " + path);
                continue;
            }

            Plugin existing = findPluginByJar(file);
            if (existing != null && !existing.getName().equals(bootstrap.getName())) {
                unload(existing);
            }

            Plugin loaded = Bukkit.getPluginManager().loadPlugin(file);
            if (loaded == null) {
                throw new IllegalStateException("loadPlugin returned null for " + file.getName());
            }
            loaded.onLoad();
            Bukkit.getPluginManager().enablePlugin(loaded);
            bootstrap.setDevPluginName(loaded.getName());
            bootstrap.getLogger().info("Loaded dev plugin: " + loaded.getName());
        }
    }

    private List<String> readReloadList() throws IOException {
        File list = new File(bootstrap.getDataFolder().getParentFile().getParentFile(), "reload.list");
        if (!list.exists()) {
            list = new File(bootstrap.getServer().getWorldContainer(), "reload.list");
        }
        // reload.list lives in server root (parent of plugins/)
        File serverRoot = bootstrap.getServer().getWorldContainer();
        File reloadList = new File(serverRoot, "reload.list");
        if (!reloadList.exists()) {
            return List.of();
        }
        return Files.readAllLines(reloadList.toPath()).stream()
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    private Plugin findPluginByJar(File jar) {
        for (Plugin plugin : Bukkit.getPluginManager().getPlugins()) {
            if (plugin.getName().equals(bootstrap.getName())) continue;
            try {
                var field = plugin.getClass().getClassLoader().getClass().getDeclaredField("jarFile");
                field.setAccessible(true);
                Object jarFile = field.get(plugin.getClass().getClassLoader());
                if (jarFile != null && jarFile.toString().contains(jar.getName())) {
                    return plugin;
                }
            } catch (Exception ignored) {
                // fallback: match by dev plugin name
            }
        }
        String devName = bootstrap.getDevPluginName();
        if (devName != null && !devName.isEmpty()) {
            return Bukkit.getPluginManager().getPlugin(devName);
        }
        return null;
    }

    @SuppressWarnings("deprecation")
    private void unload(Plugin plugin) throws Exception {
        bootstrap.getLogger().info("Unloading " + plugin.getName());
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
            bootstrap.getLogger().log(Level.WARNING, "Partial registry cleanup", e);
        }

        ClassLoader cl = plugin.getClass().getClassLoader();
        if (cl instanceof java.net.URLClassLoader urlCl) {
            try {
                urlCl.close();
            } catch (IOException e) {
                bootstrap.getLogger().log(Level.WARNING, "ClassLoader close", e);
            }
        }
        System.gc();
    }
}
