package dev.plugdev.bootstrap;

import org.bukkit.ChatColor;
import org.bukkit.GameMode;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

public final class PlugDevCommand implements CommandExecutor, TabCompleter {

    private final PlugDevBootstrap bootstrap;

    public PlugDevCommand(PlugDevBootstrap bootstrap) {
        this.bootstrap = bootstrap;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            sender.sendMessage(ChatColor.AQUA + "PlugDev: /plugdev reload | info | tp | give");
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "reload" -> {
                if (bootstrap.isFoliaServer()) {
                    sender.sendMessage(ChatColor.YELLOW
                            + "[PlugDev] Folia: safe reload may be unsafe. Prefer restarting the server.");
                }
                bootstrap.getServer().getScheduler().runTask(bootstrap, () -> {
                    try {
                        bootstrap.getReloader().reloadDevPlugins();
                        sender.sendMessage(ChatColor.GREEN + "[PlugDev] Dev plugin(s) reloaded.");
                    } catch (Exception e) {
                        sender.sendMessage(ChatColor.RED + "[PlugDev] Reload failed: " + e.getMessage());
                        bootstrap.getLogger().severe("[PlugDev] Reload failed");
                        e.printStackTrace();
                    }
                });
                return true;
            }
            case "info" -> {
                sender.sendMessage(ChatColor.AQUA + "PlugDev bootstrap " + bootstrap.getDescription().getVersion());
                sender.sendMessage(ChatColor.GRAY + "Dev plugin: " + bootstrap.getDevPluginName());
                if (bootstrap.isFoliaServer()) {
                    sender.sendMessage(ChatColor.YELLOW + "Server: Folia (prefer restart over reload)");
                }
                return true;
            }
            case "tp" -> {
                if (!(sender instanceof Player player)) {
                    sender.sendMessage("Players only");
                    return true;
                }
                var spawn = player.getWorld().getSpawnLocation();
                player.teleport(spawn);
                player.sendMessage(ChatColor.GREEN + "Teleported to spawn.");
                return true;
            }
            case "give" -> {
                if (!(sender instanceof Player player)) {
                    sender.sendMessage("Players only");
                    return true;
                }
                player.getInventory().addItem(
                        new org.bukkit.inventory.ItemStack(Material.DIAMOND_PICKAXE),
                        new org.bukkit.inventory.ItemStack(Material.COBBLESTONE, 64),
                        new org.bukkit.inventory.ItemStack(Material.BREAD, 16)
                );
                player.setGameMode(GameMode.CREATIVE);
                player.sendMessage(ChatColor.GREEN + "Dev kit given.");
                return true;
            }
            default -> {
                sender.sendMessage(ChatColor.RED + "Unknown subcommand.");
                return true;
            }
        }
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return Arrays.asList("reload", "info", "tp", "give").stream()
                    .filter(s -> s.startsWith(args[0].toLowerCase()))
                    .collect(Collectors.toList());
        }
        return new ArrayList<>();
    }
}
