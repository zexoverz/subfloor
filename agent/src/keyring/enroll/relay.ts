import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { ENROLLMENT_PATH } from "./protocol.ts";

/**
 * The relay.
 *
 * Ledger runs one of these for Ledger Sync at `<api>/v1/qr`; the enrollment
 * handshake needs a rendezvous point because neither end can be sure of
 * reaching the other directly. This is that rendezvous and nothing more: it
 * pairs two sockets that arrive with the same `?host=` value and copies bytes
 * between them. It cannot read the traffic — the payloads are encrypted under a
 * key derived from the two ends' ephemeral keys, and the relay holds neither —
 * and it cannot join the ring, because ring membership is a signed block and the
 * relay signs nothing.
 *
 * Which is the point of running our own: a hostile relay can drop the
 * enrollment or stall it, and can do nothing else. Run it wherever is
 * convenient, including on the agent host itself.
 */
export type Relay = {
  url: string;
  port: number;
  close(): Promise<void>;
};

export async function startRelay(port = 0, host = "127.0.0.1"): Promise<Relay> {
  const http: Server = createServer((_req, res) => {
    res.writeHead(426, { "content-type": "text/plain" });
    res.end("enrollment relay: websocket only\n");
  });
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new Map<string, WebSocket[]>();

  wss.on("connection", (socket: WebSocket, room: string) => {
    const peers = rooms.get(room) ?? [];
    if (peers.length >= 2) {
      socket.close(1013, "room full");
      return;
    }
    peers.push(socket);
    rooms.set(room, peers);

    socket.on("message", (data: unknown) => {
      for (const peer of rooms.get(room) ?? []) {
        if (peer !== socket && peer.readyState === peer.OPEN) {
          peer.send(data as Buffer);
        }
      }
    });

    const drop = () => {
      const remaining = (rooms.get(room) ?? []).filter((p) => p !== socket);
      if (remaining.length === 0) rooms.delete(room);
      else rooms.set(room, remaining);
      // A half-open enrollment is a dead enrollment. Close the peer too so the
      // waiting side gets an error instead of hanging on a socket nobody will
      // ever answer.
      for (const peer of remaining) {
        if (peer.readyState === peer.OPEN) peer.close(1001, "peer left");
      }
    };
    socket.on("close", drop);
    socket.on("error", drop);
  });

  http.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "ws://relay");
    const room = url.searchParams.get("host");
    if (url.pathname !== ENROLLMENT_PATH || !room || !/^[0-9a-fA-F]{66}$/.test(room)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, room));
  });

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(port, host, resolve);
  });
  const address = http.address() as AddressInfo;

  return {
    url: `ws://${host}:${address.port}`,
    port: address.port,
    async close() {
      for (const peers of rooms.values()) for (const p of peers) p.terminate();
      rooms.clear();
      wss.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
