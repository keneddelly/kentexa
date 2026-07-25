import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve uploaded files
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  // Enable CORS
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://kentexa.com',
      'https://www.kentexa.com',
      'https://staging.kentexa.com',
    ],
    credentials: true,
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // Enable @Exclude() serialization globally
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  // Use the port provided by the hosting platform (Render) or default to 3001
  const port = parseInt(process.env.PORT || '3001', 10);

  await app.listen(port);

  console.log(`🚀 Kentexa backend is running on port ${port}`);
}

bootstrap();