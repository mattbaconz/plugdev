import net from "node:net";

export function isPortAvailable(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

/** Wait until a TCP port accepts connections (server is listening). */
export function waitForPortOpen(
  port: number,
  host = "127.0.0.1",
  timeoutMs = 120_000,
): Promise<boolean> {
  const start = Date.now();

  return new Promise((resolve) => {
    const tryConnect = () => {
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }

      const socket = net.connect({ port, host });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        setTimeout(tryConnect, 500);
      });
    };
    tryConnect();
  });
}
