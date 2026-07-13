import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { ChatRoom } from './entities/chat-room.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { CreateChatDto } from './dto/create-chat.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { User } from 'src/users/entities/user.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { Role } from 'src/common/enums/role.enum';

@Injectable()
export class ChatsService {
  constructor(
    @InjectRepository(ChatRoom)
    private readonly chatRoomRepository: Repository<ChatRoom>,
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepository: Repository<ChatMessage>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ClientProfile)
    private readonly clientProfileRepository: Repository<ClientProfile>,
  ) {}

  async createRoom(dto: CreateChatDto): Promise<ChatRoom> {
    const existing = await this.chatRoomRepository.findOne({
      where: { clientProfileId: dto.clientProfileId },
      relations: ['participants'],
    });
    if (existing) return existing;

    const clientProfile = await this.clientProfileRepository.findOne({
      where: { id: dto.clientProfileId },
      relations: ['user'],
    });
    if (!clientProfile) throw new NotFoundException('Profil client introuvable');

    const admins = await this.userRepository.find({
      where: { roles: Like(`%${Role.ADMIN}%`) as any, isActive: true },
    });

    const participants = [clientProfile.user, ...admins];

    if (dto.participantIds && dto.participantIds.length > 0) {
      const extraUsers = await this.userRepository.findBy({
        id: In(dto.participantIds),
      });
      for (const u of extraUsers) {
        if (!participants.find((p) => p.id === u.id)) {
          participants.push(u);
        }
      }
    }

    const room = this.chatRoomRepository.create({
      name: dto.name || null,
      client: clientProfile,
      clientProfileId: dto.clientProfileId,
      participants,
    });
    return this.chatRoomRepository.save(room);
  }

  async findUserRooms(userId: number): Promise<ChatRoom[]> {
    return this.chatRoomRepository
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.participants', 'participant')
      .leftJoinAndSelect('room.client', 'client')
      .leftJoinAndSelect('client.user', 'clientUser')
      .leftJoinAndSelect('room.messages', 'message')
      .leftJoinAndSelect('message.user', 'messageUser')
      .where('participant.id = :userId', { userId })
      .orderBy('room.updatedAt', 'DESC')
      .getMany();
  }

  async findRoomByClient(clientProfileId: number): Promise<ChatRoom | null> {
    return this.chatRoomRepository.findOne({
      where: { clientProfileId },
      relations: ['participants', 'client', 'client.user'],
    });
  }

  async findOne(id: number): Promise<ChatRoom> {
    const room = await this.chatRoomRepository.findOne({
      where: { id },
      relations: ['participants', 'client', 'client.user'],
    });
    if (!room) throw new NotFoundException(`ChatRoom #${id} introuvable`);
    return room;
  }

  async getMessages(
    roomId: number,
    userId: number,
    userRoles: string[],
    page = 1,
    limit = 50,
  ): Promise<{ data: ChatMessage[]; total: number }> {
    const room = await this.chatRoomRepository.findOne({
      where: { id: roomId },
      relations: ['participants', 'client', 'client.user'],
    });
    if (!room) throw new NotFoundException(`ChatRoom #${roomId} introuvable`);

    const isAdmin = userRoles.includes(Role.ADMIN);
    const isOwner = room.client.user.id === userId;
    const isParticipant = room.participants.some((p) => p.id === userId);

    if (!isAdmin && !isOwner && !isParticipant) {
      throw new ForbiddenException("Vous n'êtes pas membre de cette conversation");
    }

    const [data, total] = await this.chatMessageRepository.findAndCount({
      where: { room: { id: roomId } },
      relations: ['user'],
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async sendMessage(
    roomId: number,
    userId: number,
    dto: CreateMessageDto,
    userRoles: string[],
  ): Promise<ChatMessage> {
    const room = await this.chatRoomRepository.findOne({
      where: { id: roomId },
      relations: ['participants', 'client', 'client.user'],
    });
    if (!room) throw new NotFoundException(`ChatRoom #${roomId} introuvable`);

    const isAdmin = userRoles.includes(Role.ADMIN);
    const isOwner = room.client.user.id === userId;
    const isParticipant = room.participants.some((p) => p.id === userId);

    if (!isAdmin && !isOwner && !isParticipant) {
      throw new ForbiddenException("Vous n'êtes pas membre de cette conversation");
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const msg = this.chatMessageRepository.create({
      content: dto.content,
      senderType: dto.senderType,
      attachments: dto.attachments,
      user,
      room,
    });
    const saved = await this.chatMessageRepository.save(msg);
    await this.chatRoomRepository.update(room.id, { updatedAt: new Date() });
    return this.chatMessageRepository.findOne({
      where: { id: saved.id },
      relations: ['user', 'room'],
    });
  }

  async findAll(): Promise<ChatRoom[]> {
    return this.chatRoomRepository
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.participants', 'participant')
      .leftJoinAndSelect('room.client', 'client')
      .leftJoinAndSelect('client.user', 'clientUser')
      .leftJoinAndSelect('room.messages', 'message')
      .leftJoinAndSelect('message.user', 'messageUser')
      .orderBy('room.updatedAt', 'DESC')
      .getMany();
  }

  async removeRoom(id: number): Promise<void> {
    await this.chatRoomRepository.delete(id);
  }

  // 🔹 DELETE MULTIPLE
  async removeManyRooms(ids: number[]): Promise<{ deleted: number; notFound: number[] }> {
    const rooms = await this.chatRoomRepository.find({ where: { id: In(ids) } });
    const foundIds = rooms.map((r) => r.id);
    const notFound = ids.filter((id) => !foundIds.includes(id));
    if (rooms.length) await this.chatRoomRepository.remove(rooms);
    return { deleted: rooms.length, notFound };
  }
}