import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ✅ Serve uploads folder as static files
  // Images accessible at https://api.kentexa.com/uploads/filename.jpg
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  // ✅ CORS — allow frontend to call the API
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://kentexa.com',
      'https://www.kentexa.com',
    ],
    credentials: true,
  });

  // ✅ Validation pipe — strip unknown fields, transform types
  app.useGlobalPipes(new ValidationPipe({
    whitelist:            true,
    forbidNonWhitelisted: false,
    transform:            true,
  }));

  // 🔒 Enforce @Exclude() on entity fields (password, OTP, etc.) across
  // EVERY response, application-wide — no matter which query joins the
  // User entity, now or in any future code. This is what makes the
  // @Exclude() decorators in user.entity.ts actually take effect.
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  await app.listen(3001);
  console.log('✅ KenteXa backend running on http://localhost:3001');
}

bootstrap();