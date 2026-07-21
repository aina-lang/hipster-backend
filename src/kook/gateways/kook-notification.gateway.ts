import {
  WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/kook/notifications',
  cors: { origin: '*' },
})
export class KookNotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(KookNotificationGateway.name);
  private userSockets = new Map<number, Set<string>>();

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    this.logger.debug(`Client connecté: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.userSockets.forEach((sockets, userId) => {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        if (sockets.size === 0) this.userSockets.delete(userId);
      }
    });
    this.logger.debug(`Client déconnecté: ${client.id}`);
  }

  @SubscribeMessage('auth')
  handleAuth(client: Socket, userId: number) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);
    client.data.userId = userId;
    this.logger.debug(`Utilisateur ${userId} authentifié sur socket ${client.id}`);
  }

  sendNotification(userId: number, notification: any) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit('notification', notification);
      });
    }
  }
}
