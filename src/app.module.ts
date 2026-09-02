import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ClassifiedsModule } from './classifieds/classifieds.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { CommerceProfilesModule } from './commerce-profiles/commerce-profiles.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { UploadModule } from './upload/upload.module';
import { InvoicesModule } from './invoices/invoices.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { SellerModule } from './seller/seller.module';
import { IdentityModule } from './identity/identity.module';
import { AgentsModule } from './agents/agents.module';
import { AgentOrdersModule } from './agent-orders/agent-orders.module';
import { PayoutsModule } from './payouts/payouts.module';
import { StoreModule } from './store/store.module';
import { SmsModule } from './sms/sms.module';
import { MailModule } from './mail/mail.module';
import { ShippingModule } from './shipping/shipping.module';
import { DisputesModule } from './disputes/disputes.module';
import { ParcelCollectionsModule } from './parcel-collections/parcel-collections.module';
import { TzPricingModule } from './tz-location/tz-pricing.module';
import { BusinessModule } from './business/business.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TransportModule } from './transport/transport.module';
import { ReputationModule } from './reputation/reputation.module';
import { WalletModule } from './wallet/wallet.module';
import { FeedModule } from './feed/feed.module';
import { OffersModule } from './offers/offers.module';
import { PickupPointsModule } from './pickup-points/pickup-points.module';
import { ServicesModule } from './services/services.module';
import { TzLocationModule } from './tz-location/tz-location.module';
import { SuperAgentsModule } from './super-agents/super-agents.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { BodaRatesModule } from './boda-rates/boda-rates.module';
import { ContactModule } from './contact/contact.module';
import { ServiceProvidersModule } from './service-providers/service-providers.module';
import { EarlyAccessModule } from './early-access/early-access.module';
import { SearchModule } from './search/search.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { BrandsModule } from './brands/brands.module';
import { WarrantyModule } from './warranty/warranty.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { ActivityModule } from './activity/activity.module';
import { AdminIntelligenceModule } from './admin-intelligence/admin-intelligence.module';
import { SellingCapabilityModule } from './selling-capability/selling-capability.module';
import { PoliciesModule } from './policies/policies.module';
import { ShareModule } from './share/share.module';
import { RoleContextModule } from './role-context/role-context.module';

export const allowDevelopmentSchemaSync =
  process.env.NODE_ENV === 'development' &&
  process.env.TYPEORM_SYNCHRONIZE === 'true';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'kentexa',
      autoLoadEntities: true,
      synchronize: allowDevelopmentSchemaSync,
      extra: {
        query_timeout: 30000,
        statement_timeout: 30000,
      },
    }),
    SmsModule,
    MailModule,
    AuthModule,
    UsersModule,
    ClassifiedsModule,
    ProductsModule,
    CategoriesModule,
    CommerceProfilesModule,
    OrdersModule,
    PaymentsModule,
    UploadModule,
    InvoicesModule,
    InventoryModule,
    SalesModule,
    SellerModule,
    IdentityModule,
    AgentsModule,
    AgentOrdersModule,
    PayoutsModule,
    ShippingModule,
    SuperAgentsModule,
    TzLocationModule,
    BusinessModule,
    NotificationsModule,
    TransportModule,
    ReputationModule,
    WalletModule,
    FeedModule,
    OffersModule,
    PickupPointsModule,
    ServicesModule,
    TzPricingModule,
    StoreModule,
    DisputesModule,
    ParcelCollectionsModule,
    AnalyticsModule,
    AnnouncementsModule,
    BrandsModule,
    WarrantyModule,
    BodaRatesModule,
    ContactModule,
    ServiceProvidersModule,
    EarlyAccessModule,
    SearchModule,
    ShipmentsModule,
    AuditLogModule,
    ActivityModule,
    AdminIntelligenceModule,
    SellingCapabilityModule,
    PoliciesModule,
    ShareModule,
    RoleContextModule,
    // Blanket default rate limit — most controllers had none at all (only
    // auth/transport/search/early-access separately registered their own
    // tighter ThrottlerModule + guard). This adds a global floor via
    // APP_GUARD below without touching those already-protected modules;
    // their own local guard still applies on top, just tighter.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
