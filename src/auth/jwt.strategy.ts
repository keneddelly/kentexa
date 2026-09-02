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
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      // Must match JwtModule's own secret (auth.module.ts) — no fallback
      // here either, for the same reason: a fallback secret is a
      // source-controlled secret.
      throw new Error(
        'JWT_SECRET is not set. Refusing to start with a fallback signing secret.',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    if (!payload?.sub) return null;
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) return null;
    Object.defineProperty(user, 'authPayload', {
      value: payload,
      enumerable: false,
    });
    return user;
  }
}
