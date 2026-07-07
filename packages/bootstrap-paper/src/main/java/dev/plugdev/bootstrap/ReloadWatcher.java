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
                    bootstrap.getReloader().reloadDevPlugins();
                    bootstrap.getLogger().info("Auto-reloaded dev plugin from watch trigger");
                } catch (Exception e) {
                    bootstrap.getLogger().warning("Watch reload failed: " + e.getMessage());
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
