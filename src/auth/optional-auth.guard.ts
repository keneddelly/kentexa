import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// ✅ Like JwtAuthGuard but doesn't throw if no/invalid token —
// just leaves req.user undefined. Used for public pages that
// show extra info (e.g. isFollowing) when logged in.
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err, user) {
    return user || null;
  }
}
