import {
  WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  namespace: '/kook/notifications',
  cors: { origin: ['https://hipster-api.fr', 'https://hipster.marketing', 'http://localhost:8081'] },
})
export class KookNotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(KookNotificationGateway.name);
  private userSockets = new Map<number, Set<string>>();

  constructor(private readonly jwtService: JwtService) {}

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
  handleAuth(client: Socket, data: { token: string }) {
    try {
      const payload = this.jwtService.verify(data.token) as { sub: number; type: string };
      if (payload.type !== 'kook') {
        throw new UnauthorizedException('Token invalide');
      }
      const userId = payload.sub;
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      client.data.userId = userId;
      client.emit('auth_ok', { userId });
      this.logger.debug(`Utilisateur ${userId} authentifié sur socket ${client.id}`);
    } catch (e) {
      client.emit('auth_error', { message: 'Token invalide' });
      client.disconnect();
    }
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
