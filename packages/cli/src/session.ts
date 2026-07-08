import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export interface ServerSession {
  pid: number;
  gamePort: number;
  rconPort: number;
  rconPassword: string;
  rconHost: string;
  runDir: string;
  version: string;
  software: string;
  pluginName?: string;
  startedAt: string;
}

export function sessionPath(cwd: string): string {
  return join(cwd, ".plugdev", "session.json");
}

export function generateRconPassword(): string {
  return randomBytes(12).toString("base64url");
}

export async function readSession(cwd: string): Promise<ServerSession | null> {
  try {
    const raw = await readFile(sessionPath(cwd), "utf8");
    return JSON.parse(raw) as ServerSession;
  } catch {
    return null;
  }
}

export async function writeSession(cwd: string, session: ServerSession): Promise<void> {
  await mkdir(join(cwd, ".plugdev"), { recursive: true });
  await writeFile(sessionPath(cwd), JSON.stringify(session, null, 2) + "\n");
}

export async function clearSession(cwd: string): Promise<void> {
  try {
    await writeFile(sessionPath(cwd), "");
  } catch {
    // no session
  }
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
