import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { EarlyAccessModule } from './early-access/early-access.module';

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
      'http://localhost:3002', // Kentexa Early Access Portal (Next.js dev)
      'https://kentexa.com',
      'https://www.kentexa.com',
      'https://staging.kentexa.com',
      'https://earlyaccess.kentexa.com', // Kentexa Early Access Portal (prod custom domain — not yet set up)
      'https://kentexa-early-access.onrender.com', // Kentexa Early Access Portal (actual Render URL)
      'https://bishoo-frontend.onrender.com', // Main Kentexa app (actual Render URL)
    ],
    credentials: true,
  });

  // Swagger — scoped to the Early Access module only, not the whole app
  const earlyAccessDocConfig = new DocumentBuilder()
    .setTitle('Kentexa Early Access API')
    .setDescription('Public registration + admin API for the Kentexa Early Access Portal')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const earlyAccessDoc = SwaggerModule.createDocument(app, earlyAccessDocConfig, {
    include: [EarlyAccessModule],
  });
  SwaggerModule.setup('early-access/docs', app, earlyAccessDoc);

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // Enable @Exclude() serialization globally
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Use the port provided by the hosting platform (Render) or default to 3001
  const port = parseInt(process.env.PORT || '3001', 10);

  await app.listen(port);

  console.log(`🚀 Kentexa backend is running on port ${port}`);
}

bootstrap();
