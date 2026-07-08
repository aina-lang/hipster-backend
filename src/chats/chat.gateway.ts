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
import { Logger } from '@nestjs/common';
import { ChatsService } from './chats.service';
import { CreateMessageDto } from './dto/create-message.dto';

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

  constructor(private readonly chatsService: ChatsService) {}

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
      const dto: CreateMessageDto = {
        content: data.content,
        senderType: data.senderType,
      };
      const message = await this.chatsService.sendMessage(
        data.roomId,
        data.userId,
        dto,
        [],
      );
      this.server.to(`chat:${data.roomId}`).emit('chat:newMessage', message);
      this.logger.log(
        `Message sent in room ${data.roomId} by user ${data.userId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`);
      client.emit('chat:error', { message: error.message });
    }
  }

  emitToUser(userId: number, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToRoom(roomId: number, event: string, data: any) {
    this.server.to(`chat:${roomId}`).emit(event, data);
  }
}