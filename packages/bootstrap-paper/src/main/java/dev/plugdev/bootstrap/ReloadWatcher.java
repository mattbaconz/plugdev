package dev.plugdev.bootstrap;

import org.bukkit.scheduler.BukkitRunnable;

import java.io.File;
import java.nio.file.Files;

/** Watches .reload-trigger in server root and applies safe reload. */
public final class ReloadWatcher {

    private final PlugDevBootstrap bootstrap;
    private BukkitRunnable task;
    private long lastTrigger = 0L;

    public ReloadWatcher(PlugDevBootstrap bootstrap) {
        this.bootstrap = bootstrap;
    }

    public void start() {
        if (bootstrap.isFoliaServer()) {
            bootstrap.getLogger().warning(
                    "[PlugDev] Folia detected — file-watch safe reload may be unsafe. "
                            + "Prefer full server restart (watch.reloadJava: restart) for Folia plugins.");
        }

        // Seed from any leftover stamp so a stale .reload-trigger is not treated as new.
        File existing = new File(bootstrap.getServer().getWorldContainer(), ".reload-trigger");
        if (existing.exists()) {
            try {
                lastTrigger = Long.parseLong(Files.readString(existing.toPath()).trim());
            } catch (Exception ignored) {
                lastTrigger = 0L;
            }
        }

        task = new BukkitRunnable() {
            @Override
            public void run() {
                File trigger = new File(bootstrap.getServer().getWorldContainer(), ".reload-trigger");
                if (!trigger.exists()) return;
                try {
                    String content = Files.readString(trigger.toPath()).trim();
                    long ts = Long.parseLong(content);
                    if (ts <= lastTrigger) return;
                    lastTrigger = ts;
                    bootstrap.getLogger().info("[PlugDev] Watch trigger detected — reloading…");
                    bootstrap.getReloader().reloadDevPlugins();
                    bootstrap.getLogger().info("[PlugDev] Auto-reloaded dev plugin from watch trigger");
                } catch (Exception e) {
                    bootstrap.getLogger().warning("[PlugDev] Watch reload failed: " + e.getMessage());
                    e.printStackTrace();
                }
            }
        };
        task.runTaskTimer(bootstrap, 20L, 10L);
    }

    public void stop() {
        if (task != null) {
            task.cancel();
        }
    }
}
