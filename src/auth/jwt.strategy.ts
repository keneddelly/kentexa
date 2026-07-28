import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // ✅ Must match JwtModule secret exactly
      secretOrKey: config.get<string>('JWT_SECRET') || 'kentexa_secret_key',
    });
  }

  async validate(payload: any) {
    if (!payload?.sub) return null;
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) return null;
    return user;
  }
}
