import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../users/entities/user.entity';
import { SmsModule } from '../sms/sms.module';
import { MailModule } from '../mail/mail.module';
import { ProfileModule } from '../profile/profile.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { PoliciesModule } from '../policies/policies.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    ProfileModule,
    CommerceProfilesModule,
    PoliciesModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          // Fail startup loudly rather than silently signing tokens with a
          // hardcoded, source-controlled secret — a previous fallback here
          // meant a misconfigured environment let anyone forge valid JWTs.
          throw new Error(
            'JWT_SECRET is not set. Refusing to start with a fallback signing secret.',
          );
        }
        return { secret, signOptions: { expiresIn: '7d' } };
      },
    }),
    SmsModule,
    MailModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 3600000, limit: 100 }]),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtStrategy],
})
export class AuthModule {}
