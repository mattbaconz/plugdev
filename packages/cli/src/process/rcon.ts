import { createConnection, type Socket } from "node:net";

const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_RESPONSE_VALUE = 0;

let nextRequestId = 1;

function encodePacket(id: number, type: number, body: string): Buffer {
  const bodyBuf = Buffer.from(body + "\0\0", "utf8");
  const length = 4 + 4 + bodyBuf.length;
  const packet = Buffer.alloc(4 + length);
  packet.writeInt32LE(length, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  bodyBuf.copy(packet, 12);
  return packet;
}

function readPacket(socket: Socket): Promise<{ id: number; type: number; body: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let expected = -1;

    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      if (expected < 0 && buf.length >= 4) {
        expected = buf.readInt32LE(0) + 4;
      }
      if (expected > 0 && buf.length >= expected) {
        socket.off("data", onData);
        const id = buf.readInt32LE(4);
        const type = buf.readInt32LE(8);
        const body = buf.subarray(12, expected - 2).toString("utf8");
        resolve({ id, type, body });
      }
    };

    socket.on("data", onData);
    socket.once("error", reject);
    socket.once("close", () => reject(new Error("RCON connection closed")));
  });
}

export async function sendRconCommand(
  host: string,
  port: number,
  password: string,
  command: string,
  timeoutMs = 10_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`RCON timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const finish = (err?: Error, result?: string) => {
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve(result ?? "");
    };

    socket.once("error", (e) => finish(e as Error));

    void (async () => {
      try {
        const authId = nextRequestId++;
        socket.write(encodePacket(authId, SERVERDATA_AUTH, password));
        const authResp = await readPacket(socket);
        if (authResp.id === -1) {
          finish(new Error("RCON authentication failed"));
          return;
        }

        const cmdId = nextRequestId++;
        socket.write(encodePacket(cmdId, SERVERDATA_EXECCOMMAND, command));
        let response = "";
        while (true) {
          const pkt = await readPacket(socket);
          if (pkt.type === SERVERDATA_RESPONSE_VALUE || pkt.type === SERVERDATA_AUTH_RESPONSE) {
            response += pkt.body;
            if (pkt.id === cmdId) break;
          }
        }
        finish(undefined, response.trim());
      } catch (e) {
        finish(e as Error);
      }
    })();
  });
}
