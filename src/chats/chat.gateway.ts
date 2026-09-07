import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, NotFoundException } from '@nestjs/common';
import { ChatsService } from './chats.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://www.hipster-ia.fr',
      'https://hipster-api.fr',
    ],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private userSockets = new Map<number, string[]>();

  constructor(
    private readonly chatsService: ChatsService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  handleConnection(@ConnectedSocket() client: Socket) {
    this.logger.log(`Chat client connected: ${client.id}`);
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`Chat client disconnected: ${client.id}`);
    for (const [userId, socketIds] of this.userSockets.entries()) {
      const index = socketIds.indexOf(client.id);
      if (index > -1) {
        socketIds.splice(index, 1);
        if (socketIds.length === 0) {
          this.userSockets.delete(userId);
        }
        break;
      }
    }
  }

  @SubscribeMessage('chat:register')
  handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: number },
  ) {
    const { userId } = data;
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, []);
    }
    const sockets = this.userSockets.get(userId);
    if (sockets && !sockets.includes(client.id)) {
      sockets.push(client.id);
    }
    client.join(`user:${userId}`);
    this.logger.log(`Chat user ${userId} registered with socket ${client.id}`);
    return { success: true };
  }

  @SubscribeMessage('chat:join')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: number },
  ) {
    client.join(`chat:${data.roomId}`);
    this.logger.log(`Socket ${client.id} joined chat:${data.roomId}`);
    return { success: true };
  }

  @SubscribeMessage('chat:leave')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: number },
  ) {
    client.leave(`chat:${data.roomId}`);
    return { success: true };
  }

  /**
   * ✍️ Indicateur de saisie. Diffusé aux autres membres de la conversation
   * uniquement — `client.to()` exclut l'émetteur. Rien n'est persisté :
   * c'est un signal éphémère.
   */
  @SubscribeMessage('chat:typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: number;
      userId: number;
      userName?: string;
      isTyping: boolean;
    },
  ) {
    client.to(`chat:${data.roomId}`).emit('chat:typing', {
      roomId: data.roomId,
      userId: data.userId,
      userName: data.userName,
      isTyping: !!data.isTyping,
    });
    return { success: true };
  }

  @SubscribeMessage('chat:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      roomId: number;
      userId: number;
      content: string;
      senderType: 'client' | 'employee';
    },
  ) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: data.userId },
      });
      if (!user) throw new NotFoundException('Utilisateur introuvable');
      const message = await this.chatsService.sendMessage(
        data.roomId,
        data.userId,
        { content: data.content, senderType: data.senderType },
        user.roles || [],
      );
      this.server.to(`chat:${data.roomId}`).emit('chat:newMessage', message);
      // Le message n'atteint que les sockets ayant rejoint cette room. Pour que
      // la liste des conversations se mette à jour chez tout le monde, on
      // prévient aussi chaque participant sur son canal personnel.
      await this.notifyRoomUpdated(data.roomId, message);
      this.logger.log(
        `Message sent in room ${data.roomId} by user ${data.userId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`);
      client.emit('chat:error', { message: error.message });
    }
  }

  /**
   * Prévient chaque membre de la conversation qu'elle a bougé, sur son canal
   * `user:<id>` : la liste se réordonne sans rechargement, même si la
   * conversation concernée n'est pas ouverte.
   */
  private async notifyRoomUpdated(roomId: number, message: any) {
    try {
      const room = await this.chatsService.findOne(roomId);
      const recipients = [
        ...(room?.participants || []),
        ...(room?.client?.user ? [room.client.user] : []),
      ];
      const seen = new Set<number>();
      for (const recipient of recipients) {
        if (!recipient || seen.has(recipient.id)) continue;
        seen.add(recipient.id);
        this.server.to(`user:${recipient.id}`).emit('chat:roomUpdated', {
          roomId,
          message,
        });
      }
    } catch (error) {
      this.logger.error(`notifyRoomUpdated a échoué: ${error.message}`);
    }
  }

  emitToUser(userId: number, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToRoom(roomId: number, event: string, data: any) {
    this.server.to(`chat:${roomId}`).emit(event, data);
  }
}