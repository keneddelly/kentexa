import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { EarlyAccessModule } from './early-access/early-access.module';
import helmet from 'helmet';
import { trustProxyHops } from './common/trust-proxy';
import { requestMetricsMiddleware, startEventLoopMonitor } from './metrics/request-metrics';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Issue #361: Cloudflare and then Render's load balancer sit in front of the app. Without
  // this every phone looked like the same address and shared one rate-limit bucket. Trusting
  // those two hops makes req.ip the phone's own address, which it cannot forge.
  // TRUST_PROXY_HOPS changes the count; GET /version/request-source shows the result.
  app.set('trust proxy', trustProxyHops(process.env.TRUST_PROXY_HOPS));

  // Traffic step 1 (issue #368): time every request, in memory only (GET /version/health).
  startEventLoopMonitor();
  app.use(requestMetricsMiddleware);

  // Baseline security headers (X-Frame-Options, HSTS, no-sniff, etc.).
  // contentSecurityPolicy is off — this is a JSON API plus a Swagger UI
  // route (/early-access/docs) that needs inline scripts/styles; a default
  // CSP would break that without a real gain here. crossOriginResourcePolicy
  // is relaxed so /uploads/* (served below) keeps loading from the
  // frontend's separate origin — the default 'same-origin' policy would
  // silently break every product/listing image.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

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
      ...(process.env.STAGE3KR_FRONTEND_ORIGIN
        ? [process.env.STAGE3KR_FRONTEND_ORIGIN]
        : []),
      'https://earlyaccess.kentexa.com', // Kentexa Early Access Portal (prod custom domain — not yet set up)
      'https://kentexa-early-access.onrender.com', // Kentexa Early Access Portal (actual Render URL)
      'https://bishoo-frontend.onrender.com', // Main Kentexa app (actual Render URL)
      'capacitor://localhost', // Native app WebView — Capacitor's default iOS origin
      'http://localhost', // Native app WebView — Capacitor's default Android origin
      'ionic://localhost', // Native app WebView — Capacitor's default iOS origin on older versions
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
