package dev.plugdev.bootstrap;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Watches {@code .reload-trigger} in the server root and applies safe reload.
 * Polls off the main Server thread; only plugin reload runs sync.
 */
public final class ReloadWatcher {

    private static final long POLL_MS = 500L;

    private final PlugDevBootstrap bootstrap;
    private Path triggerPath;
    private ScheduledExecutorService executor;
    private ScheduledFuture<?> pollFuture;
    private long lastTrigger = 0L;
    private long lastMtimeMillis = Long.MIN_VALUE;
    private long lastSize = -1L;
    private final AtomicBoolean reloadPending = new AtomicBoolean(false);

    public ReloadWatcher(PlugDevBootstrap bootstrap) {
        this.bootstrap = bootstrap;
    }

    public void start() {
        if (bootstrap.isFoliaServer()) {
            bootstrap.getLogger().warning(
                    "[PlugDev] Folia detected — file-watch safe reload may be unsafe. "
                            + "Prefer full server restart (watch.reloadJava: restart) for Folia plugins.");
        }

        triggerPath = bootstrap.getServer().getWorldContainer().toPath().resolve(".reload-trigger");
        seedFromExistingTrigger();

        executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "plugdev-reload-watch");
            t.setDaemon(true);
            return t;
        });
        pollFuture = executor.scheduleWithFixedDelay(this::poll, POLL_MS, POLL_MS, TimeUnit.MILLISECONDS);
    }

    public void stop() {
        if (pollFuture != null) {
            pollFuture.cancel(false);
            pollFuture = null;
        }
        if (executor != null) {
            executor.shutdownNow();
            try {
                executor.awaitTermination(1, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            executor = null;
        }
    }

    private void seedFromExistingTrigger() {
        // Seed from any leftover stamp so a stale .reload-trigger is not treated as new.
        if (!Files.isRegularFile(triggerPath)) {
            return;
        }
        try {
            FileTime mtime = Files.getLastModifiedTime(triggerPath);
            lastMtimeMillis = mtime.toMillis();
            lastSize = Files.size(triggerPath);
            lastTrigger = Long.parseLong(Files.readString(triggerPath).trim());
        } catch (Exception ignored) {
            lastTrigger = 0L;
            lastMtimeMillis = Long.MIN_VALUE;
            lastSize = -1L;
        }
    }

    private void poll() {
        if (triggerPath == null || !Files.isRegularFile(triggerPath)) {
            return;
        }
        try {
            FileTime mtime = Files.getLastModifiedTime(triggerPath);
            long mtimeMillis = mtime.toMillis();
            long size = Files.size(triggerPath);
            if (mtimeMillis == lastMtimeMillis && size == lastSize) {
                return;
            }
            lastMtimeMillis = mtimeMillis;
            lastSize = size;

            String content = Files.readString(triggerPath).trim();
            long ts = Long.parseLong(content);
            if (ts <= lastTrigger) {
                return;
            }
            lastTrigger = ts;
            scheduleReload();
        } catch (Exception e) {
            bootstrap.getLogger().warning("[PlugDev] Watch poll failed: " + e.getMessage());
        }
    }

    private void scheduleReload() {
        if (!reloadPending.compareAndSet(false, true)) {
            return;
        }
        bootstrap.getServer().getScheduler().runTask(bootstrap, () -> {
            try {
                bootstrap.getLogger().info("[PlugDev] Watch trigger detected — reloading…");
                bootstrap.getReloader().reloadDevPlugins();
                bootstrap.getLogger().info("[PlugDev] Auto-reloaded dev plugin from watch trigger");
            } catch (Exception e) {
                bootstrap.getLogger().warning("[PlugDev] Watch reload failed: " + e.getMessage());
                e.printStackTrace();
            } finally {
                reloadPending.set(false);
            }
        });
    }
}
