package dev.plugdev.bootstrap;

import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.logging.Level;

/**
 * Safe plugin reload with Paper manager cleanup.
 * Inspired by PlugManX (MIT) — for PlugDev hot-reload on local servers only.
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
            } else {
                bootstrap.getLogger().warning(
                        "[PlugDev] No existing plugin matched for unload before loading " + file.getName());
            }

            // Paper's loadPlugin already runs onLoad via the entrypoint handler
            Plugin plugin = Bukkit.getPluginManager().loadPlugin(file);
            if (plugin == null) {
                throw new IllegalStateException("loadPlugin returned null for " + file.getName());
            }
            Bukkit.getPluginManager().enablePlugin(plugin);
            bootstrap.setDevPluginName(plugin.getName());
            loaded++;
            bootstrap.getLogger().info("[PlugDev] Loaded dev plugin: " + plugin.getName());
        }

        if (loaded == 0) {
            throw new IllegalStateException("No JARs from reload.list could be loaded");
        }
        bootstrap.getLogger().info("[PlugDev] Reload complete (" + loaded + " plugin(s))");
    }

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

    private Plugin findPluginToUnload(File jar) {
        String stored = bootstrap.getDevPluginName();
        if (stored != null && !stored.isEmpty()) {
            Plugin byName = Bukkit.getPluginManager().getPlugin(stored);
            if (byName != null && !byName.getName().equals(bootstrap.getName())) {
                return byName;
            }
        }

        String fromMeta = readPluginNameFromJar(jar);
        if (fromMeta != null && !fromMeta.isEmpty()) {
            Plugin byMeta = Bukkit.getPluginManager().getPlugin(fromMeta);
            if (byMeta != null && !byMeta.getName().equals(bootstrap.getName())) {
                return byMeta;
            }
        }

        String jarName = jar.getName();
        String baseName = stripTimestampSuffix(jarName);

        for (Plugin plugin : Bukkit.getPluginManager().getPlugins()) {
            if (plugin.getName().equals(bootstrap.getName())) continue;
            try {
                ClassLoader cl = plugin.getClass().getClassLoader();
                if (cl == null) continue;
                for (String fieldName : List.of("jarFile", "file", "jar", "source")) {
                    try {
                        var field = cl.getClass().getDeclaredField(fieldName);
                        field.setAccessible(true);
                        Object value = field.get(cl);
                        if (value == null) continue;
                        String loaded = value.toString();
                        if (loaded.contains(jarName) || (baseName != null && loaded.contains(baseName))) {
                            return plugin;
                        }
                    } catch (NoSuchFieldException ignored) {
                        // try next
                    }
                }
            } catch (Exception ignored) {
                // try next plugin
            }
        }

        Plugin sole = null;
        for (Plugin plugin : Bukkit.getPluginManager().getPlugins()) {
            if (plugin.getName().equals(bootstrap.getName())) continue;
            if (sole != null) return null;
            sole = plugin;
        }
        return sole;
    }

    static String readPluginNameFromJar(File jar) {
        try (JarFile jarFile = new JarFile(jar)) {
            for (String entryName : List.of("plugin.yml", "paper-plugin.yml")) {
                JarEntry entry = jarFile.getJarEntry(entryName);
                if (entry == null) continue;
                try (InputStream in = jarFile.getInputStream(entry);
                     BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        String trimmed = line.trim();
                        if (trimmed.startsWith("name:")) {
                            String name = trimmed.substring("name:".length()).trim();
                            if ((name.startsWith("\"") && name.endsWith("\""))
                                    || (name.startsWith("'") && name.endsWith("'"))) {
                                name = name.substring(1, name.length() - 1);
                            }
                            if (!name.isEmpty()) return name;
                        }
                    }
                }
            }
        } catch (Exception ignored) {
            // fall through
        }
        return null;
    }

    private static String stripTimestampSuffix(String jarName) {
        String withoutExt = jarName.endsWith(".jar")
                ? jarName.substring(0, jarName.length() - 4)
                : jarName;
        int reloadIdx = withoutExt.lastIndexOf("-reload-");
        if (reloadIdx > 0) {
            String after = withoutExt.substring(reloadIdx + "-reload-".length());
            if (after.matches("\\d{10,}")) {
                withoutExt = withoutExt.substring(0, reloadIdx);
            }
        }
        int dash = withoutExt.lastIndexOf('-');
        if (dash <= 0) return withoutExt;
        String suffix = withoutExt.substring(dash + 1);
        if (suffix.matches("\\d{10,}")) {
            return withoutExt.substring(0, dash);
        }
        return withoutExt;
    }

    private void unload(Plugin plugin) throws Exception {
        bootstrap.getLogger().info("[PlugDev] Unloading " + plugin.getName());

        // Paper disablePlugin closes the classloader and unregisters schedulers/events
        Bukkit.getPluginManager().disablePlugin(plugin);

        Object instanceManager = resolvePaperInstanceManager();
        if (instanceManager != null) {
            removeFromPaperInstanceManager(plugin, instanceManager);
            removeFromDependencyTree(plugin, instanceManager);
        } else {
            removeFromLegacyPluginManager(plugin);
        }

        removeFromPaperProviderStorage(plugin);
        System.gc();
    }

    private Object resolvePaperInstanceManager() {
        try {
            Class<?> impl = Class.forName("io.papermc.paper.plugin.manager.PaperPluginManagerImpl");
            Object paperPm = impl.getMethod("getInstance").invoke(null);
            var field = paperPm.getClass().getDeclaredField("instanceManager");
            field.setAccessible(true);
            return field.get(paperPm);
        } catch (Throwable ignored) {
            // Not Paper, or API shape changed
        }

        try {
            Object pm = Bukkit.getPluginManager();
            var field = pm.getClass().getDeclaredField("instanceManager");
            field.setAccessible(true);
            return field.get(pm);
        } catch (Throwable ignored) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private void removeFromPaperInstanceManager(Plugin plugin, Object instanceManager) {
        try {
            var pluginsField = instanceManager.getClass().getDeclaredField("plugins");
            pluginsField.setAccessible(true);
            Object raw = pluginsField.get(instanceManager);
            if (raw instanceof List<?> list) {
                list.removeIf(p -> p instanceof Plugin pl && pl.getName().equalsIgnoreCase(plugin.getName()));
            }
        } catch (Exception e) {
            bootstrap.getLogger().log(Level.WARNING, "[PlugDev] Paper plugins list cleanup failed", e);
        }

        try {
            var lookupField = instanceManager.getClass().getDeclaredField("lookupNames");
            lookupField.setAccessible(true);
            Map<String, Plugin> lookup = (Map<String, Plugin>) lookupField.get(instanceManager);
            String key = plugin.getName().replace(' ', '_').toLowerCase();
            lookup.remove(key);
            lookup.remove(plugin.getName().toLowerCase());
            // also clear provided names that pointed at this plugin
            lookup.entrySet().removeIf(e -> e.getValue() != null && e.getValue().getName().equalsIgnoreCase(plugin.getName()));
        } catch (Exception e) {
            bootstrap.getLogger().log(Level.WARNING, "[PlugDev] Paper lookupNames cleanup failed", e);
        }
    }

    private void removeFromDependencyTree(Plugin plugin, Object instanceManager) {
        try {
            var treeField = instanceManager.getClass().getDeclaredField("dependencyTree");
            treeField.setAccessible(true);
            Object tree = treeField.get(instanceManager);
            if (tree == null) return;

            Object meta = plugin.getClass().getMethod("getPluginMeta").invoke(plugin);
            if (meta == null) {
                // Bukkit legacy: try PluginDescriptionFile via getDescription
                meta = plugin.getDescription();
            }

            for (String methodName : List.of("remove", "removePlugin", "removeMeta")) {
                try {
                    tree.getClass().getMethod(methodName, meta.getClass()).invoke(tree, meta);
                    return;
                } catch (NoSuchMethodException ignored) {
                    // try next
                }
            }

            // Fall back: remove graph node by name via getGraph if present
            try {
                Object graph = tree.getClass().getMethod("getGraph").invoke(tree);
                if (graph != null) {
                    for (MethodCandidate candidate : List.of(
                            new MethodCandidate("removeNode", Object.class),
                            new MethodCandidate("removeNode", String.class))) {
                        try {
                            var m = graph.getClass().getMethod(candidate.name, candidate.arg);
                            if (candidate.arg == String.class) {
                                m.invoke(graph, plugin.getName());
                            } else {
                                m.invoke(graph, meta);
                            }
                            return;
                        } catch (NoSuchMethodException ignored) {
                            // try next
                        }
                    }
                }
            } catch (Exception ignored) {
                // optional
            }
        } catch (Exception e) {
            bootstrap.getLogger().log(Level.FINE, "[PlugDev] dependencyTree cleanup skipped", e);
        }
    }

    private record MethodCandidate(String name, Class<?> arg) {}

    @SuppressWarnings("unchecked")
    private void removeFromPaperProviderStorage(Plugin plugin) {
        try {
            Class<?> entrypointClass = Class.forName("io.papermc.paper.plugin.entrypoint.Entrypoint");
            Object pluginEntrypoint = entrypointClass.getField("PLUGIN").get(null);

            Class<?> handlerClass = Class.forName("io.papermc.paper.plugin.entrypoint.LaunchEntryPointHandler");
            Object handler = handlerClass.getField("INSTANCE").get(null);
            Object storage = handlerClass.getMethod("get", entrypointClass).invoke(handler, pluginEntrypoint);
            if (storage == null) return;

            // SimpleProviderStorage.providers
            List<?> providers;
            try {
                var providersField = storage.getClass().getDeclaredField("providers");
                providersField.setAccessible(true);
                providers = (List<?>) providersField.get(storage);
            } catch (NoSuchFieldException e) {
                // try superclass
                var providersField = storage.getClass().getSuperclass().getDeclaredField("providers");
                providersField.setAccessible(true);
                providers = (List<?>) providersField.get(storage);
            }

            Iterator<?> it = providers.iterator();
            while (it.hasNext()) {
                Object provider = it.next();
                try {
                    Object meta = provider.getClass().getMethod("getMeta").invoke(provider);
                    Object name = meta.getClass().getMethod("getName").invoke(meta);
                    if (name != null && name.toString().equalsIgnoreCase(plugin.getName())) {
                        it.remove();
                    }
                } catch (Exception ignored) {
                    // skip provider
                }
            }
        } catch (Throwable e) {
            bootstrap.getLogger().log(Level.FINE, "[PlugDev] provider storage cleanup skipped", e);
        }
    }

    private void removeFromLegacyPluginManager(Plugin plugin) {
        try {
            Object pluginManager = Bukkit.getPluginManager();
            var pluginsField = pluginManager.getClass().getDeclaredField("plugins");
            pluginsField.setAccessible(true);
            Object raw = pluginsField.get(pluginManager);
            if (raw instanceof List<?> list) {
                list.removeIf(p -> p instanceof Plugin pl && pl.getName().equals(plugin.getName()));
            } else if (raw instanceof Plugin[] plugins) {
                List<Plugin> next = new ArrayList<>();
                for (Plugin p : plugins) {
                    if (!p.getName().equals(plugin.getName())) next.add(p);
                }
                pluginsField.set(pluginManager, next.toArray(new Plugin[0]));
            }

            var lookupNamesField = pluginManager.getClass().getDeclaredField("lookupNames");
            lookupNamesField.setAccessible(true);
            @SuppressWarnings("unchecked")
            var lookupNames = (Map<String, Plugin>) lookupNamesField.get(pluginManager);
            lookupNames.remove(plugin.getName());
            lookupNames.remove(plugin.getName().toLowerCase());
        } catch (Exception e) {
            bootstrap.getLogger().log(Level.WARNING, "[PlugDev] Legacy plugin manager cleanup failed", e);
        }
    }
}
