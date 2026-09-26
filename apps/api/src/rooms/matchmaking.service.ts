import { Injectable } from '@nestjs/common';
import { MAX_ROOM_PLAYERS, type PlayerId } from '@rmc/shared-types';
import { RoomError, RoomsService } from './rooms.service';

interface Queued {
  playerId: PlayerId;
  name: string;
}

export interface MatchResult {
  /** Match ban gaya to us room ka code (game shuru ho chuka hota hai), warna null. */
  code: string | null;
  /** Ab bhi queue me wait karne wale players. */
  waiting: PlayerId[];
}

/**
 * Quick match: pehle aao pehle paao. Jaise hi 4 players hote hain, room ban jata hai
 * aur game turant shuru hota hai (pehla player host).
 * Abhi in-memory; multiple servers par Redis me jayega.
 */
@Injectable()
export class MatchmakingService {
  private queue: Queued[] = [];

  constructor(private readonly rooms: RoomsService) {}

  join(playerId: PlayerId, name: string): MatchResult {
    if (this.queue.some((q) => q.playerId === playerId)) {
      throw new RoomError('ALREADY_QUEUED', 'Aap pehle se queue me ho.');
    }
    if (this.rooms.getRoomCodeOf(playerId)) {
      throw new RoomError('ALREADY_IN_ROOM', 'Aap pehle se ek room me ho.');
    }
    const entry = { playerId, name: this.rooms.validateName(name) };
    if (this.queue.length + 1 < MAX_ROOM_PLAYERS) {
      this.queue.push(entry);
      return { code: null, waiting: this.waiting() };
    }

    const players = [...this.queue, entry];
    const host = players[0] as Queued;
    const code = this.rooms.createRoom(host.playerId, host.name);
    for (const p of players.slice(1)) this.rooms.joinRoom(p.playerId, code, p.name);
    this.rooms.startGame(host.playerId);
    this.queue = [];
    return { code, waiting: [] };
  }

  /** Queue chhodta hai. Sach = tha aur hata; jhoot = tha hi nahi. */
  leave(playerId: PlayerId): boolean {
    const before = this.queue.length;
    this.queue = this.queue.filter((q) => q.playerId !== playerId);
    return this.queue.length !== before;
  }

  waiting(): PlayerId[] {
    return this.queue.map((q) => q.playerId);
  }

  /** Queue me abhi wait kar rahe players ke naam, join order me. */
  waitingNames(): string[] {
    return this.queue.map((q) => q.name);
  }
}
