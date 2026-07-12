import { access, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import { plugdevHome } from "../paths.js";
import { info, warn, success } from "../util/log.js";

export { loadDotEnv, resolveBotTokenEnv } from "../util/dotenv.js";

const HELPER_SOURCE = `import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import java.nio.file.*;
import java.util.*;

public class HotSwapRedefine {
  public static void main(String[] args) throws Exception {
    if (args.length < 3) {
      System.err.println("usage: HotSwapRedefine <host> <port> <classFile>...");
      System.exit(1);
    }
    String host = args[0];
    String port = args[1];
    Map<ReferenceType, byte[]> map = new HashMap<>();
    VirtualMachineManager vmm = Bootstrap.virtualMachineManager();
    AttachingConnector connector = null;
    for (AttachingConnector c : vmm.attachingConnectors()) {
      if (c.transport().name().equals("dt_socket")) {
        connector = c;
        break;
      }
    }
    if (connector == null) {
      System.err.println("No dt_socket attaching connector");
      System.exit(2);
    }
    Map<String, Connector.Argument> arguments = connector.defaultArguments();
    arguments.get("hostname").setValue(host);
    arguments.get("port").setValue(port);
    arguments.get("timeout").setValue("5000");
    VirtualMachine vm = connector.attach(arguments);
    try {
      for (int i = 2; i < args.length; i++) {
        Path path = Paths.get(args[i]);
        byte[] bytes = Files.readAllBytes(path);
        String className = guessClassName(path);
        if (className == null) continue;
        List<ReferenceType> types = vm.classesByName(className);
        if (types.isEmpty()) {
          System.err.println("Class not loaded: " + className);
          System.exit(2);
        }
        for (ReferenceType t : types) {
          map.put(t, bytes);
        }
      }
      if (map.isEmpty()) {
        System.err.println("No classes to redefine");
        System.exit(2);
      }
      vm.redefineClasses(map);
      System.out.println("Redefined " + map.size() + " class(es)");
    } finally {
      vm.dispose();
    }
  }

  static String guessClassName(Path path) {
    String s = path.toAbsolutePath().toString().replace((char) 92, '/');
    String[] markers = new String[] {
      "/classes/java/main/",
      "/target/classes/",
      "/classes/"
    };
    for (String marker : markers) {
      int idx = s.lastIndexOf(marker);
      if (idx >= 0) {
        String rel = s.substring(idx + marker.length());
        if (rel.endsWith(".class")) rel = rel.substring(0, rel.length() - 6);
        return rel.replace('/', '.');
      }
    }
    String file = path.getFileName().toString();
    if (!file.endsWith(".class")) return null;
    return file.substring(0, file.length() - 6);
  }
}
`;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function toolsDir(): string {
  return join(plugdevHome(), "tools", "hotswap");
}

async function ensureHelper(): Promise<string> {
  const dir = toolsDir();
  await mkdir(dir, { recursive: true });
  const srcPath = join(dir, "HotSwapRedefine.java");
  const classPath = join(dir, "HotSwapRedefine.class");
  await writeFile(srcPath, HELPER_SOURCE);

  if (!(await exists(classPath))) {
    info("Compiling hotswap helper (once)...");
    const { getResolvedJava, javaToolPath, javaChildEnv, resolveJava } =
      await import("../util/tools.js");
    const java = getResolvedJava() ?? (await resolveJava(0));
    const javac = javaToolPath(java, "javac");
    const env = javaChildEnv(java);
    const r = await execa(javac, ["--release", "21", "HotSwapRedefine.java"], {
      cwd: dir,
      stdio: "pipe",
      reject: false,
      env,
    });
    if (r.exitCode !== 0) {
      const r2 = await execa(javac, ["HotSwapRedefine.java"], {
        cwd: dir,
        stdio: "pipe",
        reject: false,
        env,
      });
      if (r2.exitCode !== 0) {
        throw new Error(
          `javac failed for HotSwapRedefine: ${r2.stderr || r.stderr}`,
        );
      }
    }
  }
  return dir;
}

async function collectClassFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith(".class") && !e.name.includes("$")) out.push(p);
    }
  }
  await walk(root);
  return out;
}

/** Find compiled class output dirs for Gradle/Maven projects. */
export async function findClassesDirs(cwd: string): Promise<string[]> {
  const candidates = [
    join(cwd, "build", "classes", "java", "main"),
    join(cwd, "build", "classes", "kotlin", "main"),
    join(cwd, "target", "classes"),
  ];
  const found: string[] = [];
  for (const c of candidates) {
    if (await exists(c)) found.push(c);
  }
  return found;
}

export interface HotswapResult {
  ok: boolean;
  redefined?: number;
  reason?: string;
}

/**
 * Attempt JDWP RedefineClasses for compiled class files.
 * Requires the target JVM listening on debugPort (JDWP).
 */
export async function attemptHotswap(opts: {
  cwd: string;
  debugPort: number;
  classFiles?: string[];
}): Promise<HotswapResult> {
  const port = opts.debugPort > 0 ? opts.debugPort : 5005;
  let files = opts.classFiles;
  if (!files?.length) {
    const dirs = await findClassesDirs(opts.cwd);
    files = [];
    for (const d of dirs) {
      files.push(...(await collectClassFiles(d)));
    }
  }
  if (!files.length) {
    return {
      ok: false,
      reason: "No compiled .class files found (run classes/compile first)",
    };
  }

  const now = Date.now();
  const recent: string[] = [];
  for (const f of files) {
    try {
      const st = await stat(f);
      if (now - st.mtimeMs < 120_000) recent.push(f);
    } catch {
      // skip
    }
  }
  const targets = recent.length > 0 ? recent : files.slice(0, 40);
  if (targets.length > 80) {
    return {
      ok: false,
      reason: "Too many class files changed — falling back to safe reload",
    };
  }

  let helperDir: string;
  try {
    helperDir = await ensureHelper();
  } catch (e) {
    return {
      ok: false,
      reason: `Hotswap helper unavailable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const args = [
    "-cp",
    helperDir,
    "HotSwapRedefine",
    "127.0.0.1",
    String(port),
    ...targets,
  ];
  const { getResolvedJava, javaToolPath, javaChildEnv, resolveJava } =
    await import("../util/tools.js");
  const java = getResolvedJava() ?? (await resolveJava(0));
  const result = await execa(javaToolPath(java, "java"), args, {
    cwd: opts.cwd,
    reject: false,
    stdio: "pipe",
    env: javaChildEnv(java),
  });

  if (result.exitCode === 0) {
    success(`Hotswap OK (${targets.length} class file(s))`);
    return { ok: true, redefined: targets.length };
  }

  const err = (result.stderr || result.stdout || "").trim();
  warn(`Hotswap failed — ${err.split("\n")[0] || "redefine rejected"}`);
  return { ok: false, reason: err || "redefine failed" };
}

