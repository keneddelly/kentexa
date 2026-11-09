import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstagramBusinessConnection, InstagramBusinessConnectionStatus } from './entities/instagram-business-connection.entity';
import { InstagramBusinessAccessService } from './instagram-business-access.service';

@Injectable()
export class InstagramBusinessConnectionService {
  constructor(
    @InjectRepository(InstagramBusinessConnection)
    private readonly connections: Repository<InstagramBusinessConnection>,
    private readonly access: InstagramBusinessAccessService,
  ) {}

  async list(businessId: number, userId: number) {
    await this.access.assertCanManage(businessId, userId);
    const rows = await this.connections.find({
      where: { businessId },
      order: { createdAt: 'DESC' },
    });
    return rows.map(row => ({
      id: row.id,
      instagramUserId: row.instagramUserId,
      instagramUsername: row.instagramUsername,
      status: row.status,
      tokenExpiresAt: row.tokenExpiresAt,
      grantedScopes: row.grantedScopes,
      connectedAt: row.connectedAt,
      lastVerifiedAt: row.lastVerifiedAt,
      webhookSubscribed: row.webhookSubscribed,
      facebookPageName: row.facebookPageName ?? null,
      webhookError: row.webhookError ?? null,
    }));
  }

  async disconnect(businessId: number, connectionId: number, userId: number) {
    await this.access.assertCanManage(businessId, userId);
    const connection = await this.connections.findOne({ where: { id: connectionId, businessId } });
    if (!connection) throw new NotFoundException('Instagram connection not found.');
    connection.status = InstagramBusinessConnectionStatus.DISCONNECTED;
    connection.accessTokenEncrypted = null;
    connection.tokenExpiresAt = null;
    await this.connections.save(connection);
    return { disconnected: true, connectionId };
  }
}
