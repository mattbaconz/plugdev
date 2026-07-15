package dev.plugdev.bootstrap;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

/**
 * Grants OP to every player who joins the PlugDev run server when auto-OP is enabled.
 * Works for offline DevPlayer and online Prism/Microsoft accounts alike.
 *
 * <p>PlayerJoinEvent already runs on the player's region thread on Folia, so
 * {@link Player#setOp(boolean)} is safe without extra scheduling.
 */
public final class DevJoinListener implements Listener {

    private final PlugDevBootstrap bootstrap;

    public DevJoinListener(PlugDevBootstrap bootstrap) {
        this.bootstrap = bootstrap;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        if (player.isOp()) return;
        player.setOp(true);
        bootstrap.getLogger().info("[PlugDev] Auto-OP granted to " + player.getName());
    }
}
