import { detectProject } from "../detect/project.js";
import {
  detectModules,
  defaultJarPatternForModule,
  defaultWatchPathsForModule,
  type ModuleCandidate,
} from "../detect/modules.js";
import { loadConfig } from "../config/loader.js";
import { writeModuleToYml } from "../deps/config-write.js";
import { heading, info, success, warn } from "../util/log.js";
import { isJsonMode, emitJson } from "../util/output.js";
import pc from "picocolors";

function kindBadge(m: ModuleCandidate): string {
  if (m.kind === "plugin") return m.foliaSupported ? "plugin+folia" : "plugin";
  return m.kind;
}

export async function runModuleList(cwd: string): Promise<number> {
  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);
  const modules =
    project.modules?.length
      ? project.modules
      : await detectModules(
          cwd,
          project.buildSystem === "maven" || project.buildSystem === "gradle"
            ? project.buildSystem
            : "none",
        );

  const active = config.build.module;

  if (isJsonMode()) {
    emitJson({
      ok: true,
      data: {
        buildSystem: project.buildSystem,
        activeModule: active,
        needsModuleSelection: project.needsModuleSelection === true,
        modules: modules.map((m) => ({
          ...m,
          active: m.id === active,
        })),
      },
    });
    return modules.length === 0 ? 1 : 0;
  }

  heading("PlugDev modules\n");
  if (modules.length === 0) {
    warn("No multi-module reactor detected (single-module project or unknown layout)");
    return 1;
  }

  info(`Build system: ${project.buildSystem}`);
  if (active) info(`Active: ${pc.bold(active)}`);
  else if (project.needsModuleSelection) {
    warn("No build.module set — pick one with: plugdev module use <name>");
  }

  for (const m of modules) {
    const mark = m.id === active ? "*" : " ";
    const name = m.pluginName ? ` · ${m.pluginName}` : "";
    const final = m.finalName ? ` · ${m.finalName}` : "";
    info(`${mark} ${m.id.padEnd(28)} [${kindBadge(m)}]${name}${final}`);
  }
  return 0;
}

export async function runModuleUse(cwd: string, name: string): Promise<number> {
  const project = await detectProject(cwd);
  const modules =
    project.modules?.length
      ? project.modules
      : await detectModules(
          cwd,
          project.buildSystem === "maven" || project.buildSystem === "gradle"
            ? project.buildSystem
            : "none",
        );

  const id = name.replace(/^:/, "").replace(/\\/g, "/").replace(/\/$/, "");
  const match =
    modules.find((m) => m.id === id) ||
    modules.find((m) => m.id.toLowerCase() === id.toLowerCase()) ||
    modules.find((m) => m.pluginName?.toLowerCase() === id.toLowerCase());

  if (!match) {
    if (isJsonMode()) {
      emitJson({
        ok: false,
        error: `Unknown module "${name}"`,
        data: { modules: modules.map((m) => m.id) },
      });
      return 1;
    }
    warn(`Unknown module "${name}"`);
    if (modules.length) info(`Available: ${modules.map((m) => m.id).join(", ")}`);
    return 1;
  }

  const system =
    match.buildSystem === "gradle"
      ? "gradle"
      : project.buildSystem === "gradle"
        ? "gradle"
        : "maven";
  const jarPattern = defaultJarPatternForModule(
    match.id,
    system,
    match.finalName,
  );
  const watchPaths = defaultWatchPathsForModule(modules, match.id);

  const result = await writeModuleToYml(cwd, {
    module: match.id,
    system,
    jarPattern,
    watchPaths,
  });

  if (!result.ok) {
    if (isJsonMode()) {
      emitJson({ ok: false, error: result.reason });
      return 1;
    }
    warn(result.reason);
    return 1;
  }

  if (isJsonMode()) {
    emitJson({
      ok: true,
      data: {
        module: match.id,
        jarPattern,
        watchPaths,
        kind: match.kind,
        path: result.path,
      },
    });
    return 0;
  }

  success(`Active module: ${match.id}`);
  info(`jarPattern: ${jarPattern}`);
  info(`watch.paths: ${watchPaths.join(", ")}`);
  if (match.kind === "library") {
    warn("Selected module looks like a library (no plugin.yml) — prefer a plugin-kind module");
  }
  return 0;
}
