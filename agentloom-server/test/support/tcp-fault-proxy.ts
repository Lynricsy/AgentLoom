import { once } from 'node:events';
import net from 'node:net';

/**
 * 可中断的 TCP 转发代理，用于故障注入：`down()` 断开全部连接并停止监听（新连接 ECONNREFUSED，
 * 与 `docker stop` 依赖容器的效果一致），`up()` 在同一端口恢复转发。
 * 只影响经代理建立的连接，不需要真的停掉共享的 Redis。
 */
export interface TcpFaultProxy {
  port: number;
  down: () => Promise<void>;
  up: () => Promise<void>;
  close: () => Promise<void>;
}

export async function startTcpFaultProxy(
  targetHost: string,
  targetPort: number,
): Promise<TcpFaultProxy> {
  const sockets = new Set<net.Socket>();
  const track = (socket: net.Socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  };

  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, targetHost);
    track(client);
    track(upstream);
    client.pipe(upstream).pipe(client);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as net.AddressInfo;

  const down = async () => {
    const closed = new Promise<void>((resolve) =>
      server.close(() => resolve()),
    );
    for (const socket of sockets) {
      socket.destroy();
    }
    await closed;
  };

  return {
    port,
    down,
    up: async () => {
      server.listen(port, '127.0.0.1');
      await once(server, 'listening');
    },
    close: async () => {
      if (server.listening) {
        await down();
      }
    },
  };
}
