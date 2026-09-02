--
-- PostgreSQL database dump
--

\restrict HWyYxQqgUk8U4PX0vW02uL4OL9uwQznflRaEQGMKcvKwG31acS7shXCOUAYo9a8

-- Dumped from database version 18.4 (Debian 18.4-1.pgdg12+1)
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: activity_events_category_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.activity_events_category_enum AS ENUM (
    'AUTH',
    'IDENTITY',
    'BUSINESS',
    'SOCIAL',
    'CONTENT',
    'SEARCH',
    'MESSAGING',
    'COMMERCE',
    'PAYMENT',
    'INVOICE',
    'LOGISTICS',
    'AGENT',
    'TRANSPORT',
    'VERIFICATION',
    'REPUTATION',
    'SECURITY',
    'SYSTEM',
    'AI'
);


--
-- Name: agent_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agent_status_enum AS ENUM (
    'pending',
    'approved',
    'rejected',
    'suspended'
);


--
-- Name: agent_tier_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agent_tier_enum AS ENUM (
    'basic',
    'silver',
    'gold'
);


--
-- Name: agent_transaction_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agent_transaction_status_enum AS ENUM (
    'pending',
    'confirmed',
    'reversed'
);


--
-- Name: batch_parcel_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.batch_parcel_status_enum AS ENUM (
    'awaiting_handover',
    'at_hub',
    'on_van',
    'at_zone',
    'out_for_delivery',
    'delivered',
    'returned'
);


--
-- Name: bulk_shipment_deliverymethod_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.bulk_shipment_deliverymethod_enum AS ENUM (
    'bus_transport',
    'super_agent_handoff'
);


--
-- Name: bulk_shipment_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.bulk_shipment_status_enum AS ENUM (
    'open',
    'sealed',
    'dispatched',
    'arrived',
    'completed'
);


--
-- Name: business_brand_authorization_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.business_brand_authorization_status_enum AS ENUM (
    'pending',
    'approved',
    'rejected',
    'suspended',
    'expired',
    'revoked'
);


--
-- Name: business_businessverificationstatus_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.business_businessverificationstatus_enum AS ENUM (
    'not_submitted',
    'pending',
    'verified',
    'rejected'
);


--
-- Name: business_feed_item_actiontype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.business_feed_item_actiontype_enum AS ENUM (
    'contact',
    'buy_now',
    'order_now',
    'view_product',
    'request_service',
    'send_offer',
    'schedule',
    'follow'
);


--
-- Name: business_feed_item_intent_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.business_feed_item_intent_enum AS ENUM (
    'update',
    'offer',
    'sell_available',
    'need',
    'request',
    'announcement',
    'achievement'
);


--
-- Name: business_feed_item_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.business_feed_item_status_enum AS ENUM (
    'draft',
    'published',
    'paused',
    'fulfilled',
    'sold_out',
    'expired',
    'cancelled',
    'archived'
);


--
-- Name: business_feed_item_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.business_feed_item_type_enum AS ENUM (
    'new_product',
    'discount',
    'announcement',
    'restock',
    'new_service',
    'delivery_info',
    'moment',
    'looking_for'
);


--
-- Name: business_feed_item_urgencylevel_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.business_feed_item_urgencylevel_enum AS ENUM (
    'low',
    'normal',
    'high'
);


--
-- Name: business_feed_item_visibility_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.business_feed_item_visibility_enum AS ENUM (
    'public',
    'followers',
    'limited'
);


--
-- Name: business_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.business_status_enum AS ENUM (
    'active',
    'suspended'
);


--
-- Name: classified_invoice_request_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.classified_invoice_request_status_enum AS ENUM (
    'pending',
    'sent',
    'paid',
    'cancelled'
);


--
-- Name: classified_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.classified_status_enum AS ENUM (
    'active',
    'sold',
    'expired'
);


--
-- Name: commerce_profile_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.commerce_profile_status_enum AS ENUM (
    'active',
    'pending',
    'suspended',
    'rejected'
);


--
-- Name: commerce_profile_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.commerce_profile_type_enum AS ENUM (
    'personal',
    'business',
    'service_provider',
    'agent',
    'transport_provider',
    'hub',
    'brand'
);


--
-- Name: contact_message_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contact_message_status_enum AS ENUM (
    'open',
    'replied',
    'resolved'
);


--
-- Name: daily_batch_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.daily_batch_status_enum AS ENUM (
    'open',
    'cutoff',
    'departed',
    'in_progress',
    'completed',
    'cancelled'
);


--
-- Name: dispute_reason_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dispute_reason_enum AS ENUM (
    'not_delivered',
    'wrong_item',
    'damaged',
    'not_as_described',
    'late_delivery',
    'missing_items',
    'other',
    'cod_buyer_refused'
);


--
-- Name: dispute_resolution_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dispute_resolution_enum AS ENUM (
    'favour_buyer',
    'favour_seller',
    'split',
    'withdrawn'
);


--
-- Name: dispute_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dispute_status_enum AS ENUM (
    'open',
    'reviewing',
    'resolved',
    'closed'
);


--
-- Name: identity_profile_idtype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.identity_profile_idtype_enum AS ENUM (
    'nida',
    'drivers_license',
    'passport',
    'voter_id'
);


--
-- Name: identity_profile_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.identity_profile_status_enum AS ENUM (
    'not_submitted',
    'pending',
    'verified',
    'rejected'
);


--
-- Name: inventory_movement_reason_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_movement_reason_enum AS ENUM (
    'purchase',
    'local_pos',
    'kentexa_online',
    'manual',
    'return',
    'damaged',
    'adjustment',
    'order_cancelled'
);


--
-- Name: invoice_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_status_enum AS ENUM (
    'draft',
    'pending',
    'awaiting_payment',
    'payment_processing',
    'paid',
    'expired',
    'cancelled'
);


--
-- Name: job_request_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.job_request_status_enum AS ENUM (
    'pending',
    'accepted',
    'declined',
    'in_progress',
    'completed',
    'cancelled',
    'disputed'
);


--
-- Name: offer_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.offer_status_enum AS ENUM (
    'pending',
    'accepted',
    'declined',
    'countered',
    'expired'
);


--
-- Name: order_escrowstatus_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_escrowstatus_enum AS ENUM (
    'holding',
    'released',
    'refunded',
    'disputed'
);


--
-- Name: order_paymentmethod_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_paymentmethod_enum AS ENUM (
    'online',
    'cod'
);


--
-- Name: order_paymentstatus_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_paymentstatus_enum AS ENUM (
    'pending',
    'paid',
    'released',
    'refunded',
    'failed',
    'upfront_paid'
);


--
-- Name: order_source_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_source_enum AS ENUM (
    'online',
    'offline',
    'offline_intercity',
    'seller_shipment',
    'classified_invoice'
);


--
-- Name: order_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status_enum AS ENUM (
    'pending_payment',
    'paid',
    'preparing',
    'ready_for_pickup',
    'in_transit',
    'delivered',
    'completed',
    'disputed',
    'cancelled'
);


--
-- Name: parcel_collection_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.parcel_collection_status_enum AS ENUM (
    'requested',
    'claimed',
    'collected',
    'handed_over',
    'cancelled'
);


--
-- Name: parcel_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.parcel_status_enum AS ENUM (
    'pending',
    'collection_requested',
    'collected_by_agent',
    'received_at_hub',
    'verified',
    'ready_for_dispatch',
    'dispatched',
    'in_transit',
    'transferred_hub',
    'arrived_at_hub',
    'awaiting_buyer',
    'out_for_delivery',
    'delivered',
    'self_pickup',
    'returned',
    'disputed'
);


--
-- Name: parcel_tracking_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.parcel_tracking_status_enum AS ENUM (
    'pending',
    'collection_requested',
    'collected_by_agent',
    'received_at_hub',
    'verified',
    'ready_for_dispatch',
    'dispatched',
    'in_transit',
    'transferred_hub',
    'arrived_at_hub',
    'awaiting_buyer',
    'out_for_delivery',
    'delivered',
    'self_pickup',
    'returned',
    'disputed'
);


--
-- Name: payment_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status_enum AS ENUM (
    'pending',
    'success',
    'failed'
);


--
-- Name: payout_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payout_status_enum AS ENUM (
    'pending',
    'paid',
    'failed'
);


--
-- Name: pickup_point_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pickup_point_status_enum AS ENUM (
    'active',
    'inactive',
    'busy'
);


--
-- Name: policy_version_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.policy_version_status_enum AS ENUM (
    'draft',
    'active',
    'archived'
);


--
-- Name: policy_version_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.policy_version_type_enum AS ENUM (
    'terms_of_service',
    'seller_terms',
    'privacy_policy',
    'refund_policy',
    'shipping_policy',
    'prohibited_products_policy',
    'ai_data_policy',
    'dispute_policy'
);


--
-- Name: post_engagement_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.post_engagement_type_enum AS ENUM (
    'save',
    'comment',
    'share',
    'view',
    'purchase',
    'shipment'
);


--
-- Name: product_serial_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_serial_status_enum AS ENUM (
    'in_stock',
    'sold',
    'reported_lost',
    'reported_stolen',
    'deactivated'
);


--
-- Name: product_shippingmethod_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_shippingmethod_enum AS ENUM (
    'direct',
    'agent'
);


--
-- Name: provider_availability_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.provider_availability_status_enum AS ENUM (
    'open',
    'full',
    'departed',
    'cancelled'
);


--
-- Name: referral_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.referral_status_enum AS ENUM (
    'registered',
    'qualified',
    'rejected_fraud'
);


--
-- Name: reputation_event_eventtype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reputation_event_eventtype_enum AS ENUM (
    'order_completed',
    'order_cancelled',
    'delivery_on_time',
    'delivery_late',
    'five_star_rating',
    'four_star_rating',
    'three_star_rating',
    'two_star_rating',
    'one_star_rating',
    'dispute_won',
    'dispute_lost',
    'fast_response',
    'slow_response',
    'verified_phone',
    'verified_id',
    'verified_business',
    'year_active',
    'transport_completed',
    'transport_cancelled'
);


--
-- Name: sale_channel_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sale_channel_enum AS ENUM (
    'local_pos',
    'manual'
);


--
-- Name: sale_paymentmethod_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sale_paymentmethod_enum AS ENUM (
    'cash',
    'mpesa',
    'airtel_money',
    'tigo_pesa',
    'halopesa',
    'bank',
    'other'
);


--
-- Name: sale_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sale_status_enum AS ENUM (
    'completed',
    'voided',
    'refunded'
);


--
-- Name: seller_profile_businessdocumentsstatus_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.seller_profile_businessdocumentsstatus_enum AS ENUM (
    'not_submitted',
    'pending',
    'verified',
    'rejected'
);


--
-- Name: seller_profile_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.seller_profile_status_enum AS ENUM (
    'pending',
    'approved',
    'suspended',
    'rejected'
);


--
-- Name: seller_profile_verificationtier_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.seller_profile_verificationtier_enum AS ENUM (
    'registered',
    'verified_seller',
    'verified_business'
);


--
-- Name: selling_capabilities_capabilitytype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.selling_capabilities_capabilitytype_enum AS ENUM (
    'SELL_PHYSICAL',
    'SELL_DIGITAL',
    'SELL_FOOD',
    'SELL_SERVICE'
);


--
-- Name: selling_capabilities_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.selling_capabilities_status_enum AS ENUM (
    'ACTIVE',
    'RESTRICTED',
    'SUSPENDED',
    'REVOKED'
);


--
-- Name: selling_capabilities_verificationlevel_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.selling_capabilities_verificationlevel_enum AS ENUM (
    'INDIVIDUAL',
    'BUSINESS',
    'REGULATED'
);


--
-- Name: service_ad_category_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_ad_category_enum AS ENUM (
    'ufundi',
    'usafi',
    'elimu',
    'upishi',
    'usafirishaji',
    'afya',
    'ubunifu',
    'matengenezo',
    'biashara',
    'kilimo',
    'nyumbani',
    'mengineyo'
);


--
-- Name: service_ad_pricetype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_ad_pricetype_enum AS ENUM (
    'per_hour',
    'per_job',
    'per_day',
    'negotiate',
    'free_quote'
);


--
-- Name: service_ad_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_ad_status_enum AS ENUM (
    'active',
    'paused',
    'inactive'
);


--
-- Name: service_provider_primarycategory_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_provider_primarycategory_enum AS ENUM (
    'ufundi',
    'usafi',
    'elimu',
    'upishi',
    'usafirishaji',
    'afya',
    'ubunifu',
    'matengenezo',
    'biashara',
    'kilimo',
    'nyumbani',
    'mengineyo'
);


--
-- Name: service_provider_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_provider_status_enum AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: shipment_deliveryoption_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.shipment_deliveryoption_enum AS ENUM (
    'door',
    'agent',
    'station'
);


--
-- Name: shipment_pickupoption_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.shipment_pickupoption_enum AS ENUM (
    'door',
    'agent',
    'station'
);


--
-- Name: shipment_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.shipment_status_enum AS ENUM (
    'pending',
    'confirmed',
    'collected',
    'in_transit',
    'delivered',
    'completed',
    'cancelled'
);


--
-- Name: super_agent_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.super_agent_status_enum AS ENUM (
    'pending',
    'active',
    'suspended',
    'blocked'
);


--
-- Name: transport_assignment_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transport_assignment_status_enum AS ENUM (
    'pending',
    'accepted',
    'declined',
    'collected',
    'departed',
    'arrived',
    'completed',
    'cancelled'
);


--
-- Name: transport_provider_confirmmode_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transport_provider_confirmmode_enum AS ENUM (
    'auto',
    'manual'
);


--
-- Name: transport_provider_contracttype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transport_provider_contracttype_enum AS ENUM (
    'free',
    'per_parcel',
    'monthly',
    'revenue_share'
);


--
-- Name: transport_provider_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transport_provider_status_enum AS ENUM (
    'pending',
    'verified',
    'active',
    'inactive',
    'suspended',
    'rejected',
    'testing'
);


--
-- Name: transport_provider_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transport_provider_type_enum AS ENUM (
    'bus',
    'courier',
    'van',
    'truck',
    'boda',
    'rail',
    'air',
    'boat'
);


--
-- Name: transport_route_routetype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transport_route_routetype_enum AS ENUM (
    'intercity',
    'local_loop',
    'last_mile'
);


--
-- Name: user_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role_enum AS ENUM (
    'user',
    'seller',
    'agent',
    'super_agent',
    'customer_care',
    'manager',
    'admin',
    'arbitrator',
    'transport_provider'
);


--
-- Name: wallet_transaction_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.wallet_transaction_status_enum AS ENUM (
    'pending',
    'completed',
    'rejected'
);


--
-- Name: wallet_transaction_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.wallet_transaction_type_enum AS ENUM (
    'credit_escrow_release',
    'withdrawal_requested',
    'withdrawal_paid',
    'withdrawal_rejected',
    'adjustment'
);


--
-- Name: warranty_claim_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.warranty_claim_status_enum AS ENUM (
    'submitted',
    'under_review',
    'approved',
    'rejected',
    'resolved'
);


--
-- Name: warranty_registration_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.warranty_registration_status_enum AS ENUM (
    'active',
    'expired',
    'void'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_events (
    id integer NOT NULL,
    "eventType" character varying NOT NULL,
    category public.activity_events_category_enum NOT NULL,
    "actorId" integer,
    "actorType" character varying,
    "businessId" integer,
    "targetType" character varying,
    "targetId" integer,
    "relatedUserId" integer,
    "relatedBusinessId" integer,
    metadata jsonb,
    "sessionId" character varying,
    "requestId" character varying,
    severity character varying DEFAULT 'info'::character varying NOT NULL,
    visibility character varying DEFAULT 'business'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "actorProfileId" integer,
    "actorProfileType" character varying
);


--
-- Name: activity_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activity_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activity_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activity_events_id_seq OWNED BY public.activity_events.id;


--
-- Name: agent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent (
    id integer NOT NULL,
    "fullName" character varying NOT NULL,
    phone character varying,
    address character varying,
    city character varying,
    district character varying,
    region character varying,
    "coverageAreas" text,
    "idNumber" character varying,
    "idType" character varying,
    "idPhotoUrl" character varying,
    status public.agent_status_enum DEFAULT 'pending'::public.agent_status_enum NOT NULL,
    "rejectionReason" text,
    "agentCode" character varying,
    tier public.agent_tier_enum DEFAULT 'basic'::public.agent_tier_enum NOT NULL,
    "commissionRate" numeric(5,2) DEFAULT 2.5 NOT NULL,
    "deliveryCommission" numeric(10,2) DEFAULT '500'::numeric NOT NULL,
    "totalEarningsPayments" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalEarningsDeliveries" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "pendingEarnings" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalDeliveriesCompleted" integer DEFAULT 0 NOT NULL,
    "totalDeliveriesFailed" integer DEFAULT 0 NOT NULL,
    "totalPaymentsProcessed" integer DEFAULT 0 NOT NULL,
    "totalTransactions" integer DEFAULT 0 NOT NULL,
    "totalEarnings" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalCollectionsCompleted" integer DEFAULT 0 NOT NULL,
    "totalEarningsCollections" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "collectionFeeUrban" numeric(10,2) DEFAULT '1500'::numeric NOT NULL,
    "collectionFeeRural" numeric(10,2) DEFAULT '3000'::numeric NOT NULL,
    "totalComplaints" integer DEFAULT 0 NOT NULL,
    rating numeric(3,2) DEFAULT '5'::numeric NOT NULL,
    "totalRatings" integer DEFAULT 0 NOT NULL,
    "agentType" character varying DEFAULT 'boda'::character varying NOT NULL,
    "maxWeightKg" numeric(8,1) DEFAULT '20'::numeric NOT NULL,
    "vehicleDescription" character varying,
    "isOnline" boolean DEFAULT false NOT NULL,
    "lastOnlineAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer
);


--
-- Name: agent_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_id_seq OWNED BY public.agent.id;


--
-- Name: agent_transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_transaction (
    id integer NOT NULL,
    "invoiceAmount" numeric(10,2) NOT NULL,
    "commissionRate" numeric(5,2) NOT NULL,
    "commissionAmount" numeric(10,2) NOT NULL,
    "transactionReference" text,
    "paymentMethod" text,
    status public.agent_transaction_status_enum DEFAULT 'pending'::public.agent_transaction_status_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "agentId" integer,
    "invoiceId" integer,
    "releasedById" integer
);


--
-- Name: agent_transaction_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_transaction_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_transaction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_transaction_id_seq OWNED BY public.agent_transaction.id;


--
-- Name: ai_cost_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_cost_log (
    id integer NOT NULL,
    workflow character varying(40) NOT NULL,
    "userId" integer,
    model character varying(60) NOT NULL,
    "inputTokens" integer DEFAULT 0 NOT NULL,
    "outputTokens" integer DEFAULT 0 NOT NULL,
    "cacheReadTokens" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_cost_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_cost_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_cost_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_cost_log_id_seq OWNED BY public.ai_cost_log.id;


--
-- Name: ai_usage_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_log (
    id integer NOT NULL,
    task character varying(40) NOT NULL,
    "userId" integer,
    provider character varying(20) NOT NULL,
    model character varying(60) NOT NULL,
    "inputTokens" integer DEFAULT 0 NOT NULL,
    "outputTokens" integer DEFAULT 0 NOT NULL,
    "cacheReadTokens" integer DEFAULT 0 NOT NULL,
    "estimatedCost" numeric(10,6) DEFAULT '0'::numeric NOT NULL,
    "latencyMs" integer DEFAULT 0 NOT NULL,
    status character varying(10) DEFAULT 'success'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_usage_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_usage_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_usage_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_usage_log_id_seq OWNED BY public.ai_usage_log.id;


--
-- Name: analytics_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_events (
    id integer NOT NULL,
    "sessionId" integer NOT NULL,
    "userId" integer,
    "eventType" character varying NOT NULL,
    "eventCategory" character varying,
    "eventLabel" character varying,
    page character varying,
    "pageUrl" character varying,
    "targetId" character varying,
    "targetType" character varying,
    "targetName" character varying,
    metadata jsonb,
    "scrollDepth" integer,
    "timeOnPage" integer,
    "clickX" integer,
    "clickY" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: analytics_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.analytics_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: analytics_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.analytics_events_id_seq OWNED BY public.analytics_events.id;


--
-- Name: analytics_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_sessions (
    id integer NOT NULL,
    "sessionId" character varying NOT NULL,
    "userId" integer,
    browser character varying,
    "browserVersion" character varying,
    os character varying,
    device character varying,
    "screenWidth" integer,
    "screenHeight" integer,
    language character varying,
    timezone character varying,
    "ipAddress" character varying,
    country character varying,
    city character varying,
    region character varying,
    referrer character varying,
    "utmSource" character varying,
    "utmMedium" character varying,
    "utmCampaign" character varying,
    "utmContent" character varying,
    "pageViews" integer DEFAULT 0 NOT NULL,
    events integer DEFAULT 0 NOT NULL,
    "lastSeenAt" timestamp without time zone,
    "exitPage" character varying,
    converted boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: analytics_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.analytics_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: analytics_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.analytics_sessions_id_seq OWNED BY public.analytics_sessions.id;


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id integer NOT NULL,
    title character varying NOT NULL,
    message text NOT NULL,
    audience character varying DEFAULT 'all'::character varying NOT NULL,
    priority character varying DEFAULT 'info'::character varying NOT NULL,
    "linkUrl" character varying,
    "linkLabel" character varying,
    "sendSms" boolean DEFAULT false NOT NULL,
    "smsSent" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "expiresAt" timestamp without time zone,
    "readByUserIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "createdById" integer,
    "targetUserId" integer,
    "targetUserName" character varying,
    "thresholdEntity" character varying,
    "thresholdOperator" character varying,
    "thresholdAmount" numeric(12,2)
);


--
-- Name: announcements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.announcements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: announcements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.announcements_id_seq OWNED BY public.announcements.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    "actorId" integer,
    "actorRole" character varying,
    action character varying NOT NULL,
    "entityType" character varying NOT NULL,
    "entityId" integer NOT NULL,
    "previousValue" jsonb,
    "newValue" jsonb,
    "ipAddress" character varying,
    "userAgent" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: batch_parcel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.batch_parcel (
    id integer NOT NULL,
    status public.batch_parcel_status_enum DEFAULT 'awaiting_handover'::public.batch_parcel_status_enum NOT NULL,
    "trackingNumber" text,
    "handedOverAt" timestamp without time zone,
    "arrivedAtZoneAt" timestamp without time zone,
    "deliveredAt" timestamp without time zone,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "batchId" integer,
    "orderId" integer,
    "zoneId" integer
);


--
-- Name: batch_parcel_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.batch_parcel_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: batch_parcel_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.batch_parcel_id_seq OWNED BY public.batch_parcel.id;


--
-- Name: boda_rate_card; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boda_rate_card (
    id integer NOT NULL,
    "rateKey" character varying NOT NULL,
    label character varying NOT NULL,
    category character varying NOT NULL,
    fee integer DEFAULT 0 NOT NULL,
    keywords text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "weightMin" numeric(6,2),
    "weightMax" numeric(6,2),
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: boda_rate_card_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.boda_rate_card_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: boda_rate_card_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.boda_rate_card_id_seq OWNED BY public.boda_rate_card.id;


--
-- Name: brand; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand (
    id integer NOT NULL,
    name character varying NOT NULL,
    "legalName" character varying,
    slug character varying NOT NULL,
    "logoUrl" character varying,
    description text,
    website character varying,
    "countryOfOrigin" character varying,
    "officialContactInfo" jsonb,
    "verificationStatus" character varying DEFAULT 'unverified'::character varying NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "defaultWarrantyMonths" integer
);


--
-- Name: brand_authorization_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand_authorization_audit_log (
    id integer NOT NULL,
    "previousStatus" character varying NOT NULL,
    "newStatus" character varying NOT NULL,
    "actorUserId" integer,
    reason text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "authorizationId" integer
);


--
-- Name: brand_authorization_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brand_authorization_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brand_authorization_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brand_authorization_audit_log_id_seq OWNED BY public.brand_authorization_audit_log.id;


--
-- Name: brand_authorization_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand_authorization_evidence (
    id integer NOT NULL,
    "documentType" character varying NOT NULL,
    "cloudinaryPublicId" character varying NOT NULL,
    format character varying NOT NULL,
    "uploadedByUserId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "authorizationId" integer
);


--
-- Name: brand_authorization_evidence_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brand_authorization_evidence_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brand_authorization_evidence_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brand_authorization_evidence_id_seq OWNED BY public.brand_authorization_evidence.id;


--
-- Name: brand_distributor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand_distributor (
    id integer NOT NULL,
    "categoryScope" character varying,
    "regionScope" character varying,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "brandId" integer,
    "distributorId" integer
);


--
-- Name: brand_distributor_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brand_distributor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brand_distributor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brand_distributor_id_seq OWNED BY public.brand_distributor.id;


--
-- Name: brand_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brand_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brand_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brand_id_seq OWNED BY public.brand.id;


--
-- Name: bulk_shipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bulk_shipment (
    id integer NOT NULL,
    "originCity" character varying NOT NULL,
    "destinationCity" character varying NOT NULL,
    status public.bulk_shipment_status_enum DEFAULT 'open'::public.bulk_shipment_status_enum NOT NULL,
    "shipmentCode" character varying,
    "totalParcels" integer DEFAULT 0 NOT NULL,
    "totalWeightKg" numeric(8,2) DEFAULT '0'::numeric NOT NULL,
    "totalShippingCost" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "transportCompany" character varying,
    "transportRef" character varying,
    "dispatchTime" timestamp without time zone,
    "arrivedTime" timestamp without time zone,
    notes text,
    "courierCostReceipt" character varying,
    "totalCollectedFee" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "agentNet" numeric(10,2),
    "costFlagged" boolean DEFAULT false NOT NULL,
    "costNote" text,
    "agentPaidOut" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "superAgentId" integer,
    "deliveryMethod" public.bulk_shipment_deliverymethod_enum,
    "lastMileContactName" character varying,
    "lastMileContactPhone" character varying,
    "lastMileContactCity" character varying,
    "lastMileSuperAgentId" integer,
    "lastMileContactAddress" character varying
);


--
-- Name: bulk_shipment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bulk_shipment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bulk_shipment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bulk_shipment_id_seq OWNED BY public.bulk_shipment.id;


--
-- Name: business; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business (
    id integer NOT NULL,
    "legalName" character varying NOT NULL,
    "tradingName" character varying,
    description text,
    category character varying,
    logo character varying,
    "coverImage" character varying,
    address text,
    phone character varying,
    email character varying,
    "regionId" integer,
    region character varying,
    "districtId" integer,
    district character varying,
    "wardId" integer,
    ward character varying,
    status public.business_status_enum DEFAULT 'active'::public.business_status_enum NOT NULL,
    "businessVerificationStatus" public.business_businessverificationstatus_enum DEFAULT 'not_submitted'::public.business_businessverificationstatus_enum NOT NULL,
    "responsiblePersonName" character varying,
    "tinNumber" character varying,
    "registrationNumber" character varying,
    "businessLicenseNumber" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer
);


--
-- Name: business_brand_authorization; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_brand_authorization (
    id integer NOT NULL,
    "commerceProfileId" integer NOT NULL,
    "categoryScope" character varying,
    "modelScope" jsonb,
    "geographicScope" jsonb,
    "authorizationNumber" character varying,
    "issuedDate" date,
    "expiresAt" timestamp without time zone,
    "verificationSource" character varying NOT NULL,
    status public.business_brand_authorization_status_enum DEFAULT 'pending'::public.business_brand_authorization_status_enum NOT NULL,
    "submittedBy" integer NOT NULL,
    "reviewedBy" integer,
    "reviewedAt" timestamp without time zone,
    "statusReason" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "brandId" integer,
    "distributorId" integer
);


--
-- Name: business_brand_authorization_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_brand_authorization_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_brand_authorization_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_brand_authorization_id_seq OWNED BY public.business_brand_authorization.id;


--
-- Name: business_customer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_customer (
    id integer NOT NULL,
    seller_id integer NOT NULL,
    user_id integer,
    name character varying NOT NULL,
    phone character varying,
    email character varying,
    address character varying,
    "regionId" integer,
    "districtId" integer,
    "wardId" integer,
    ward character varying,
    district character varying,
    region character varying,
    "totalOrders" integer DEFAULT 0 NOT NULL,
    "totalSpent" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "averageOrderValue" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "firstOrderAt" timestamp without time zone,
    "lastOrderAt" timestamp without time zone,
    segment character varying DEFAULT 'regular'::character varying NOT NULL,
    tags text,
    notes text,
    channel character varying DEFAULT 'kentexa'::character varying NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "isBlocked" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: business_customer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_customer_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_customer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_customer_id_seq OWNED BY public.business_customer.id;


--
-- Name: business_document; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_document (
    id integer NOT NULL,
    "documentType" character varying NOT NULL,
    url character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "sellerProfileId" integer
);


--
-- Name: business_document_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_document_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_document_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_document_id_seq OWNED BY public.business_document.id;


--
-- Name: business_feed_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_feed_item (
    id integer NOT NULL,
    "businessId" integer NOT NULL,
    type public.business_feed_item_type_enum NOT NULL,
    title character varying NOT NULL,
    body text,
    "imageUrl" character varying,
    "linkedEntityType" character varying,
    "linkedEntityId" integer,
    "ctaLabel" character varying,
    category character varying,
    "isActive" boolean DEFAULT true NOT NULL,
    "expiresAt" timestamp without time zone,
    "cvsScore" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "saveCount" integer DEFAULT 0 NOT NULL,
    "commentCount" integer DEFAULT 0 NOT NULL,
    "shareCount" integer DEFAULT 0 NOT NULL,
    "purchaseCount" integer DEFAULT 0 NOT NULL,
    "shipmentCount" integer DEFAULT 0 NOT NULL,
    "viewCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "commerceProfileId" integer,
    intent public.business_feed_item_intent_enum,
    "actionType" public.business_feed_item_actiontype_enum,
    status public.business_feed_item_status_enum DEFAULT 'published'::public.business_feed_item_status_enum NOT NULL,
    "urgencyLevel" public.business_feed_item_urgencylevel_enum,
    "availabilityStatus" character varying,
    "startsAt" timestamp without time zone,
    "locationRegion" character varying,
    "locationDistrict" character varying,
    "locationWard" character varying,
    "locationLabel" character varying,
    visibility public.business_feed_item_visibility_enum DEFAULT 'public'::public.business_feed_item_visibility_enum NOT NULL,
    price numeric(10,2)
);


--
-- Name: business_feed_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_feed_item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_feed_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_feed_item_id_seq OWNED BY public.business_feed_item.id;


--
-- Name: business_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_id_seq OWNED BY public.business.id;


--
-- Name: business_team_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_team_member (
    id integer NOT NULL,
    seller_id integer NOT NULL,
    user_id integer NOT NULL,
    role character varying DEFAULT 'sales'::character varying NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "joinedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: business_team_member_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_team_member_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_team_member_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_team_member_id_seq OWNED BY public.business_team_member.id;


--
-- Name: classified; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classified (
    id integer NOT NULL,
    title character varying NOT NULL,
    description text NOT NULL,
    price numeric(10,2) NOT NULL,
    subcategory text,
    status public.classified_status_enum DEFAULT 'active'::public.classified_status_enum NOT NULL,
    location character varying,
    images text,
    specs json,
    condition text,
    "isNegotiable" boolean DEFAULT false NOT NULL,
    "deliveryMethod" character varying DEFAULT 'direct'::character varying,
    "isFreeListing" boolean DEFAULT false NOT NULL,
    "isFlashSale" boolean DEFAULT false NOT NULL,
    "flashSalePrice" numeric(10,2),
    "originalPrice" numeric(10,2),
    "flashSaleEndsAt" timestamp without time zone,
    "flashSaleQuantity" integer,
    "flashSaleSold" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "sellerId" integer,
    category character varying DEFAULT 'general'::character varying NOT NULL,
    "commerceProfileId" integer,
    "contactPhone" character varying
);


--
-- Name: classified_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.classified_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: classified_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.classified_id_seq OWNED BY public.classified.id;


--
-- Name: classified_invoice_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classified_invoice_request (
    id integer NOT NULL,
    "buyerMessage" text,
    amount numeric(10,2),
    "invoiceDescription" text,
    "sellerNotes" text,
    "dueDate" timestamp without time zone,
    status public.classified_invoice_request_status_enum DEFAULT 'pending'::public.classified_invoice_request_status_enum NOT NULL,
    "invoiceNumber" character varying,
    "paidAt" timestamp without time zone,
    "paymentMethod" text,
    "transactionReference" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "classifiedId" integer,
    "buyerId" integer,
    "sellerId" integer,
    "shippingMethod" character varying,
    "platformFee" numeric(10,2),
    "sellerAmount" numeric(10,2),
    "linkedOrderId" integer,
    "regionId" integer,
    "regionName" character varying,
    "districtId" integer,
    "districtName" character varying,
    "wardId" integer,
    "wardName" character varying,
    "deliveryAddress" text,
    "busCompany" character varying,
    "busTicketNumber" character varying,
    "courierName" character varying,
    "courierTrackingRef" character varying,
    "orderRefId" integer,
    "shippingAmount" numeric(10,2),
    "isCod" boolean DEFAULT false NOT NULL,
    "codUpfrontAmount" numeric(10,2),
    "codRemainingBalance" numeric(10,2)
);


--
-- Name: classified_invoice_request_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.classified_invoice_request_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: classified_invoice_request_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.classified_invoice_request_id_seq OWNED BY public.classified_invoice_request.id;


--
-- Name: commerce_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commerce_profile (
    id integer NOT NULL,
    "ownerId" integer NOT NULL,
    type public.commerce_profile_type_enum NOT NULL,
    username character varying NOT NULL,
    "displayName" character varying NOT NULL,
    "photoUrl" character varying,
    "coverImage" character varying,
    bio text,
    location character varying,
    category character varying,
    status public.commerce_profile_status_enum DEFAULT 'active'::public.commerce_profile_status_enum NOT NULL,
    "isVerified" boolean DEFAULT false NOT NULL,
    "followersCount" integer DEFAULT 0 NOT NULL,
    rating numeric(3,2) DEFAULT '0'::numeric NOT NULL,
    "reviewsCount" integer DEFAULT 0 NOT NULL,
    "reputationScore" integer DEFAULT 0 NOT NULL,
    "sellerProfileId" integer,
    "transportProviderId" integer,
    "agentId" integer,
    "superAgentId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "aiKeywords" text,
    "businessId" integer,
    "brandId" integer
);


--
-- Name: commerce_profile_follow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commerce_profile_follow (
    id integer NOT NULL,
    "followerId" integer NOT NULL,
    "commerceProfileId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: commerce_profile_follow_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.commerce_profile_follow_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: commerce_profile_follow_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.commerce_profile_follow_id_seq OWNED BY public.commerce_profile_follow.id;


--
-- Name: commerce_profile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.commerce_profile_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: commerce_profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.commerce_profile_id_seq OWNED BY public.commerce_profile.id;


--
-- Name: commerce_profile_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commerce_profile_member (
    id integer NOT NULL,
    "commerceProfileId" integer NOT NULL,
    "userId" integer NOT NULL,
    role character varying DEFAULT 'staff'::character varying NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "profileId" integer
);


--
-- Name: commerce_profile_member_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.commerce_profile_member_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: commerce_profile_member_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.commerce_profile_member_id_seq OWNED BY public.commerce_profile_member.id;


--
-- Name: communication_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communication_log (
    id integer NOT NULL,
    "eventType" character varying NOT NULL,
    "sourceType" character varying NOT NULL,
    "sourceId" integer NOT NULL,
    "recipientUserId" integer NOT NULL,
    "recipientRole" character varying NOT NULL,
    channel character varying NOT NULL,
    "templateId" integer,
    status character varying NOT NULL,
    "errorMessage" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: communication_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.communication_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: communication_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.communication_log_id_seq OWNED BY public.communication_log.id;


--
-- Name: communication_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communication_template (
    id integer NOT NULL,
    "eventType" character varying NOT NULL,
    channel character varying DEFAULT 'in_app'::character varying NOT NULL,
    "recipientRole" character varying NOT NULL,
    language character varying DEFAULT 'sw'::character varying NOT NULL,
    "titleTemplate" character varying NOT NULL,
    "bodyTemplate" text NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: communication_template_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.communication_template_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: communication_template_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.communication_template_id_seq OWNED BY public.communication_template.id;


--
-- Name: contact_message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_message (
    id integer NOT NULL,
    name character varying NOT NULL,
    email character varying NOT NULL,
    phone character varying,
    subject character varying NOT NULL,
    message text NOT NULL,
    status public.contact_message_status_enum DEFAULT 'open'::public.contact_message_status_enum NOT NULL,
    "adminNote" text,
    "emailSent" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_message_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contact_message_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contact_message_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contact_message_id_seq OWNED BY public.contact_message.id;


--
-- Name: conversation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation (
    id integer NOT NULL,
    seller_id integer NOT NULL,
    customer_id integer,
    assigned_to_id integer,
    subject character varying,
    status character varying DEFAULT 'open'::character varying NOT NULL,
    channel character varying DEFAULT 'kentexa'::character varying NOT NULL,
    "externalId" character varying,
    "messageCount" integer DEFAULT 0 NOT NULL,
    "unreadCount" integer DEFAULT 0 NOT NULL,
    "buyerUnreadCount" integer DEFAULT 0 NOT NULL,
    "lastMessageAt" timestamp without time zone,
    "lastMessagePreview" text,
    "linkedOrderId" integer,
    "linkedInvoiceId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "commerceProfileId" integer,
    "sellerPinned" boolean DEFAULT false NOT NULL,
    "sellerMuted" boolean DEFAULT false NOT NULL,
    "buyerPinned" boolean DEFAULT false NOT NULL,
    "buyerMuted" boolean DEFAULT false NOT NULL,
    "linkedContextType" character varying,
    "linkedContextId" integer,
    "linkedContextTitle" character varying,
    "linkedContextImage" character varying
);


--
-- Name: conversation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversation_id_seq OWNED BY public.conversation.id;


--
-- Name: conversation_message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_message (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    "senderType" character varying NOT NULL,
    sender_id integer,
    type character varying DEFAULT 'text'::character varying NOT NULL,
    content text,
    "imageUrl" character varying,
    metadata jsonb,
    "isRead" boolean DEFAULT false NOT NULL,
    "isNote" boolean DEFAULT false NOT NULL,
    "readAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_message_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversation_message_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversation_message_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversation_message_id_seq OWNED BY public.conversation_message.id;


--
-- Name: daily_batch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_batch (
    id integer NOT NULL,
    "runDate" date NOT NULL,
    status public.daily_batch_status_enum DEFAULT 'open'::public.daily_batch_status_enum NOT NULL,
    "cutoffTime" timestamp without time zone NOT NULL,
    "plannedDepartureTime" timestamp without time zone NOT NULL,
    "actualDepartureTime" timestamp without time zone,
    "completedAt" timestamp without time zone,
    "driverName" text,
    "driverPhone" text,
    "vehicleInfo" text,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: daily_batch_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.daily_batch_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_batch_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.daily_batch_id_seq OWNED BY public.daily_batch.id;


--
-- Name: delivery_zone; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_zone (
    id integer NOT NULL,
    name character varying NOT NULL,
    city character varying NOT NULL,
    "routeOrder" integer NOT NULL,
    "etaMinutesFromDeparture" integer DEFAULT 60 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "addressKeywords" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "zoneAgentId" integer
);


--
-- Name: delivery_zone_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.delivery_zone_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: delivery_zone_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.delivery_zone_id_seq OWNED BY public.delivery_zone.id;


--
-- Name: digital_product_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.digital_product_assets (
    id integer NOT NULL,
    "cloudinaryPublicId" character varying NOT NULL,
    format character varying NOT NULL,
    "fileSizeBytes" bigint NOT NULL,
    "licenseType" text,
    "copyrightDeclaredAt" timestamp without time zone NOT NULL,
    "maxDownloads" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "productId" integer
);


--
-- Name: digital_product_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.digital_product_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: digital_product_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.digital_product_assets_id_seq OWNED BY public.digital_product_assets.id;


--
-- Name: dispute; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispute (
    id integer NOT NULL,
    status public.dispute_status_enum DEFAULT 'open'::public.dispute_status_enum NOT NULL,
    reason public.dispute_reason_enum NOT NULL,
    description text NOT NULL,
    "evidencePhotos" text,
    "sellerResponse" text,
    "arbitratorNotes" text,
    resolution public.dispute_resolution_enum,
    "resolutionNote" text,
    "refundAmount" numeric(12,2),
    "resolvedAt" timestamp without time zone,
    "assignedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "orderId" integer NOT NULL,
    "raisedById" integer NOT NULL,
    "arbitratorId" integer
);


--
-- Name: dispute_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dispute_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dispute_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dispute_id_seq OWNED BY public.dispute.id;


--
-- Name: distributor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.distributor (
    id integer NOT NULL,
    name character varying NOT NULL,
    "commerceProfileId" integer,
    "contactInfo" jsonb,
    "verificationStatus" character varying DEFAULT 'unverified'::character varying NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: distributor_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.distributor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: distributor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.distributor_id_seq OWNED BY public.distributor.id;


--
-- Name: early_access_otp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.early_access_otp (
    id integer NOT NULL,
    phone character varying(30) NOT NULL,
    otp character varying(6) NOT NULL,
    "otpExpiry" timestamp without time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: early_access_otp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.early_access_otp_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: early_access_otp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.early_access_otp_id_seq OWNED BY public.early_access_otp.id;


--
-- Name: early_access_registration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.early_access_registration (
    id integer NOT NULL,
    "accountType" character varying(30) NOT NULL,
    "ownerName" character varying(150) NOT NULL,
    "businessName" character varying(150) NOT NULL,
    phone character varying(30) NOT NULL,
    whatsapp character varying(30),
    email character varying(150),
    region character varying(100) NOT NULL,
    district character varying(100) NOT NULL,
    ward character varying(100),
    "businessCategory" character varying(40) NOT NULL,
    "businessDescription" text NOT NULL,
    "productsOrServices" text NOT NULL,
    "yearsInBusiness" integer,
    website character varying(255),
    facebook character varying(255),
    instagram character varying(255),
    tiktok character varying(255),
    "logoUrl" character varying(500),
    "coverImageUrl" character varying(500),
    "photoUrls" text,
    latitude numeric(10,7),
    longitude numeric(10,7),
    "consentToContact" boolean DEFAULT false NOT NULL,
    "biggestChallenge" text,
    "howCustomersFindYou" text,
    "onlinePlatformsUsed" text,
    "desiredKentexaFeature" text,
    "wouldUseAi" boolean,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "rejectionReason" text,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "vehicleType" character varying(50),
    "hasLicense" boolean,
    "coverageAreas" text,
    "currentSellingChannels" text,
    "readyProductCount" integer,
    "travelsToCustomer" boolean,
    "currentBookingMethod" character varying(100),
    "hasPhysicalLocation" boolean,
    "operatingHours" character varying(100),
    "canHandleCashCollection" boolean,
    "cargoCapacity" character varying(30),
    "routeType" character varying(20),
    "priceRange" character varying(20),
    "pricingModel" character varying(20),
    "agentType" character varying(20),
    "dailyCapacity" character varying(20),
    "coverageRegions" text,
    "needsDeliverySupport" boolean,
    "employeeCount" character varying(20),
    "isQuickSignup" boolean DEFAULT false NOT NULL,
    "editToken" character varying(64)
);


--
-- Name: early_access_registration_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.early_access_registration_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: early_access_registration_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.early_access_registration_id_seq OWNED BY public.early_access_registration.id;


--
-- Name: follow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow (
    id integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "followerId" integer,
    "sellerId" integer
);


--
-- Name: follow_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.follow_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: follow_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.follow_id_seq OWNED BY public.follow.id;


--
-- Name: identity_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.identity_profile (
    id integer NOT NULL,
    "legalName" character varying,
    "dateOfBirth" date,
    "idDocumentImageUrl" character varying,
    status public.identity_profile_status_enum DEFAULT 'not_submitted'::public.identity_profile_status_enum NOT NULL,
    "rejectionReason" text,
    "reviewedBy" integer,
    "reviewedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer,
    "idType" public.identity_profile_idtype_enum,
    "idNumber" character varying
);


--
-- Name: identity_profile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.identity_profile_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: identity_profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.identity_profile_id_seq OWNED BY public.identity_profile.id;


--
-- Name: identity_verification_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.identity_verification_audit (
    id integer NOT NULL,
    "verificationType" character varying NOT NULL,
    "previousStatus" character varying NOT NULL,
    "newStatus" character varying NOT NULL,
    "reviewedBy" integer,
    reason text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer
);


--
-- Name: identity_verification_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.identity_verification_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: identity_verification_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.identity_verification_audit_id_seq OWNED BY public.identity_verification_audit.id;


--
-- Name: intercity_route; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intercity_route (
    id integer NOT NULL,
    "originCity" character varying NOT NULL,
    "destinationCity" character varying NOT NULL,
    "estimatedDays" integer DEFAULT 2 NOT NULL,
    "estimatedHours" integer,
    "baseShippingFee" numeric(10,2) DEFAULT '5000'::numeric NOT NULL,
    "perKgFee" numeric(10,2) DEFAULT '1000'::numeric NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "primaryTransport" character varying,
    notes text,
    "transitCity" character varying,
    "leg1Days" integer,
    "leg2Days" integer,
    "originRegion" character varying,
    "destinationRegion" character varying,
    "providerId" integer,
    "providerName" character varying,
    "perKgFeePartner" numeric(5,2),
    "isPartnerRoute" boolean DEFAULT false NOT NULL,
    "districtMultiplierUrban" numeric(5,4) DEFAULT '1'::numeric NOT NULL,
    "districtMultiplierRural" numeric(5,4) DEFAULT 1.1 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: intercity_route_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.intercity_route_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: intercity_route_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.intercity_route_id_seq OWNED BY public.intercity_route.id;


--
-- Name: inventory_movement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_movement (
    id integer NOT NULL,
    "productId" integer NOT NULL,
    delta integer NOT NULL,
    reason public.inventory_movement_reason_enum NOT NULL,
    "referenceType" character varying,
    "referenceId" integer,
    "balanceAfter" integer NOT NULL,
    note character varying,
    "createdByUserId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory_movement_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_movement_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_movement_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_movement_id_seq OWNED BY public.inventory_movement.id;


--
-- Name: invoice; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice (
    id integer NOT NULL,
    "invoiceNumber" character varying NOT NULL,
    amount numeric(10,2) NOT NULL,
    status public.invoice_status_enum DEFAULT 'awaiting_payment'::public.invoice_status_enum NOT NULL,
    "receiptNumber" text,
    "paidAt" timestamp without time zone,
    "expiredAt" timestamp without time zone,
    "transactionReference" text,
    "paymentMethod" text,
    "agentId" integer,
    notes text,
    "dueDate" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "orderId" integer,
    "buyerId" integer,
    "payerName" text,
    "payerPhone" text
);


--
-- Name: invoice_counter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_counter (
    id integer NOT NULL,
    year integer NOT NULL,
    "lastSequence" integer DEFAULT 0 NOT NULL
);


--
-- Name: invoice_counter_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_counter_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_counter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_counter_id_seq OWNED BY public.invoice_counter.id;


--
-- Name: invoice_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_id_seq OWNED BY public.invoice.id;


--
-- Name: job_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_request (
    id integer NOT NULL,
    "buyerId" integer NOT NULL,
    "serviceAdId" integer NOT NULL,
    "providerId" integer NOT NULL,
    description text NOT NULL,
    "preferredDate" character varying,
    "preferredTime" character varying,
    "jobLocation" character varying NOT NULL,
    "buyerPhone" character varying,
    "agreedPrice" numeric(10,2),
    status public.job_request_status_enum DEFAULT 'pending'::public.job_request_status_enum NOT NULL,
    "providerNote" text,
    "buyerNote" text,
    "acceptedAt" timestamp without time zone,
    "startedAt" timestamp without time zone,
    "completedAt" timestamp without time zone,
    rating integer,
    review text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: job_request_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_request_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_request_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_request_id_seq OWNED BY public.job_request.id;


--
-- Name: notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type character varying NOT NULL,
    title character varying NOT NULL,
    body text NOT NULL,
    "actionPage" character varying,
    "actionParam" character varying,
    icon character varying,
    "orderId" integer,
    "trackingNumber" character varying,
    "isRead" boolean DEFAULT false NOT NULL,
    "readAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "actionCommerceProfileId" integer
);


--
-- Name: notification_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_id_seq OWNED BY public.notification.id;


--
-- Name: offer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer (
    id integer NOT NULL,
    "classifiedId" integer NOT NULL,
    "buyerId" integer NOT NULL,
    "sellerId" integer NOT NULL,
    "offerAmount" numeric(12,2) NOT NULL,
    "counterAmount" numeric(12,2),
    status public.offer_status_enum DEFAULT 'pending'::public.offer_status_enum NOT NULL,
    "buyerNote" text,
    "sellerNote" text,
    "expiresAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: offer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offer_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offer_id_seq OWNED BY public.offer.id;


--
-- Name: official_product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.official_product (
    id integer NOT NULL,
    "brandId" integer NOT NULL,
    name character varying NOT NULL,
    category text NOT NULL,
    subcategory text,
    "officialSpecs" jsonb,
    "officialImages" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: official_product_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.official_product_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: official_product_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.official_product_id_seq OWNED BY public.official_product.id;


--
-- Name: order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."order" (
    id integer NOT NULL,
    quantity integer NOT NULL,
    source public.order_source_enum DEFAULT 'online'::public.order_source_enum NOT NULL,
    "manualProductName" text,
    "manualBuyerName" character varying,
    "manualBuyerPhone" character varying,
    "createdByUserId" integer,
    "baseAmount" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "recipientName" character varying,
    "actualShippingFee" numeric(10,2),
    "shippingFeeFlagged" boolean DEFAULT false NOT NULL,
    "shippingFeeNote" text,
    "deliveryFeeAmount" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "totalAmount" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "platformFeeAmount" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "platformFeePercent" numeric(5,2) DEFAULT '10'::numeric NOT NULL,
    "agentCommissionAmount" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "sellerAmount" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    status public.order_status_enum DEFAULT 'pending_payment'::public.order_status_enum NOT NULL,
    "paymentStatus" public.order_paymentstatus_enum DEFAULT 'pending'::public.order_paymentstatus_enum NOT NULL,
    "escrowStatus" public.order_escrowstatus_enum,
    "payoutStatus" character varying DEFAULT 'pending'::character varying,
    "deliveryAddress" text,
    phone text,
    "shippingMethod" character varying DEFAULT 'agent'::character varying,
    "deliveryMethod" character varying,
    "trackingNumber" text,
    "courierName" text,
    "busCompany" character varying,
    "busTicketNumber" character varying,
    "externalTrackingRef" character varying,
    "shippingFeeCollected" numeric(12,2),
    "shippingFeeCollectedByAgentId" integer,
    "shippingFeeCollectedAt" timestamp without time zone,
    "needsCollection" boolean DEFAULT false NOT NULL,
    "sellerPickupAddress" text,
    "collectionFee" numeric(10,2),
    "isRuralCollection" boolean DEFAULT false NOT NULL,
    "shipmentProofUrl" text,
    "shippingReceiptImage" text,
    "shippingProductImage" text,
    "shippingNote" text,
    "shippedAt" timestamp without time zone,
    "agentId" character varying,
    "agentNote" text,
    "agentReceivedAt" timestamp without time zone,
    "deliveredAt" timestamp without time zone,
    "completedAt" timestamp without time zone,
    "fundsReleasedAt" timestamp without time zone,
    "autoConfirmAt" timestamp without time zone,
    "autoReleaseAt" timestamp without time zone,
    "platformFeePaid" boolean,
    "disputeReason" text,
    "disputeImage" text,
    "disputeResolution" text,
    "disputedAt" timestamp without time zone,
    "disputeOpenedAt" timestamp without time zone,
    "invoiceNumber" character varying,
    "confirmationToken" character varying,
    "confirmationTokenExpiry" timestamp without time zone,
    "buyerConfirmedAt" timestamp without time zone,
    "autoConfirmed" boolean DEFAULT false NOT NULL,
    "buyerRating" integer,
    "buyerReview" text,
    "reviewedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "buyerId" integer,
    "productId" integer,
    "sellerId" integer,
    "classifiedInvoiceId" integer,
    "sellerRated" boolean DEFAULT false NOT NULL,
    "superAgentRating" integer,
    "superAgentReview" text,
    "transportRating" integer,
    "transportReview" text,
    "commerceProfileId" integer,
    "classifiedInvoiceRequestId" integer,
    "paymentMethod" public.order_paymentmethod_enum DEFAULT 'online'::public.order_paymentmethod_enum NOT NULL,
    "codUpfrontAmount" numeric(12,2),
    "codRemainingBalance" numeric(12,2),
    "codBalanceCollected" boolean DEFAULT false NOT NULL,
    "codBalanceCollectedByAgentId" integer,
    "codBalanceCollectedAt" timestamp without time zone,
    "codTermsAcceptedAt" timestamp without time zone,
    "brandId" integer,
    "brandNameSnapshot" character varying,
    "productNameSnapshot" character varying,
    "modelSnapshot" character varying,
    "skuSnapshot" character varying,
    "variantAttributesSnapshot" jsonb
);


--
-- Name: order_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_id_seq OWNED BY public."order".id;


--
-- Name: parcel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parcel (
    id integer NOT NULL,
    "trackingNumber" character varying,
    status public.parcel_status_enum DEFAULT 'pending'::public.parcel_status_enum NOT NULL,
    "senderName" character varying,
    "senderPhone" character varying,
    "originCity" character varying NOT NULL,
    "destinationCity" character varying NOT NULL,
    "transitCity" character varying,
    "expectedArrival" date,
    "deliveryAddress" character varying,
    "buyerPhone" character varying,
    "recipientName" character varying,
    "localAgentId" character varying,
    "localAgentName" character varying,
    "claimedAt" timestamp without time zone,
    "courierCost" numeric(10,2),
    "courierCostReceipt" character varying,
    "transportRef" character varying,
    "agentNet" numeric(10,2),
    "costFlagged" boolean DEFAULT false NOT NULL,
    "costNote" text,
    "agentPaidOut" boolean DEFAULT false NOT NULL,
    "weightKg" numeric(8,2),
    "parcelSize" character varying,
    description text,
    "estimatedShippingFee" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "actualShippingFee" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "shippingMargin" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "superAgentEarnings" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "classifiedId" integer,
    "transportMethod" character varying,
    "busCompany" character varying,
    "busTicketNumber" character varying,
    "busDeparture" character varying,
    "courierName" character varying,
    "courierTrackingRef" character varying,
    "platformFeePaid" boolean DEFAULT false NOT NULL,
    "buyerRequestedDelivery" boolean,
    "agreedDeliveryFee" numeric(10,2),
    source character varying DEFAULT 'super_agent'::character varying NOT NULL,
    "parcelPhoto" character varying,
    "deliveryPhoto" character varying,
    "handoverTime" timestamp without time zone,
    "dispatchTime" timestamp without time zone,
    "arrivedAtHubTime" timestamp without time zone,
    "deliveredTime" timestamp without time zone,
    "deliveryCode" character varying,
    "buyerConfirmed" boolean DEFAULT false NOT NULL,
    "bulkShipmentId" integer,
    notes text,
    "disputeReason" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "orderId" integer,
    "sellerId" integer,
    "buyerId" integer,
    "superAgentId" integer,
    "destinationSuperAgentId" integer,
    "shipmentId" integer,
    "driverName" character varying,
    "driverPhone" character varying,
    "vehicleNumber" character varying,
    "platformFeeCharged" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "platformFeeWaived" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "saleId" integer,
    "declaredValue" numeric(12,2),
    "declaredValueCurrency" character varying(8) DEFAULT 'TZS'::character varying NOT NULL,
    "classifiedInvoiceId" integer
);


--
-- Name: parcel_collection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parcel_collection (
    id integer NOT NULL,
    "pickupAddress" text NOT NULL,
    city character varying NOT NULL,
    "isRural" boolean DEFAULT false NOT NULL,
    status public.parcel_collection_status_enum DEFAULT 'requested'::public.parcel_collection_status_enum NOT NULL,
    "collectionFee" numeric(10,2) DEFAULT '1500'::numeric NOT NULL,
    "agentPaidOut" boolean DEFAULT false NOT NULL,
    "claimedAt" timestamp without time zone,
    "collectedAt" timestamp without time zone,
    "handedOverAt" timestamp without time zone,
    notes text,
    "cancellationReason" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "orderId" integer NOT NULL,
    "parcelId" integer,
    "sellerId" integer NOT NULL,
    "agentId" integer
);


--
-- Name: parcel_collection_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parcel_collection_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parcel_collection_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parcel_collection_id_seq OWNED BY public.parcel_collection.id;


--
-- Name: parcel_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parcel_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parcel_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parcel_id_seq OWNED BY public.parcel.id;


--
-- Name: parcel_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parcel_tracking (
    id integer NOT NULL,
    status public.parcel_tracking_status_enum NOT NULL,
    city character varying,
    note text,
    "updatedBy" character varying,
    "handlerPhone" character varying,
    "handlerLocation" character varying,
    "handlerType" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "parcelId" integer
);


--
-- Name: parcel_tracking_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parcel_tracking_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parcel_tracking_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parcel_tracking_id_seq OWNED BY public.parcel_tracking.id;


--
-- Name: payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment (
    id integer NOT NULL,
    phone character varying NOT NULL,
    amount numeric(10,2) NOT NULL,
    provider character varying NOT NULL,
    status public.payment_status_enum DEFAULT 'pending'::public.payment_status_enum NOT NULL,
    "providerRequestId" character varying,
    "providerReference" character varying,
    "failureReason" text,
    metadata text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "orderId" integer,
    "userId" integer
);


--
-- Name: payment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_id_seq OWNED BY public.payment.id;


--
-- Name: payout; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payout (
    id integer NOT NULL,
    "orderTotal" numeric(10,2) NOT NULL,
    "platformFeeAmount" numeric(10,2) NOT NULL,
    "agentCommission" numeric(10,2) NOT NULL,
    "sellerAmount" numeric(10,2) NOT NULL,
    status public.payout_status_enum DEFAULT 'pending'::public.payout_status_enum NOT NULL,
    "paymentMethod" text,
    "transactionReference" text,
    notes text,
    "paidAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "sellerId" integer,
    "orderId" integer
);


--
-- Name: payout_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payout_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payout_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payout_id_seq OWNED BY public.payout.id;


--
-- Name: pickup_point; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pickup_point (
    id integer NOT NULL,
    "agentId" integer NOT NULL,
    "userId" integer NOT NULL,
    name character varying NOT NULL,
    address text NOT NULL,
    city character varying NOT NULL,
    landmark character varying,
    phone character varying,
    "openHours" character varying,
    latitude numeric(10,7),
    longitude numeric(10,7),
    status public.pickup_point_status_enum DEFAULT 'active'::public.pickup_point_status_enum NOT NULL,
    "totalPickups" integer DEFAULT 0 NOT NULL,
    rating numeric(3,2) DEFAULT '0'::numeric NOT NULL,
    "isVerified" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pickup_point_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pickup_point_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pickup_point_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pickup_point_id_seq OWNED BY public.pickup_point.id;


--
-- Name: policy_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_version (
    id integer NOT NULL,
    type public.policy_version_type_enum NOT NULL,
    version character varying NOT NULL,
    "effectiveDate" timestamp without time zone NOT NULL,
    status public.policy_version_status_enum DEFAULT 'draft'::public.policy_version_status_enum NOT NULL,
    "contentRef" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: policy_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.policy_version_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: policy_version_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.policy_version_id_seq OWNED BY public.policy_version.id;


--
-- Name: post_comment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_comment (
    id integer NOT NULL,
    "postId" integer,
    "entityType" character varying,
    "entityId" integer,
    "authorId" integer,
    body text,
    "offerEntityType" character varying,
    "offerEntityId" integer,
    "parentId" integer,
    "isDeleted" boolean DEFAULT false NOT NULL,
    type character varying(20) DEFAULT 'comment'::character varying NOT NULL,
    rating smallint,
    media jsonb,
    "purchaseVerification" character varying(20) DEFAULT 'none'::character varying NOT NULL,
    "helpfulCount" integer DEFAULT 0 NOT NULL,
    "isPinned" boolean DEFAULT false NOT NULL,
    "moderationFlag" character varying(20),
    "moderationReason" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "commerceProfileId" integer
);


--
-- Name: post_comment_helpful_vote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_comment_helpful_vote (
    id integer NOT NULL,
    "commentId" integer NOT NULL,
    "userId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: post_comment_helpful_vote_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.post_comment_helpful_vote_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: post_comment_helpful_vote_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.post_comment_helpful_vote_id_seq OWNED BY public.post_comment_helpful_vote.id;


--
-- Name: post_comment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.post_comment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: post_comment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.post_comment_id_seq OWNED BY public.post_comment.id;


--
-- Name: post_engagement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_engagement (
    id integer NOT NULL,
    "postId" integer,
    "entityType" character varying,
    "entityId" integer,
    "userId" integer NOT NULL,
    type public.post_engagement_type_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: post_engagement_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.post_engagement_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: post_engagement_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.post_engagement_id_seq OWNED BY public.post_engagement.id;


--
-- Name: product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product (
    id integer NOT NULL,
    name character varying NOT NULL,
    description text,
    "basePrice" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "deliveryFee" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "bodaFee" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "sellerCity" text DEFAULT 'Dar es Salaam'::text,
    "displayPrice" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    category text,
    subcategory text,
    model text,
    specs json,
    features json,
    images text,
    "isAvailable" boolean DEFAULT true NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "weightKg" numeric(10,2),
    "shippingMethod" public.product_shippingmethod_enum DEFAULT 'agent'::public.product_shippingmethod_enum NOT NULL,
    "estimatedDelivery" text,
    "shippingNotes" text,
    "isFeatured" boolean DEFAULT false NOT NULL,
    "isRecommended" boolean DEFAULT false NOT NULL,
    "salesCount" integer DEFAULT 0 NOT NULL,
    "viewsToday" integer DEFAULT 0 NOT NULL,
    "viewsResetDate" date,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "sellerId" integer,
    "commerceProfileId" integer,
    sku character varying,
    barcode character varying,
    "costPrice" numeric(10,2),
    "minStockThreshold" integer DEFAULT 0 NOT NULL,
    "availableOnline" boolean DEFAULT true NOT NULL,
    "availableInStore" boolean DEFAULT true NOT NULL,
    "productType" character varying DEFAULT 'physical'::character varying NOT NULL,
    "codEnabled" boolean DEFAULT false NOT NULL,
    "brandId" integer,
    "variantGroupId" integer,
    "variantAttributes" jsonb,
    "officialProductId" integer,
    "warrantyMonths" integer
);


--
-- Name: product_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_id_seq OWNED BY public.product.id;


--
-- Name: product_review; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_review (
    id integer NOT NULL,
    "productId" integer NOT NULL,
    "reviewerId" integer NOT NULL,
    rating integer NOT NULL,
    comment text,
    "isVerifiedPurchase" boolean DEFAULT false NOT NULL,
    "orderId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "commerceProfileId" integer
);


--
-- Name: product_review_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_review_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_review_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_review_id_seq OWNED BY public.product_review.id;


--
-- Name: product_serial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_serial (
    id integer NOT NULL,
    "productId" integer NOT NULL,
    "serialNumber" character varying NOT NULL,
    status public.product_serial_status_enum DEFAULT 'in_stock'::public.product_serial_status_enum NOT NULL,
    "soldReferenceType" character varying,
    "soldReferenceId" integer,
    "soldAt" timestamp without time zone,
    "registeredByUserId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: product_serial_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_serial_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_serial_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_serial_id_seq OWNED BY public.product_serial.id;


--
-- Name: product_variant_group; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variant_group (
    id integer NOT NULL,
    name character varying NOT NULL,
    "brandId" integer,
    "officialProductId" integer,
    category text NOT NULL,
    subcategory text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: product_variant_group_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_variant_group_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_variant_group_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_variant_group_id_seq OWNED BY public.product_variant_group.id;


--
-- Name: provider_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_availability (
    id integer NOT NULL,
    "providerId" integer NOT NULL,
    "routeId" integer,
    date date NOT NULL,
    "departureTime" character varying,
    "arrivalEstimate" character varying,
    "bookingDeadline" character varying,
    "totalSlots" integer DEFAULT 0 NOT NULL,
    "usedSlots" integer DEFAULT 0 NOT NULL,
    "totalCapacityKg" numeric(8,2) DEFAULT '0'::numeric NOT NULL,
    "usedCapacityKg" numeric(8,2) DEFAULT '0'::numeric NOT NULL,
    "fromCity" character varying,
    "toCity" character varying,
    status public.provider_availability_status_enum DEFAULT 'open'::public.provider_availability_status_enum NOT NULL,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: provider_availability_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.provider_availability_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: provider_availability_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.provider_availability_id_seq OWNED BY public.provider_availability.id;


--
-- Name: push_subscription; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscription (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    endpoint character varying NOT NULL,
    p256dh character varying NOT NULL,
    auth character varying NOT NULL,
    "userAgent" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: push_subscription_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.push_subscription_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: push_subscription_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.push_subscription_id_seq OWNED BY public.push_subscription.id;


--
-- Name: receipt_counter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipt_counter (
    id integer NOT NULL,
    year integer NOT NULL,
    "lastSequence" integer DEFAULT 0 NOT NULL
);


--
-- Name: receipt_counter_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.receipt_counter_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: receipt_counter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.receipt_counter_id_seq OWNED BY public.receipt_counter.id;


--
-- Name: referral; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral (
    id integer NOT NULL,
    "referralCodeUsed" character varying NOT NULL,
    status public.referral_status_enum DEFAULT 'registered'::public.referral_status_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "qualifiedAt" timestamp without time zone,
    "referrerSuperAgentId" integer,
    "referredUserId" integer
);


--
-- Name: referral_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.referral_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: referral_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.referral_id_seq OWNED BY public.referral.id;


--
-- Name: referral_reward; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_reward (
    id integer NOT NULL,
    "freeOrdersGranted" integer DEFAULT 10 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "referralId" integer,
    "superAgentId" integer
);


--
-- Name: referral_reward_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.referral_reward_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: referral_reward_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.referral_reward_id_seq OWNED BY public.referral_reward.id;


--
-- Name: reputation_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reputation_event (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "eventType" public.reputation_event_eventtype_enum NOT NULL,
    points integer NOT NULL,
    "scoreAfter" integer NOT NULL,
    "sourceEntityType" character varying,
    "sourceEntityId" integer,
    note text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "commerceProfileId" integer
);


--
-- Name: reputation_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reputation_event_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reputation_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reputation_event_id_seq OWNED BY public.reputation_event.id;


--
-- Name: review; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review (
    id integer NOT NULL,
    rating integer NOT NULL,
    comment text,
    verified boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "buyerId" integer,
    "sellerId" integer,
    "orderId" integer,
    "commerceProfileId" integer
);


--
-- Name: review_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.review_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: review_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.review_id_seq OWNED BY public.review.id;


--
-- Name: sale; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale (
    id integer NOT NULL,
    "sellerId" integer NOT NULL,
    channel public.sale_channel_enum NOT NULL,
    "receiptNumber" character varying NOT NULL,
    "customerId" integer,
    "customerName" character varying,
    "customerPhone" character varying,
    subtotal numeric(12,2) NOT NULL,
    "discountAmount" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) NOT NULL,
    "paymentMethod" public.sale_paymentmethod_enum NOT NULL,
    "amountPaid" numeric(12,2) NOT NULL,
    "changeDue" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    status public.sale_status_enum DEFAULT 'completed'::public.sale_status_enum NOT NULL,
    "voidedReason" character varying,
    "createdByUserId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "shipmentTrackingNumber" character varying,
    "isCod" boolean DEFAULT false NOT NULL,
    "balanceDue" numeric(12,2) DEFAULT '0'::numeric NOT NULL
);


--
-- Name: sale_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sale_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sale_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sale_id_seq OWNED BY public.sale.id;


--
-- Name: sale_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_item (
    id integer NOT NULL,
    "saleId" integer NOT NULL,
    "productId" integer,
    "productName" character varying NOT NULL,
    sku character varying,
    quantity integer NOT NULL,
    "unitPrice" numeric(12,2) NOT NULL,
    "lineDiscount" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "lineTotal" numeric(12,2) NOT NULL
);


--
-- Name: sale_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sale_item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sale_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sale_item_id_seq OWNED BY public.sale_item.id;


--
-- Name: search_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_embeddings (
    id integer NOT NULL,
    entity_type character varying(20) NOT NULL,
    entity_id integer NOT NULL,
    source_text text NOT NULL,
    embedding public.vector(1536) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: search_embeddings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.search_embeddings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: search_embeddings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.search_embeddings_id_seq OWNED BY public.search_embeddings.id;


--
-- Name: seller_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_profile (
    id integer NOT NULL,
    "businessName" character varying NOT NULL,
    "businessDescription" text,
    address text,
    phone text,
    logo text,
    status public.seller_profile_status_enum DEFAULT 'pending'::public.seller_profile_status_enum NOT NULL,
    "rejectionReason" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer,
    "verificationTier" public.seller_profile_verificationtier_enum DEFAULT 'registered'::public.seller_profile_verificationtier_enum NOT NULL,
    "businessCategory" character varying,
    "regionId" integer,
    "businessRegion" character varying,
    "districtId" integer,
    "businessDistrict" character varying,
    "wardId" integer,
    "businessCity" character varying,
    "registrationNumber" character varying,
    "freeOrdersGranted" integer DEFAULT 50 NOT NULL,
    "freeOrdersUsed" integer DEFAULT 0 NOT NULL,
    "paidOrders" integer DEFAULT 0 NOT NULL,
    "platformFeePerOrder" numeric(12,2) DEFAULT '1000'::numeric NOT NULL,
    "billingThreshold" numeric(12,2) DEFAULT '10000'::numeric NOT NULL,
    "outstandingBalance" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "sellerType" character varying,
    "tinNumber" character varying,
    "businessLicenseNumber" character varying,
    "businessDocumentsStatus" public.seller_profile_businessdocumentsstatus_enum DEFAULT 'not_submitted'::public.seller_profile_businessdocumentsstatus_enum NOT NULL,
    "businessId" integer
);


--
-- Name: seller_profile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seller_profile_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seller_profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.seller_profile_id_seq OWNED BY public.seller_profile.id;


--
-- Name: selling_capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.selling_capabilities (
    id integer NOT NULL,
    "capabilityType" public.selling_capabilities_capabilitytype_enum NOT NULL,
    "verificationLevel" public.selling_capabilities_verificationlevel_enum NOT NULL,
    status public.selling_capabilities_status_enum DEFAULT 'ACTIVE'::public.selling_capabilities_status_enum NOT NULL,
    "grantedAt" timestamp without time zone NOT NULL,
    "grantedBy" integer,
    "restrictedReason" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer,
    "commerceProfileId" integer
);


--
-- Name: selling_capabilities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.selling_capabilities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: selling_capabilities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.selling_capabilities_id_seq OWNED BY public.selling_capabilities.id;


--
-- Name: service_ad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_ad (
    id integer NOT NULL,
    "providerId" integer NOT NULL,
    title character varying NOT NULL,
    description text NOT NULL,
    category public.service_ad_category_enum NOT NULL,
    subcategory character varying,
    "priceType" public.service_ad_pricetype_enum DEFAULT 'negotiate'::public.service_ad_pricetype_enum NOT NULL,
    price numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "priceMax" numeric(10,2),
    "coverageCity" character varying NOT NULL,
    "coverageWards" text,
    "workingDays" text,
    "workingHours" character varying,
    "isAvailableNow" boolean DEFAULT true NOT NULL,
    images text,
    "totalJobs" integer DEFAULT 0 NOT NULL,
    rating numeric(3,2) DEFAULT '0'::numeric NOT NULL,
    "totalRatings" integer DEFAULT 0 NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    "whatsappPhone" character varying,
    status public.service_ad_status_enum DEFAULT 'active'::public.service_ad_status_enum NOT NULL,
    "isVerified" boolean DEFAULT false NOT NULL,
    "isAvailableForBooking" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "commerceProfileId" integer
);


--
-- Name: service_ad_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.service_ad_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: service_ad_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.service_ad_id_seq OWNED BY public.service_ad.id;


--
-- Name: service_provider; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_provider (
    id integer NOT NULL,
    "businessName" character varying NOT NULL,
    "businessDescription" text,
    "primaryCategory" public.service_provider_primarycategory_enum,
    city character varying,
    address text,
    "contactPhone" character varying,
    "whatsappPhone" character varying,
    website character varying,
    "logoUrl" text,
    "idType" character varying,
    "idNumber" character varying,
    "idPhotoUrl" text,
    "registrationNumber" character varying,
    status public.service_provider_status_enum DEFAULT 'pending'::public.service_provider_status_enum NOT NULL,
    "rejectionReason" text,
    "verifiedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer
);


--
-- Name: service_provider_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.service_provider_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: service_provider_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.service_provider_id_seq OWNED BY public.service_provider.id;


--
-- Name: shipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipment (
    id integer NOT NULL,
    "requestedByUserId" integer NOT NULL,
    "senderName" character varying,
    "senderPhone" character varying,
    "receiverName" character varying NOT NULL,
    "receiverPhone" character varying NOT NULL,
    "originCity" character varying NOT NULL,
    "originRegionId" integer,
    "originWard" character varying,
    "destinationCity" character varying NOT NULL,
    "destinationRegionId" integer,
    "destinationWard" character varying,
    "itemDescription" text NOT NULL,
    "weightKg" numeric(8,2) DEFAULT '0'::numeric NOT NULL,
    "routeId" integer,
    "availabilityId" integer,
    "providerId" integer,
    "pickupOption" public.shipment_pickupoption_enum DEFAULT 'agent'::public.shipment_pickupoption_enum NOT NULL,
    "deliveryOption" public.shipment_deliveryoption_enum DEFAULT 'agent'::public.shipment_deliveryoption_enum NOT NULL,
    "priceQuoted" numeric(10,2),
    "orderId" integer,
    status public.shipment_status_enum DEFAULT 'pending'::public.shipment_status_enum NOT NULL,
    "trackingNumber" character varying,
    "collectedAt" timestamp without time zone,
    "deliveredAt" timestamp without time zone,
    "completedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "originWardId" integer,
    "destinationWardId" integer
);


--
-- Name: shipment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shipment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shipment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shipment_id_seq OWNED BY public.shipment.id;


--
-- Name: shipping_rate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_rate (
    id integer NOT NULL,
    "originCity" character varying NOT NULL,
    "destinationCity" character varying NOT NULL,
    "ratePerKg" numeric(10,2) NOT NULL,
    "minimumCharge" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "estimatedDays" integer DEFAULT 3 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "superAgentId" integer
);


--
-- Name: shipping_rate_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shipping_rate_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shipping_rate_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shipping_rate_id_seq OWNED BY public.shipping_rate.id;


--
-- Name: sms_invite_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_invite_log (
    id integer NOT NULL,
    phone character varying NOT NULL,
    "lastInvitedAt" timestamp without time zone NOT NULL,
    "inviteCount" integer DEFAULT 1 NOT NULL,
    "lastEventType" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sms_invite_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sms_invite_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sms_invite_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sms_invite_log_id_seq OWNED BY public.sms_invite_log.id;


--
-- Name: super_agent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.super_agent (
    id integer NOT NULL,
    "businessName" character varying NOT NULL,
    city character varying NOT NULL,
    "cityCode" character varying,
    address text,
    phone character varying,
    "governmentId" character varying,
    "governmentIdImage" text,
    status public.super_agent_status_enum DEFAULT 'pending'::public.super_agent_status_enum NOT NULL,
    "rejectionReason" text,
    "shippingRates" jsonb DEFAULT '{}'::jsonb,
    "totalEarnings" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "pendingEarnings" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "withdrawableEarnings" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "commissionRate" numeric(5,2) DEFAULT '10'::numeric NOT NULL,
    "totalParcelsHandled" integer DEFAULT 0 NOT NULL,
    "totalParcelsDelivered" integer DEFAULT 0 NOT NULL,
    "totalParcelsLost" integer DEFAULT 0 NOT NULL,
    "totalParcelsDelayed" integer DEFAULT 0 NOT NULL,
    "totalComplaints" integer DEFAULT 0 NOT NULL,
    rating numeric(3,2) DEFAULT '5'::numeric NOT NULL,
    "totalRatings" integer DEFAULT 0 NOT NULL,
    "coverageCitiesOrigin" text,
    "coverageCitiesDestination" text,
    "agentCode" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer,
    "freeOrdersGranted" integer DEFAULT 50 NOT NULL,
    "freeOrdersUsed" integer DEFAULT 0 NOT NULL,
    "totalPlatformFeesCharged" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalPlatformFeesWaived" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "paidOrders" integer DEFAULT 0 NOT NULL,
    "platformFeePerOrder" numeric(12,2) DEFAULT '1000'::numeric NOT NULL,
    "billingThreshold" numeric(12,2) DEFAULT '10000'::numeric NOT NULL,
    "outstandingBalance" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "referralCode" character varying,
    "codCashHeld" numeric(12,2) DEFAULT '0'::numeric NOT NULL
);


--
-- Name: super_agent_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.super_agent_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: super_agent_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.super_agent_id_seq OWNED BY public.super_agent.id;


--
-- Name: transport_assignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transport_assignment (
    id integer NOT NULL,
    "trackingNumber" character varying,
    "orderId" integer,
    "parcelId" integer,
    "assignedById" integer NOT NULL,
    "providerId" integer NOT NULL,
    "availabilityId" integer,
    "fromCity" character varying,
    "toCity" character varying,
    status public.transport_assignment_status_enum DEFAULT 'pending'::public.transport_assignment_status_enum NOT NULL,
    "parcelCount" integer DEFAULT 1 NOT NULL,
    "weightKg" numeric(8,2) DEFAULT '0'::numeric NOT NULL,
    "agreedPrice" numeric(10,2),
    "acceptedAt" timestamp without time zone,
    "collectedAt" timestamp without time zone,
    "collectionProofUrl" character varying,
    "departedAt" timestamp without time zone,
    "departureProofUrl" character varying,
    "scheduledDeparture" character varying,
    "arrivedAt" timestamp without time zone,
    "arrivalProofUrl" character varying,
    "completedAt" timestamp without time zone,
    "providerNotes" text,
    "superAgentNotes" text,
    "declineReason" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "shipmentId" integer,
    "parcelRefId" integer,
    "orderRefId" integer,
    "shipmentRefId" integer
);


--
-- Name: transport_assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transport_assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transport_assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transport_assignment_id_seq OWNED BY public.transport_assignment.id;


--
-- Name: transport_provider; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transport_provider (
    id integer NOT NULL,
    "userId" integer,
    name character varying NOT NULL,
    "shortCode" character varying,
    type public.transport_provider_type_enum NOT NULL,
    status public.transport_provider_status_enum DEFAULT 'pending'::public.transport_provider_status_enum NOT NULL,
    "confirmMode" public.transport_provider_confirmmode_enum DEFAULT 'manual'::public.transport_provider_confirmmode_enum NOT NULL,
    "contactName" character varying,
    "contactPhone" character varying,
    "whatsappPhone" character varying,
    "contactEmail" character varying,
    website character varying,
    "registrationNumber" character varying,
    "licenseUrl" character varying,
    "logoUrl" character varying,
    description text,
    "defaultParcelCapacity" integer DEFAULT 0 NOT NULL,
    "defaultMaxWeightKg" numeric(8,2) DEFAULT '0'::numeric NOT NULL,
    cities text,
    "apiKey" character varying,
    "webhookEnabled" boolean DEFAULT false NOT NULL,
    "outboundWebhookUrl" character varying,
    "contractType" public.transport_provider_contracttype_enum DEFAULT 'free'::public.transport_provider_contracttype_enum NOT NULL,
    "monthlyFee" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "perParcelFee" numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    "totalParcelsTracked" integer DEFAULT 0 NOT NULL,
    "totalApiCalls" integer DEFAULT 0 NOT NULL,
    "lastApiCallAt" timestamp without time zone,
    "totalAssignments" integer DEFAULT 0 NOT NULL,
    "completedAssignments" integer DEFAULT 0 NOT NULL,
    rating numeric(3,2) DEFAULT '0'::numeric NOT NULL,
    "verifiedAt" timestamp without time zone,
    "rejectionReason" character varying,
    notes text,
    "adminNotes" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "totalRatings" integer DEFAULT 0 NOT NULL
);


--
-- Name: transport_provider_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transport_provider_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transport_provider_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transport_provider_id_seq OWNED BY public.transport_provider.id;


--
-- Name: transport_route; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transport_route (
    id integer NOT NULL,
    "providerId" integer NOT NULL,
    "routeType" public.transport_route_routetype_enum NOT NULL,
    "originCity" character varying,
    "destinationCity" character varying,
    "transitCities" text,
    "loopStops" text,
    "coverageWards" text,
    "coverageCity" character varying,
    "pricePerKg" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "fixedFee" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "estimatedHours" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "originRegionId" integer,
    "destinationRegionId" integer
);


--
-- Name: transport_route_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transport_route_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transport_route_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transport_route_id_seq OWNED BY public.transport_route.id;


--
-- Name: tz_district; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tz_district (
    id integer NOT NULL,
    name character varying NOT NULL,
    "nameSw" character varying,
    region_id integer NOT NULL,
    lat numeric(10,7),
    lng numeric(10,7),
    "isUrban" boolean DEFAULT true NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tz_district_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tz_district_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tz_district_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tz_district_id_seq OWNED BY public.tz_district.id;


--
-- Name: tz_region; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tz_region (
    id integer NOT NULL,
    name character varying NOT NULL,
    "nameSw" character varying,
    capital character varying,
    code character varying,
    lat numeric(10,7),
    lng numeric(10,7),
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tz_region_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tz_region_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tz_region_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tz_region_id_seq OWNED BY public.tz_region.id;


--
-- Name: tz_ward; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tz_ward (
    id integer NOT NULL,
    name character varying NOT NULL,
    "nameSw" character varying,
    district_id integer NOT NULL,
    region_id integer NOT NULL,
    lat numeric(10,7),
    lng numeric(10,7),
    "isUrban" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "densityClass" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tz_ward_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tz_ward_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tz_ward_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tz_ward_id_seq OWNED BY public.tz_ward.id;


--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    id integer NOT NULL,
    phone character varying,
    email character varying,
    password character varying NOT NULL,
    name character varying,
    role public.user_role_enum DEFAULT 'user'::public.user_role_enum NOT NULL,
    otp character varying,
    "otpExpiry" timestamp without time zone,
    "isVerified" boolean DEFAULT false NOT NULL,
    "otpAttempts" integer DEFAULT 0 NOT NULL,
    "storeName" character varying,
    "storeWhatsApp" character varying,
    "payoutMethod" character varying,
    "payoutAccountName" character varying,
    "payoutAccountNumber" character varying,
    "payoutBankName" character varying,
    "payoutBranchName" character varying,
    "storeTagline" character varying,
    "storeDescription" text,
    logo character varying,
    "coverImage" character varying,
    "businessLocation" character varying,
    "sellerPickupAddress" text,
    "businessHours" character varying,
    "pickupAvailable" boolean DEFAULT false NOT NULL,
    "freeDelivery" boolean DEFAULT false NOT NULL,
    "fastShipping" boolean DEFAULT false NOT NULL,
    "isOfficialStore" boolean DEFAULT false NOT NULL,
    "followersCount" integer DEFAULT 0 NOT NULL,
    "completedOrders" integer DEFAULT 0 NOT NULL,
    rating numeric(3,2) DEFAULT '0'::numeric NOT NULL,
    "reviewsCount" integer DEFAULT 0 NOT NULL,
    "reputationScore" integer DEFAULT 0 NOT NULL,
    "activeRoles" text,
    "kycLevel" character varying,
    bio character varying,
    city character varying,
    "onboardingCompleted" boolean DEFAULT false NOT NULL,
    interests text,
    "responseRate" integer DEFAULT 95 NOT NULL,
    "galleryImages" jsonb DEFAULT '[]'::jsonb,
    "activePromotion" jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "avatarUrl" character varying,
    "termsAcceptedVersion" character varying,
    "termsAcceptedAt" timestamp without time zone,
    "onboardingState" jsonb,
    "referredBySuperAgentId" integer
);


--
-- Name: user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_id_seq OWNED BY public."user".id;


--
-- Name: wallet; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    balance numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "pendingBalance" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalEarned" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalWithdrawn" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    currency character varying DEFAULT 'TZS'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: wallet_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallet_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wallet_id_seq OWNED BY public.wallet.id;


--
-- Name: wallet_transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_transaction (
    id integer NOT NULL,
    "walletId" integer NOT NULL,
    type public.wallet_transaction_type_enum NOT NULL,
    amount numeric(12,2) NOT NULL,
    "balanceAfter" numeric(12,2) NOT NULL,
    "referenceType" character varying,
    "referenceId" integer,
    status public.wallet_transaction_status_enum DEFAULT 'completed'::public.wallet_transaction_status_enum NOT NULL,
    note text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: wallet_transaction_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_transaction_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallet_transaction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wallet_transaction_id_seq OWNED BY public.wallet_transaction.id;


--
-- Name: warranty_claim; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_claim (
    id integer NOT NULL,
    "registrationId" integer NOT NULL,
    reason text NOT NULL,
    "evidenceImages" text,
    status public.warranty_claim_status_enum DEFAULT 'submitted'::public.warranty_claim_status_enum NOT NULL,
    "submittedBy" integer NOT NULL,
    "reviewedBy" integer,
    "reviewedAt" timestamp without time zone,
    resolution text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: warranty_claim_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_claim_audit_log (
    id integer NOT NULL,
    "previousStatus" character varying NOT NULL,
    "newStatus" character varying NOT NULL,
    "actorUserId" integer,
    reason text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "claimId" integer
);


--
-- Name: warranty_claim_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warranty_claim_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warranty_claim_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warranty_claim_audit_log_id_seq OWNED BY public.warranty_claim_audit_log.id;


--
-- Name: warranty_claim_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warranty_claim_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warranty_claim_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warranty_claim_id_seq OWNED BY public.warranty_claim.id;


--
-- Name: warranty_registration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_registration (
    id integer NOT NULL,
    "orderId" integer NOT NULL,
    "productId" integer NOT NULL,
    "buyerId" integer NOT NULL,
    "sellerId" integer NOT NULL,
    "brandId" integer,
    "serialNumber" character varying,
    "startDate" timestamp without time zone NOT NULL,
    "durationMonths" integer NOT NULL,
    "expiresAt" timestamp without time zone NOT NULL,
    status public.warranty_registration_status_enum DEFAULT 'active'::public.warranty_registration_status_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: warranty_registration_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warranty_registration_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warranty_registration_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warranty_registration_id_seq OWNED BY public.warranty_registration.id;


--
-- Name: wishlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wishlist (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "classifiedId" integer,
    note text,
    "savedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: wishlist_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wishlist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wishlist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wishlist_id_seq OWNED BY public.wishlist.id;


--
-- Name: activity_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_events ALTER COLUMN id SET DEFAULT nextval('public.activity_events_id_seq'::regclass);


--
-- Name: agent id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent ALTER COLUMN id SET DEFAULT nextval('public.agent_id_seq'::regclass);


--
-- Name: agent_transaction id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_transaction ALTER COLUMN id SET DEFAULT nextval('public.agent_transaction_id_seq'::regclass);


--
-- Name: ai_cost_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_cost_log ALTER COLUMN id SET DEFAULT nextval('public.ai_cost_log_id_seq'::regclass);


--
-- Name: ai_usage_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_log ALTER COLUMN id SET DEFAULT nextval('public.ai_usage_log_id_seq'::regclass);


--
-- Name: analytics_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_events ALTER COLUMN id SET DEFAULT nextval('public.analytics_events_id_seq'::regclass);


--
-- Name: analytics_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_sessions ALTER COLUMN id SET DEFAULT nextval('public.analytics_sessions_id_seq'::regclass);


--
-- Name: announcements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements ALTER COLUMN id SET DEFAULT nextval('public.announcements_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: batch_parcel id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_parcel ALTER COLUMN id SET DEFAULT nextval('public.batch_parcel_id_seq'::regclass);


--
-- Name: boda_rate_card id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boda_rate_card ALTER COLUMN id SET DEFAULT nextval('public.boda_rate_card_id_seq'::regclass);


--
-- Name: brand id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand ALTER COLUMN id SET DEFAULT nextval('public.brand_id_seq'::regclass);


--
-- Name: brand_authorization_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_authorization_audit_log ALTER COLUMN id SET DEFAULT nextval('public.brand_authorization_audit_log_id_seq'::regclass);


--
-- Name: brand_authorization_evidence id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_authorization_evidence ALTER COLUMN id SET DEFAULT nextval('public.brand_authorization_evidence_id_seq'::regclass);


--
-- Name: brand_distributor id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_distributor ALTER COLUMN id SET DEFAULT nextval('public.brand_distributor_id_seq'::regclass);


--
-- Name: bulk_shipment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_shipment ALTER COLUMN id SET DEFAULT nextval('public.bulk_shipment_id_seq'::regclass);


--
-- Name: business id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business ALTER COLUMN id SET DEFAULT nextval('public.business_id_seq'::regclass);


--
-- Name: business_brand_authorization id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_brand_authorization ALTER COLUMN id SET DEFAULT nextval('public.business_brand_authorization_id_seq'::regclass);


--
-- Name: business_customer id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_customer ALTER COLUMN id SET DEFAULT nextval('public.business_customer_id_seq'::regclass);


--
-- Name: business_document id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_document ALTER COLUMN id SET DEFAULT nextval('public.business_document_id_seq'::regclass);


--
-- Name: business_feed_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_feed_item ALTER COLUMN id SET DEFAULT nextval('public.business_feed_item_id_seq'::regclass);


--
-- Name: business_team_member id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_team_member ALTER COLUMN id SET DEFAULT nextval('public.business_team_member_id_seq'::regclass);


--
-- Name: classified id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classified ALTER COLUMN id SET DEFAULT nextval('public.classified_id_seq'::regclass);


--
-- Name: classified_invoice_request id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classified_invoice_request ALTER COLUMN id SET DEFAULT nextval('public.classified_invoice_request_id_seq'::regclass);


--
-- Name: commerce_profile id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_profile ALTER COLUMN id SET DEFAULT nextval('public.commerce_profile_id_seq'::regclass);


--
-- Name: commerce_profile_follow id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_profile_follow ALTER COLUMN id SET DEFAULT nextval('public.commerce_profile_follow_id_seq'::regclass);


--
-- Name: commerce_profile_member id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_profile_member ALTER COLUMN id SET DEFAULT nextval('public.commerce_profile_member_id_seq'::regclass);


--
-- Name: communication_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_log ALTER COLUMN id SET DEFAULT nextval('public.communication_log_id_seq'::regclass);


--
-- Name: communication_template id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_template ALTER COLUMN id SET DEFAULT nextval('public.communication_template_id_seq'::regclass);


--
-- Name: contact_message id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_message ALTER COLUMN id SET DEFAULT nextval('public.contact_message_id_seq'::regclass);


--
-- Name: conversation id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation ALTER COLUMN id SET DEFAULT nextval('public.conversation_id_seq'::regclass);


--
-- Name: conversation_message id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_message ALTER COLUMN id SET DEFAULT nextval('public.conversation_message_id_seq'::regclass);


--
-- Name: daily_batch id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_batch ALTER COLUMN id SET DEFAULT nextval('public.daily_batch_id_seq'::regclass);


--
-- Name: delivery_zone id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_zone ALTER COLUMN id SET DEFAULT nextval('public.delivery_zone_id_seq'::regclass);


--
-- Name: digital_product_assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_product_assets ALTER COLUMN id SET DEFAULT nextval('public.digital_product_assets_id_seq'::regclass);


--
-- Name: dispute id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute ALTER COLUMN id SET DEFAULT nextval('public.dispute_id_seq'::regclass);


--
-- Name: distributor id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distributor ALTER COLUMN id SET DEFAULT nextval('public.distributor_id_seq'::regclass);


--
-- Name: early_access_otp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.early_access_otp ALTER COLUMN id SET DEFAULT nextval('public.early_access_otp_id_seq'::regclass);


--
-- Name: early_access_registration id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.early_access_registration ALTER COLUMN id SET DEFAULT nextval('public.early_access_registration_id_seq'::regclass);


--
-- Name: follow id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow ALTER COLUMN id SET DEFAULT nextval('public.follow_id_seq'::regclass);


--
-- Name: identity_profile id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_profile ALTER COLUMN id SET DEFAULT nextval('public.identity_profile_id_seq'::regclass);


--
-- Name: identity_verification_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_verification_audit ALTER COLUMN id SET DEFAULT nextval('public.identity_verification_audit_id_seq'::regclass);


--
-- Name: intercity_route id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intercity_route ALTER COLUMN id SET DEFAULT nextval('public.intercity_route_id_seq'::regclass);


--
-- Name: inventory_movement id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movement ALTER COLUMN id SET DEFAULT nextval('public.inventory_movement_id_seq'::regclass);


--
-- Name: invoice id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice ALTER COLUMN id SET DEFAULT nextval('public.invoice_id_seq'::regclass);


--
-- Name: invoice_counter id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_counter ALTER COLUMN id SET DEFAULT nextval('public.invoice_counter_id_seq'::regclass);


--
-- Name: job_request id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_request ALTER COLUMN id SET DEFAULT nextval('public.job_request_id_seq'::regclass);


--
-- Name: notification id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification ALTER COLUMN id SET DEFAULT nextval('public.notification_id_seq'::regclass);


--
-- Name: offer id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer ALTER COLUMN id SET DEFAULT nextval('public.offer_id_seq'::regclass);


--
-- Name: official_product id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.official_product ALTER COLUMN id SET DEFAULT nextval('public.official_product_id_seq'::regclass);


--
-- Name: order id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order" ALTER COLUMN id SET DEFAULT nextval('public.order_id_seq'::regclass);


--
-- Name: parcel id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel ALTER COLUMN id SET DEFAULT nextval('public.parcel_id_seq'::regclass);


--
-- Name: parcel_collection id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel_collection ALTER COLUMN id SET DEFAULT nextval('public.parcel_collection_id_seq'::regclass);


--
-- Name: parcel_tracking id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel_tracking ALTER COLUMN id SET DEFAULT nextval('public.parcel_tracking_id_seq'::regclass);


--
-- Name: payment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment ALTER COLUMN id SET DEFAULT nextval('public.payment_id_seq'::regclass);


--
-- Name: payout id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout ALTER COLUMN id SET DEFAULT nextval('public.payout_id_seq'::regclass);


--
-- Name: pickup_point id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickup_point ALTER COLUMN id SET DEFAULT nextval('public.pickup_point_id_seq'::regclass);


--
-- Name: policy_version id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_version ALTER COLUMN id SET DEFAULT nextval('public.policy_version_id_seq'::regclass);


--
-- Name: post_comment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comment ALTER COLUMN id SET DEFAULT nextval('public.post_comment_id_seq'::regclass);


--
-- Name: post_comment_helpful_vote id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comment_helpful_vote ALTER COLUMN id SET DEFAULT nextval('public.post_comment_helpful_vote_id_seq'::regclass);


--
-- Name: post_engagement id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_engagement ALTER COLUMN id SET DEFAULT nextval('public.post_engagement_id_seq'::regclass);


--
-- Name: product id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product ALTER COLUMN id SET DEFAULT nextval('public.product_id_seq'::regclass);


--
-- Name: product_review id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_review ALTER COLUMN id SET DEFAULT nextval('public.product_review_id_seq'::regclass);


--
-- Name: product_serial id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_serial ALTER COLUMN id SET DEFAULT nextval('public.product_serial_id_seq'::regclass);


--
-- Name: product_variant_group id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant_group ALTER COLUMN id SET DEFAULT nextval('public.product_variant_group_id_seq'::regclass);


--
-- Name: provider_availability id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_availability ALTER COLUMN id SET DEFAULT nextval('public.provider_availability_id_seq'::regclass);


--
-- Name: push_subscription id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscription ALTER COLUMN id SET DEFAULT nextval('public.push_subscription_id_seq'::regclass);


--
-- Name: receipt_counter id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_counter ALTER COLUMN id SET DEFAULT nextval('public.receipt_counter_id_seq'::regclass);


--
-- Name: referral id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral ALTER COLUMN id SET DEFAULT nextval('public.referral_id_seq'::regclass);


--
-- Name: referral_reward id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_reward ALTER COLUMN id SET DEFAULT nextval('public.referral_reward_id_seq'::regclass);


--
-- Name: reputation_event id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reputation_event ALTER COLUMN id SET DEFAULT nextval('public.reputation_event_id_seq'::regclass);


--
-- Name: review id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review ALTER COLUMN id SET DEFAULT nextval('public.review_id_seq'::regclass);


--
-- Name: sale id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale ALTER COLUMN id SET DEFAULT nextval('public.sale_id_seq'::regclass);


--
-- Name: sale_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_item ALTER COLUMN id SET DEFAULT nextval('public.sale_item_id_seq'::regclass);


--
-- Name: search_embeddings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_embeddings ALTER COLUMN id SET DEFAULT nextval('public.search_embeddings_id_seq'::regclass);


--
-- Name: seller_profile id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_profile ALTER COLUMN id SET DEFAULT nextval('public.seller_profile_id_seq'::regclass);


--
-- Name: selling_capabilities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.selling_capabilities ALTER COLUMN id SET DEFAULT nextval('public.selling_capabilities_id_seq'::regclass);


--
-- Name: service_ad id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_ad ALTER COLUMN id SET DEFAULT nextval('public.service_ad_id_seq'::regclass);


--
-- Name: service_provider id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_provider ALTER COLUMN id SET DEFAULT nextval('public.service_provider_id_seq'::regclass);


--
-- Name: shipment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment ALTER COLUMN id SET DEFAULT nextval('public.shipment_id_seq'::regclass);


--
-- Name: shipping_rate id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_rate ALTER COLUMN id SET DEFAULT nextval('public.shipping_rate_id_seq'::regclass);


--
-- Name: sms_invite_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_invite_log ALTER COLUMN id SET DEFAULT nextval('public.sms_invite_log_id_seq'::regclass);


--
-- Name: super_agent id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super_agent ALTER COLUMN id SET DEFAULT nextval('public.super_agent_id_seq'::regclass);


--
-- Name: transport_assignment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_assignment ALTER COLUMN id SET DEFAULT nextval('public.transport_assignment_id_seq'::regclass);


--
-- Name: transport_provider id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_provider ALTER COLUMN id SET DEFAULT nextval('public.transport_provider_id_seq'::regclass);


--
-- Name: transport_route id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_route ALTER COLUMN id SET DEFAULT nextval('public.transport_route_id_seq'::regclass);


--
-- Name: tz_district id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tz_district ALTER COLUMN id SET DEFAULT nextval('public.tz_district_id_seq'::regclass);


--
-- Name: tz_region id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tz_region ALTER COLUMN id SET DEFAULT nextval('public.tz_region_id_seq'::regclass);


--
-- Name: tz_ward id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tz_ward ALTER COLUMN id SET DEFAULT nextval('public.tz_ward_id_seq'::regclass);


--
-- Name: user id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user" ALTER COLUMN id SET DEFAULT nextval('public.user_id_seq'::regclass);


--
-- Name: wallet id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet ALTER COLUMN id SET DEFAULT nextval('public.wallet_id_seq'::regclass);


--
-- Name: wallet_transaction id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transaction ALTER COLUMN id SET DEFAULT nextval('public.wallet_transaction_id_seq'::regclass);


--
-- Name: warranty_claim id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim ALTER COLUMN id SET DEFAULT nextval('public.warranty_claim_id_seq'::regclass);


--
-- Name: warranty_claim_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim_audit_log ALTER COLUMN id SET DEFAULT nextval('public.warranty_claim_audit_log_id_seq'::regclass);


--
-- Name: warranty_registration id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_registration ALTER COLUMN id SET DEFAULT nextval('public.warranty_registration_id_seq'::regclass);


--
-- Name: wishlist id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlist ALTER COLUMN id SET DEFAULT nextval('public.wishlist_id_seq'::regclass);


--
-- Name: commerce_profile_member PK_00d125c9c459d05f4f3df684d2e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_profile_member
    ADD CONSTRAINT "PK_00d125c9c459d05f4f3df684d2e" PRIMARY KEY (id);


--
-- Name: referral_reward PK_039e9361b7ea8c9a9e500ee6e1e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_reward
    ADD CONSTRAINT "PK_039e9361b7ea8c9a9e500ee6e1e" PRIMARY KEY (id);


--
-- Name: product_serial PK_03dd2b225bea67a76311a06aab3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_serial
    ADD CONSTRAINT "PK_03dd2b225bea67a76311a06aab3" PRIMARY KEY (id);


--
-- Name: push_subscription PK_07fc861c0d2c38c1b830fb9cb5d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscription
    ADD CONSTRAINT "PK_07fc861c0d2c38c1b830fb9cb5d" PRIMARY KEY (id);


--
-- Name: audit_log PK_07fefa57f7f5ab8fc3f52b3ed0b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY (id);


--
-- Name: business PK_0bd850da8dafab992e2e9b058e5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business
    ADD CONSTRAINT "PK_0bd850da8dafab992e2e9b058e5" PRIMARY KEY (id);


--
-- Name: agent PK_1000e989398c5d4ed585cf9a46f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent
    ADD CONSTRAINT "PK_1000e989398c5d4ed585cf9a46f" PRIMARY KEY (id);


--
-- Name: order PK_1031171c13130102495201e3e20; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT "PK_1031171c13130102495201e3e20" PRIMARY KEY (id);


--
-- Name: seller_profile PK_1455fd9c9540da78423b04567a1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_profile
    ADD CONSTRAINT "PK_1455fd9c9540da78423b04567a1" PRIMARY KEY (id);


--
-- Name: contact_message PK_1476ca9a6265a586f618ea918fd; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_message
    ADD CONSTRAINT "PK_1476ca9a6265a586f618ea918fd" PRIMARY KEY (id);


--
-- Name: invoice PK_15d25c200d9bcd8a33f698daf18; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT "PK_15d25c200d9bcd8a33f698daf18" PRIMARY KEY (id);


--
-- Name: classified PK_170e3a75d2aa846c3dd0b33a6da; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classified
    ADD CONSTRAINT "PK_170e3a75d2aa846c3dd0b33a6da" PRIMARY KEY (id);


--
-- Name: payout PK_1cb73ce021dc6618a3818b0a474; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout
    ADD CONSTRAINT "PK_1cb73ce021dc6618a3818b0a474" PRIMARY KEY (id);


--
-- Name: business_brand_authorization PK_1d7a723b74cb3ae6a3e8a068fb3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_brand_authorization
    ADD CONSTRAINT "PK_1d7a723b74cb3ae6a3e8a068fb3" PRIMARY KEY (id);


--
-- Name: digital_product_assets PK_218926aad80d8b74866fcaf9d08; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_product_assets
    ADD CONSTRAINT "PK_218926aad80d8b74866fcaf9d08" PRIMARY KEY (id);


--
-- Name: review PK_2e4299a343a81574217255c00ca; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review
    ADD CONSTRAINT "PK_2e4299a343a81574217255c00ca" PRIMARY KEY (id);


--
-- Name: conversation_message PK_2f8286c3560b52dba8428ac182e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_message
    ADD CONSTRAINT "PK_2f8286c3560b52dba8428ac182e" PRIMARY KEY (id);


--
-- Name: post_engagement PK_315b0d941aa7aa650d7fa71c013; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_engagement
    ADD CONSTRAINT "PK_315b0d941aa7aa650d7fa71c013" PRIMARY KEY (id);


--
-- Name: business_team_member PK_3194e0ed491b5cbd2f6fc70ee33; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_team_member
    ADD CONSTRAINT "PK_3194e0ed491b5cbd2f6fc70ee33" PRIMARY KEY (id);


--
-- Name: commerce_profile PK_365fda15271c63ccc4a02618a31; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_profile
    ADD CONSTRAINT "PK_365fda15271c63ccc4a02618a31" PRIMARY KEY (id);


--
-- Name: receipt_counter PK_3857e4455b2d81b506e23b75359; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_counter
    ADD CONSTRAINT "PK_3857e4455b2d81b506e23b75359" PRIMARY KEY (id);


--
-- Name: policy_version PK_3f434bba531e04026bd90fcf7c5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_version
    ADD CONSTRAINT "PK_3f434bba531e04026bd90fcf7c5" PRIMARY KEY (id);


--
-- Name: brand_authorization_evidence PK_3f723193af75af08d72b0953c6d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_authorization_evidence
    ADD CONSTRAINT "PK_3f723193af75af08d72b0953c6d" PRIMARY KEY (id);


--
-- Name: sms_invite_log PK_415a3b518e896bbe0478b26951e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_invite_log
    ADD CONSTRAINT "PK_415a3b518e896bbe0478b26951e" PRIMARY KEY (id);


--
-- Name: boda_rate_card PK_436c63e75e42298f896326cc796; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boda_rate_card
    ADD CONSTRAINT "PK_436c63e75e42298f896326cc796" PRIMARY KEY (id);


--
-- Name: sale_item PK_439a57a4a0d130329d3d2e671b6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_item
    ADD CONSTRAINT "PK_439a57a4a0d130329d3d2e671b6" PRIMARY KEY (id);


--
-- Name: identity_profile PK_45a43763a87e9551a1aea7f9b00; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_profile
    ADD CONSTRAINT "PK_45a43763a87e9551a1aea7f9b00" PRIMARY KEY (id);


--
-- Name: warranty_claim PK_45e4b1ef75168da967bfc4bd657; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim
    ADD CONSTRAINT "PK_45e4b1ef75168da967bfc4bd657" PRIMARY KEY (id);


--
-- Name: invoice_counter PK_4824560608e11b81debf3e225c2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_counter
    ADD CONSTRAINT "PK_4824560608e11b81debf3e225c2" PRIMARY KEY (id);


--
-- Name: super_agent PK_4d6e82a24af9e837f72d505165b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super_agent
    ADD CONSTRAINT "PK_4d6e82a24af9e837f72d505165b" PRIMARY KEY (id);


--
-- Name: commerce_profile_follow PK_566b265968d22af8bc58f00e60c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_profile_follow
    ADD CONSTRAINT "PK_566b265968d22af8bc58f00e60c" PRIMARY KEY (id);


--
-- Name: warranty_registration PK_5738beceb56409dbded1cc10be2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_registration
    ADD CONSTRAINT "PK_5738beceb56409dbded1cc10be2" PRIMARY KEY (id);


--
-- Name: offer PK_57c6ae1abe49201919ef68de900; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer
    ADD CONSTRAINT "PK_57c6ae1abe49201919ef68de900" PRIMARY KEY (id);


--
-- Name: post_comment PK_5a0d63e41c3c55e11319613550c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comment
    ADD CONSTRAINT "PK_5a0d63e41c3c55e11319613550c" PRIMARY KEY (id);


--
-- Name: analytics_events PK_5d643d67a09b55653e98616f421; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT "PK_5d643d67a09b55653e98616f421" PRIMARY KEY (id);


--
-- Name: identity_verification_audit PK_5dcbf05718ef58da9ce5e309f74; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_verification_audit
    ADD CONSTRAINT "PK_5dcbf05718ef58da9ce5e309f74" PRIMARY KEY (id);


--
-- Name: tz_ward PK_5e3d9681cc43b3c66ad9393ff23; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tz_ward
    ADD CONSTRAINT "PK_5e3d9681cc43b3c66ad9393ff23" PRIMARY KEY (id);


--
-- Name: wishlist PK_620bff4a240d66c357b5d820eaa; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT "PK_620bff4a240d66c357b5d820eaa" PRIMARY KEY (id);


--
-- Name: wallet_transaction PK_62a01b9c3a734b96a08c621b371; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transaction
    ADD CONSTRAINT "PK_62a01b9c3a734b96a08c621b371" PRIMARY KEY (id);


--
-- Name: brand_authorization_audit_log PK_69772a4b398f3fea80dec5eb318; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_authorization_audit_log
    ADD CONSTRAINT "PK_69772a4b398f3fea80dec5eb318" PRIMARY KEY (id);


--
-- Name: product_review PK_6c00bd3bbee662e1f7a97dbce9a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_review
    ADD CONSTRAINT "PK_6c00bd3bbee662e1f7a97dbce9a" PRIMARY KEY (id);


--
-- Name: shipping_rate PK_6c012cbd9d0c042d5874bc66f3c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_rate
    ADD CONSTRAINT "PK_6c012cbd9d0c042d5874bc66f3c" PRIMARY KEY (id);


--
-- Name: notification PK_705b6c7cdf9b2c2ff7ac7872cb7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT "PK_705b6c7cdf9b2c2ff7ac7872cb7" PRIMARY KEY (id);


--
-- Name: service_provider PK_7610a92ca242cb29d96009caa19; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_provider
    ADD CONSTRAINT "PK_7610a92ca242cb29d96009caa19" PRIMARY KEY (id);


--
-- Name: post_comment_helpful_vote PK_76e754b0827334561992f4e03f2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comment_helpful_vote
    ADD CONSTRAINT "PK_76e754b0827334561992f4e03f2" PRIMARY KEY (id);


--
-- Name: tz_district PK_7c1f54a20e882664d09447ee1fd; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tz_district
    ADD CONSTRAINT "PK_7c1f54a20e882664d09447ee1fd" PRIMARY KEY (id);


--
-- Name: communication_template PK_7d692c979781abeb65e1ec553b4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_template
    ADD CONSTRAINT "PK_7d692c979781abeb65e1ec553b4" PRIMARY KEY (id);


--
-- Name: intercity_route PK_7e848ed8f266a37e1f7b1ee58d0; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intercity_route
    ADD CONSTRAINT "PK_7e848ed8f266a37e1f7b1ee58d0" PRIMARY KEY (id);


--
-- Name: warranty_claim_audit_log PK_802e90289e3b0e34c88f0e95a27; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim_audit_log
    ADD CONSTRAINT "PK_802e90289e3b0e34c88f0e95a27" PRIMARY KEY (id);


--
-- Name: service_ad PK_80f9f4a5b819e0b08bc0419f918; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_ad
    ADD CONSTRAINT "PK_80f9f4a5b819e0b08bc0419f918" PRIMARY KEY (id);


--
-- Name: bulk_shipment PK_835940ef700b5d3765095a7814b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_shipment
    ADD CONSTRAINT "PK_835940ef700b5d3765095a7814b" PRIMARY KEY (id);


--
-- Name: transport_provider PK_846d3ff67d234c4a40fa449c987; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_provider
    ADD CONSTRAINT "PK_846d3ff67d234c4a40fa449c987" PRIMARY KEY (id);


--
-- Name: conversation PK_864528ec4274360a40f66c29845; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT "PK_864528ec4274360a40f66c29845" PRIMARY KEY (id);


--
-- Name: delivery_zone PK_8a390f981b91bfca80510b43511; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_zone
    ADD CONSTRAINT "PK_8a390f981b91bfca80510b43511" PRIMARY KEY (id);


--
-- Name: tz_region PK_8e01148cf61b8927f5018c2deef; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tz_region
    ADD CONSTRAINT "PK_8e01148cf61b8927f5018c2deef" PRIMARY KEY (id);


--
-- Name: pickup_point PK_9433b0417c214a3cd2fd39d402c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickup_point
    ADD CONSTRAINT "PK_9433b0417c214a3cd2fd39d402c" PRIMARY KEY (id);


--
-- Name: distributor PK_949c7e62bf60d4e6488f6f29b8d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distributor
    ADD CONSTRAINT "PK_949c7e62bf60d4e6488f6f29b8d" PRIMARY KEY (id);


--
-- Name: ai_cost_log PK_960c25c76dbac0e9c14a92d6566; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_cost_log
    ADD CONSTRAINT "PK_960c25c76dbac0e9c14a92d6566" PRIMARY KEY (id);


--
-- Name: transport_assignment PK_986d893e1f1d2aa23b0c1d94ccc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_assignment
    ADD CONSTRAINT "PK_986d893e1f1d2aa23b0c1d94ccc" PRIMARY KEY (id);


--
-- Name: reputation_event PK_9c385721158b69c5f10911595ae; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reputation_event
    ADD CONSTRAINT "PK_9c385721158b69c5f10911595ae" PRIMARY KEY (id);


--
-- Name: communication_log PK_9c870c124b618286693be17acd5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_log
    ADD CONSTRAINT "PK_9c870c124b618286693be17acd5" PRIMARY KEY (id);


--
-- Name: referral PK_a2d3e935a6591168066defec5ad; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral
    ADD CONSTRAINT "PK_a2d3e935a6591168066defec5ad" PRIMARY KEY (id);


--
-- Name: selling_capabilities PK_a4099599e9b8cfedf5d7dfe83ca; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.selling_capabilities
    ADD CONSTRAINT "PK_a4099599e9b8cfedf5d7dfe83ca" PRIMARY KEY (id);


--
-- Name: business_feed_item PK_a56a0921e28ced48ba5ac6425cc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_feed_item
    ADD CONSTRAINT "PK_a56a0921e28ced48ba5ac6425cc" PRIMARY KEY (id);


--
-- Name: brand PK_a5d20765ddd942eb5de4eee2d7f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand
    ADD CONSTRAINT "PK_a5d20765ddd942eb5de4eee2d7f" PRIMARY KEY (id);


--
-- Name: announcements PK_b3ad760876ff2e19d58e05dc8b0; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT "PK_b3ad760876ff2e19d58e05dc8b0" PRIMARY KEY (id);


--
-- Name: ai_usage_log PK_b51c8fcf98a77ad8bef55c91bd5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_log
    ADD CONSTRAINT "PK_b51c8fcf98a77ad8bef55c91bd5" PRIMARY KEY (id);


--
-- Name: provider_availability PK_b71cd0a5d4be0a7c6851c51a7b3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_availability
    ADD CONSTRAINT "PK_b71cd0a5d4be0a7c6851c51a7b3" PRIMARY KEY (id);


--
-- Name: batch_parcel PK_b8f2d36b12257ca0eb46350db63; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_parcel
    ADD CONSTRAINT "PK_b8f2d36b12257ca0eb46350db63" PRIMARY KEY (id);


--
-- Name: classified_invoice_request PK_ba7d443dcc2e3025e0a70cc7f82; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classified_invoice_request
    ADD CONSTRAINT "PK_ba7d443dcc2e3025e0a70cc7f82" PRIMARY KEY (id);


--
-- Name: job_request PK_be981b8f8d402409a3434ca5d4b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_request
    ADD CONSTRAINT "PK_be981b8f8d402409a3434ca5d4b" PRIMARY KEY (id);


--
-- Name: product PK_bebc9158e480b949565b4dc7a82; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT "PK_bebc9158e480b949565b4dc7a82" PRIMARY KEY (id);


--
-- Name: wallet PK_bec464dd8d54c39c54fd32e2334; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet
    ADD CONSTRAINT "PK_bec464dd8d54c39c54fd32e2334" PRIMARY KEY (id);


--
-- Name: parcel PK_c01e9fed31b7433a00942d506b1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel
    ADD CONSTRAINT "PK_c01e9fed31b7433a00942d506b1" PRIMARY KEY (id);


--
-- Name: user PK_cace4a159ff9f2512dd42373760; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY (id);


--
-- Name: brand_distributor PK_cf0ccfc16281f3a78ae55405060; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_distributor
    ADD CONSTRAINT "PK_cf0ccfc16281f3a78ae55405060" PRIMARY KEY (id);


--
-- Name: sale PK_d03891c457cbcd22974732b5de2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale
    ADD CONSTRAINT "PK_d03891c457cbcd22974732b5de2" PRIMARY KEY (id);


--
-- Name: daily_batch PK_d5527adf85d3970554c6b3573b1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_batch
    ADD CONSTRAINT "PK_d5527adf85d3970554c6b3573b1" PRIMARY KEY (id);


--
-- Name: transport_route PK_d66e051d043aa993e9096ff5c20; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_route
    ADD CONSTRAINT "PK_d66e051d043aa993e9096ff5c20" PRIMARY KEY (id);


--
-- Name: business_document PK_dc94b00b80a01b0e607a799c455; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_document
    ADD CONSTRAINT "PK_dc94b00b80a01b0e607a799c455" PRIMARY KEY (id);


--
-- Name: inventory_movement PK_e17362693c889da517444ad8fb5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movement
    ADD CONSTRAINT "PK_e17362693c889da517444ad8fb5" PRIMARY KEY (id);


--
-- Name: dispute PK_e2f1f4741f2094ce789b0a7c5b3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute
    ADD CONSTRAINT "PK_e2f1f4741f2094ce789b0a7c5b3" PRIMARY KEY (id);


--
-- Name: agent_transaction PK_e3d48de56d2981fef2cbc983601; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_transaction
    ADD CONSTRAINT "PK_e3d48de56d2981fef2cbc983601" PRIMARY KEY (id);


--
-- Name: official_product PK_e448aa60ea5c0eb7de6c9fb643d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.official_product
    ADD CONSTRAINT "PK_e448aa60ea5c0eb7de6c9fb643d" PRIMARY KEY (id);


--
-- Name: early_access_registration PK_ebdaafe24d4e26df91fa21764a0; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.early_access_registration
    ADD CONSTRAINT "PK_ebdaafe24d4e26df91fa21764a0" PRIMARY KEY (id);


--
-- Name: parcel_tracking PK_ed8eb44a405bb2035f929bc5747; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel_tracking
    ADD CONSTRAINT "PK_ed8eb44a405bb2035f929bc5747" PRIMARY KEY (id);


--
-- Name: business_customer PK_f50d568ea6c3e2cc51716548461; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_customer
    ADD CONSTRAINT "PK_f50d568ea6c3e2cc51716548461" PRIMARY KEY (id);


--
-- Name: shipment PK_f51f635db95c534ca206bf7a0a4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment
    ADD CONSTRAINT "PK_f51f635db95c534ca206bf7a0a4" PRIMARY KEY (id);


--
-- Name: product_variant_group PK_f556fc481b04b4fb06e596ca163; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant_group
    ADD CONSTRAINT "PK_f556fc481b04b4fb06e596ca163" PRIMARY KEY (id);


--
-- Name: analytics_sessions PK_f59fe99fa7ab028a655e2d18dcd; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_sessions
    ADD CONSTRAINT "PK_f59fe99fa7ab028a655e2d18dcd" PRIMARY KEY (id);


--
-- Name: activity_events PK_f8e8d9dbf64f93f58ae52b4a9e4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT "PK_f8e8d9dbf64f93f58ae52b4a9e4" PRIMARY KEY (id);


--
-- Name: parcel_collection PK_f9f3c5a5b9f2081063040586fbc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel_collection
    ADD CONSTRAINT "PK_f9f3c5a5b9f2081063040586fbc" PRIMARY KEY (id);


--
-- Name: payment PK_fcaec7df5adf9cac408c686b2ab; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT "PK_fcaec7df5adf9cac408c686b2ab" PRIMARY KEY (id);


--
-- Name: follow PK_fda88bc28a84d2d6d06e19df6e5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow
    ADD CONSTRAINT "PK_fda88bc28a84d2d6d06e19df6e5" PRIMARY KEY (id);


--
-- Name: early_access_otp PK_ff1c3d5e263f8641ba8cc9ff8fb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.early_access_otp
    ADD CONSTRAINT "PK_ff1c3d5e263f8641ba8cc9ff8fb" PRIMARY KEY (id);


--
-- Name: identity_profile REL_2f7b35d44a86d83aa6427c26ea; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_profile
    ADD CONSTRAINT "REL_2f7b35d44a86d83aa6427c26ea" UNIQUE ("userId");


--
-- Name: wallet REL_35472b1fe48b6330cd34970956; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet
    ADD CONSTRAINT "REL_35472b1fe48b6330cd34970956" UNIQUE ("userId");


--
-- Name: digital_product_assets REL_c20daca46fd86f57bfd0a26bd1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_product_assets
    ADD CONSTRAINT "REL_c20daca46fd86f57bfd0a26bd1" UNIQUE ("productId");


--
-- Name: seller_profile REL_c2b29aefac4072d2503cab6c0c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_profile
    ADD CONSTRAINT "REL_c2b29aefac4072d2503cab6c0c" UNIQUE ("userId");


--
-- Name: invoice REL_f494ce6746b91e9ec9562af485; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT "REL_f494ce6746b91e9ec9562af485" UNIQUE ("orderId");


--
-- Name: super_agent UQ_158e5b606ffbedb8debeb538ff1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super_agent
    ADD CONSTRAINT "UQ_158e5b606ffbedb8debeb538ff1" UNIQUE ("referralCode");


--
-- Name: warranty_registration UQ_1609d9a71503857f848c50b2dbc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_registration
    ADD CONSTRAINT "UQ_1609d9a71503857f848c50b2dbc" UNIQUE ("orderId");


--
-- Name: analytics_sessions UQ_250d9ae8197ebbdd69a5c9da1c5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_sessions
    ADD CONSTRAINT "UQ_250d9ae8197ebbdd69a5c9da1c5" UNIQUE ("sessionId");


--
-- Name: intercity_route UQ_2bee2534ad5e36fae7f7ef9f0bd; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intercity_route
    ADD CONSTRAINT "UQ_2bee2534ad5e36fae7f7ef9f0bd" UNIQUE ("originCity", "destinationCity");


--
-- Name: follow UQ_365057e9356cf87d2023bff2837; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow
    ADD CONSTRAINT "UQ_365057e9356cf87d2023bff2837" UNIQUE ("followerId", "sellerId");


--
-- Name: post_comment_helpful_vote UQ_3db84fab37fb8595ec0a8bf55be; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comment_helpful_vote
    ADD CONSTRAINT "UQ_3db84fab37fb8595ec0a8bf55be" UNIQUE ("commentId", "userId");


--
-- Name: identity_profile UQ_51f63e668ef15823ed584d27fcb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_profile
    ADD CONSTRAINT "UQ_51f63e668ef15823ed584d27fcb" UNIQUE ("idNumber");


--
-- Name: transport_provider UQ_7cc4ed03151e816be073ccafbcc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_provider
    ADD CONSTRAINT "UQ_7cc4ed03151e816be073ccafbcc" UNIQUE ("apiKey");


--
-- Name: commerce_profile UQ_7dd0c079d6c2dffae8ac67805ca; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_profile
    ADD CONSTRAINT "UQ_7dd0c079d6c2dffae8ac67805ca" UNIQUE (username);


--
-- Name: shipment UQ_7ff24933d56b16307681c3b67b4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment
    ADD CONSTRAINT "UQ_7ff24933d56b16307681c3b67b4" UNIQUE ("trackingNumber");


--
-- Name: user UQ_8e1f623798118e629b46a9e6299; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "UQ_8e1f623798118e629b46a9e6299" UNIQUE (phone);


--
-- Name: sale UQ_915287f9a6b7323483ebe8f89ab; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale
    ADD CONSTRAINT "UQ_915287f9a6b7323483ebe8f89ab" UNIQUE ("receiptNumber");


--
-- Name: communication_log UQ_99ae8002575b5809cfeea9ebfe3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_log
    ADD CONSTRAINT "UQ_99ae8002575b5809cfeea9ebfe3" UNIQUE ("eventType", "sourceType", "sourceId", "recipientUserId", "recipientRole", channel);


--
-- Name: classified_invoice_request UQ_99f55d125cc44cd1e1295957b7c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classified_invoice_request
    ADD CONSTRAINT "UQ_99f55d125cc44cd1e1295957b7c" UNIQUE ("orderRefId");


--
-- Name: commerce_profile_follow UQ_9ea5309c2688dc95060fed1231c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_profile_follow
    ADD CONSTRAINT "UQ_9ea5309c2688dc95060fed1231c" UNIQUE ("followerId", "commerceProfileId");


--
-- Name: sms_invite_log UQ_b1a3f71a0eb77e49fd1b74cf5f8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_invite_log
    ADD CONSTRAINT "UQ_b1a3f71a0eb77e49fd1b74cf5f8" UNIQUE (phone);


--
-- Name: order UQ_b62def2bd2948328f76287b02e7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT "UQ_b62def2bd2948328f76287b02e7" UNIQUE ("confirmationToken");


--
-- Name: product_serial UQ_b6de502e3908a7de148fb14485f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_serial
    ADD CONSTRAINT "UQ_b6de502e3908a7de148fb14485f" UNIQUE ("serialNumber");


--
-- Name: boda_rate_card UQ_ba0f1dc6833bd773eac03f804d3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boda_rate_card
    ADD CONSTRAINT "UQ_ba0f1dc6833bd773eac03f804d3" UNIQUE ("rateKey");


--
-- Name: classified_invoice_request UQ_ca0bb17744770446e74b6222abf; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classified_invoice_request
    ADD CONSTRAINT "UQ_ca0bb17744770446e74b6222abf" UNIQUE ("invoiceNumber");


--
-- Name: communication_template UQ_d4eeb0786d2b00e7f1dbc586bbe; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_template
    ADD CONSTRAINT "UQ_d4eeb0786d2b00e7f1dbc586bbe" UNIQUE ("eventType", channel, "recipientRole", language);


--
-- Name: invoice UQ_d7bed97fb47876e03fd7d7c285a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT "UQ_d7bed97fb47876e03fd7d7c285a" UNIQUE ("invoiceNumber");


--
-- Name: tz_region UQ_db9155be1ef25b5a709971106ca; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tz_region
    ADD CONSTRAINT "UQ_db9155be1ef25b5a709971106ca" UNIQUE (name);


--
-- Name: user UQ_e12875dfb3b1d92d7d7c5377e22; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE (email);


--
-- Name: parcel UQ_ec90506711a499d2dc486bc4d37; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel
    ADD CONSTRAINT "UQ_ec90506711a499d2dc486bc4d37" UNIQUE ("trackingNumber");


--
-- Name: brand UQ_f4436285f5d5785c7fb0b28b309; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand
    ADD CONSTRAINT "UQ_f4436285f5d5785c7fb0b28b309" UNIQUE (slug);


--
-- Name: search_embeddings search_embeddings_entity_type_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_embeddings
    ADD CONSTRAINT search_embeddings_entity_type_entity_id_key UNIQUE (entity_type, entity_id);


--
-- Name: search_embeddings search_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_embeddings
    ADD CONSTRAINT search_embeddings_pkey PRIMARY KEY (id);


--
-- Name: IDX_0a1d2a60fedb0f67305cbec4c2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_0a1d2a60fedb0f67305cbec4c2" ON public.activity_events USING btree ("actorId");


--
-- Name: IDX_1856408c7568f61e4524411fe8; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_1856408c7568f61e4524411fe8" ON public.early_access_registration USING btree (status);


--
-- Name: IDX_1d169a024d34c1e2090cb24c54; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_1d169a024d34c1e2090cb24c54" ON public.early_access_registration USING btree ("businessCategory");


--
-- Name: IDX_2d4b11bb9e7e7acbe63ea83acd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_2d4b11bb9e7e7acbe63ea83acd" ON public.policy_version USING btree (type, status);


--
-- Name: IDX_2dea6b42eb04ccc846896c9e95; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_2dea6b42eb04ccc846896c9e95" ON public.selling_capabilities USING btree ("commerceProfileId", "capabilityType");


--
-- Name: IDX_33e6a7bb6e9bb98fff6fcb35b0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_33e6a7bb6e9bb98fff6fcb35b0" ON public.post_comment USING btree ("entityType", "entityId");


--
-- Name: IDX_42589da045825b9fba75e0c51c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_42589da045825b9fba75e0c51c" ON public.analytics_events USING btree ("sessionId");


--
-- Name: IDX_5cb696c3048a45e09256d5685f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_5cb696c3048a45e09256d5685f" ON public.post_comment_helpful_vote USING btree ("commentId");


--
-- Name: IDX_5d128b669e9a31ec06eaa501af; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_5d128b669e9a31ec06eaa501af" ON public.early_access_registration USING btree (region);


--
-- Name: IDX_6f314bb60b147cd808748e6b76; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_6f314bb60b147cd808748e6b76" ON public.post_comment USING btree ("entityType", "entityId", "isPinned");


--
-- Name: IDX_77a68cf93fb163efabda926e7b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_77a68cf93fb163efabda926e7b" ON public.activity_events USING btree ("businessId");


--
-- Name: IDX_7a09a92c169c7e52e7920f07c8; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7a09a92c169c7e52e7920f07c8" ON public.audit_log USING btree ("entityId");


--
-- Name: IDX_829453378ebe1d409a05cb666b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_829453378ebe1d409a05cb666b" ON public.early_access_registration USING btree ("isDeleted", status);


--
-- Name: IDX_912e1a6815f864d5142e165f57; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_912e1a6815f864d5142e165f57" ON public.analytics_events USING btree ("eventType");


--
-- Name: IDX_a38b80510315de9a6457e91985; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a38b80510315de9a6457e91985" ON public.activity_events USING btree ("eventType");


--
-- Name: IDX_a7a796dedfa7490aea283680b2; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_a7a796dedfa7490aea283680b2" ON public.post_engagement USING btree ("entityType", "entityId", "userId", type);


--
-- Name: IDX_a81a78f22ca1ffa7f8e9c4131c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a81a78f22ca1ffa7f8e9c4131c" ON public.activity_events USING btree (category);


--
-- Name: IDX_a9167ce3c8c772f020ddba8aba; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a9167ce3c8c772f020ddba8aba" ON public.activity_events USING btree ("createdAt");


--
-- Name: IDX_ac0bf9c2f42f2e12b316c5d91d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ac0bf9c2f42f2e12b316c5d91d" ON public.early_access_registration USING btree ("accountType");


--
-- Name: IDX_b03e2e8eef2766e6ed730a86d6; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_b03e2e8eef2766e6ed730a86d6" ON public.referral USING btree ("referredUserId");


--
-- Name: IDX_b35b05c4d0286d7f0e5ec3be83; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b35b05c4d0286d7f0e5ec3be83" ON public.audit_log USING btree ("entityType");


--
-- Name: IDX_c26490e26dd2056aecce50ce34; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c26490e26dd2056aecce50ce34" ON public.early_access_registration USING btree ("createdAt");


--
-- Name: IDX_c7fb3b0d1192f17f7649062f67; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c7fb3b0d1192f17f7649062f67" ON public.post_comment USING btree ("postId");


--
-- Name: IDX_cb2b05ed338428aaa2cf4d4085; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cb2b05ed338428aaa2cf4d4085" ON public.post_comment USING btree ("entityType", "entityId", type, "isDeleted");


--
-- Name: IDX_cb6aa6f6fd56f08eafb6031622; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cb6aa6f6fd56f08eafb6031622" ON public.audit_log USING btree ("actorId");


--
-- Name: IDX_ddb13aa0cd6b4d0c61bc3682d2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ddb13aa0cd6b4d0c61bc3682d2" ON public.analytics_events USING btree ("createdAt");


--
-- Name: IDX_eda5e85ebc2208aadc8ff2260e; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_eda5e85ebc2208aadc8ff2260e" ON public.early_access_registration USING btree ("editToken");


--
-- Name: IDX_f34b9a78a842983f1c73ba78d8; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_f34b9a78a842983f1c73ba78d8" ON public.post_engagement USING btree ("postId", "userId", type);


--
-- Name: IDX_feac4c1b3163aab54535e88316; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_feac4c1b3163aab54535e88316" ON public.early_access_otp USING btree (phone);


--
-- Name: idx_business_customer_unique_registered_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_business_customer_unique_registered_buyer ON public.business_customer USING btree (seller_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_conversation_unique_no_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_conversation_unique_no_profile ON public.conversation USING btree (seller_id, customer_id) WHERE ("commerceProfileId" IS NULL);


--
-- Name: idx_conversation_unique_with_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_conversation_unique_with_profile ON public.conversation USING btree (seller_id, customer_id, "commerceProfileId") WHERE ("commerceProfileId" IS NOT NULL);


--
-- Name: product_review FK_06e7335708b5e7870f1eaa608d2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_review
    ADD CONSTRAINT "FK_06e7335708b5e7870f1eaa608d2" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: wallet_transaction FK_07de5136ba8e92bb97d45b9a7af; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transaction
    ADD CONSTRAINT "FK_07de5136ba8e92bb97d45b9a7af" FOREIGN KEY ("walletId") REFERENCES public.wallet(id) ON DELETE CASCADE;


--
-- Name: review FK_0baa298910cdf7c39093641a1cb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review
    ADD CONSTRAINT "FK_0baa298910cdf7c39093641a1cb" FOREIGN KEY ("buyerId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: payout FK_0c14dd963bda08a149f70323ce0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout
    ADD CONSTRAINT "FK_0c14dd963bda08a149f70323ce0" FOREIGN KEY ("orderId") REFERENCES public."order"(id) ON DELETE CASCADE;


--
-- Name: agent FK_15baaa1eb6dd8d1f0a92a17d667; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent
    ADD CONSTRAINT "FK_15baaa1eb6dd8d1f0a92a17d667" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: warranty_registration FK_1609d9a71503857f848c50b2dbc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_registration
    ADD CONSTRAINT "FK_1609d9a71503857f848c50b2dbc" FOREIGN KEY ("orderId") REFERENCES public."order"(id) ON DELETE CASCADE;


--
-- Name: transport_assignment FK_1955164bbdf634ee919365c8107; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_assignment
    ADD CONSTRAINT "FK_1955164bbdf634ee919365c8107" FOREIGN KEY ("assignedById") REFERENCES public."user"(id);


--
-- Name: announcements FK_197a06ce0989e489974fdc26ca8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT "FK_197a06ce0989e489974fdc26ca8" FOREIGN KEY ("createdById") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: post_engagement FK_19b3d5ae6773210ef1df4e071b9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_engagement
    ADD CONSTRAINT "FK_19b3d5ae6773210ef1df4e071b9" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: referral FK_1e485a4b6912a1a9803f657a488; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral
    ADD CONSTRAINT "FK_1e485a4b6912a1a9803f657a488" FOREIGN KEY ("referrerSuperAgentId") REFERENCES public.super_agent(id) ON DELETE CASCADE;


--
-- Name: identity_verification_audit FK_1ec329fb10c38d987ed6794df77; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_verification_audit
    ADD CONSTRAINT "FK_1ec329fb10c38d987ed6794df77" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: parcel FK_1fdfafe92df00372e629baf6529; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel
    ADD CONSTRAINT "FK_1fdfafe92df00372e629baf6529" FOREIGN KEY ("destinationSuperAgentId") REFERENCES public.super_agent(id) ON DELETE SET NULL;


--
-- Name: order FK_20981b2b68bf03393c44dd1b9d7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT "FK_20981b2b68bf03393c44dd1b9d7" FOREIGN KEY ("buyerId") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: commerce_profile_member FK_20d09d31462dee35a1a03d19f73; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_profile_member
    ADD CONSTRAINT "FK_20d09d31462dee35a1a03d19f73" FOREIGN KEY ("userId") REFERENCES public."user"(id);


--
-- Name: brand_authorization_audit_log FK_26549395147c621b22229228c02; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_authorization_audit_log
    ADD CONSTRAINT "FK_26549395147c621b22229228c02" FOREIGN KEY ("authorizationId") REFERENCES public.business_brand_authorization(id) ON DELETE CASCADE;


--
-- Name: offer FK_2744d0ba7307ee9a1b981b73069; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer
    ADD CONSTRAINT "FK_2744d0ba7307ee9a1b981b73069" FOREIGN KEY ("buyerId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: agent_transaction FK_279201829ba2dc76d2d2ea20665; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_transaction
    ADD CONSTRAINT "FK_279201829ba2dc76d2d2ea20665" FOREIGN KEY ("invoiceId") REFERENCES public.invoice(id) ON DELETE CASCADE;


--
-- Name: transport_assignment FK_287b8295f040c06134fb3d3d7d2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_assignment
    ADD CONSTRAINT "FK_287b8295f040c06134fb3d3d7d2" FOREIGN KEY ("availabilityId") REFERENCES public.provider_availability(id);


--
-- Name: post_engagement FK_2963787c54ba25569f59e302ce0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_engagement
    ADD CONSTRAINT "FK_2963787c54ba25569f59e302ce0" FOREIGN KEY ("postId") REFERENCES public.business_feed_item(id) ON DELETE CASCADE;


--
-- Name: tz_district FK_2da644e4b04acb67a95a47f6e38; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tz_district
    ADD CONSTRAINT "FK_2da644e4b04acb67a95a47f6e38" FOREIGN KEY (region_id) REFERENCES public.tz_region(id);


--
-- Name: agent_transaction FK_2dbb4ba4d7e27d171c0177c88d6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_transaction
    ADD CONSTRAINT "FK_2dbb4ba4d7e27d171c0177c88d6" FOREIGN KEY ("agentId") REFERENCES public.agent(id) ON DELETE CASCADE;


--
-- Name: identity_profile FK_2f7b35d44a86d83aa6427c26ea7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_profile
    ADD CONSTRAINT "FK_2f7b35d44a86d83aa6427c26ea7" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: brand_authorization_evidence FK_317ad31efcfe7f951bed3857536; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_authorization_evidence
    ADD CONSTRAINT "FK_317ad31efcfe7f951bed3857536" FOREIGN KEY ("authorizationId") REFERENCES public.business_brand_authorization(id) ON DELETE CASCADE;


--
-- Name: review FK_31db76b2d6dfe81d69e27b66c20; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review
    ADD CONSTRAINT "FK_31db76b2d6dfe81d69e27b66c20" FOREIGN KEY ("orderId") REFERENCES public."order"(id) ON DELETE SET NULL;


--
-- Name: wallet FK_35472b1fe48b6330cd349709564; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet
    ADD CONSTRAINT "FK_35472b1fe48b6330cd349709564" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: transport_provider FK_37869be7907f6d5ca3abb8fb705; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_provider
    ADD CONSTRAINT "FK_37869be7907f6d5ca3abb8fb705" FOREIGN KEY ("userId") REFERENCES public."user"(id);


--
-- Name: conversation_message FK_37a1347d6dd72a06a19b99bfe20; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_message
    ADD CONSTRAINT "FK_37a1347d6dd72a06a19b99bfe20" FOREIGN KEY (sender_id) REFERENCES public."user"(id);


--
-- Name: classified_invoice_request FK_390b8c5f2d8344b73f04f94a8f4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classified_invoice_request
    ADD CONSTRAINT "FK_390b8c5f2d8344b73f04f94a8f4" FOREIGN KEY ("sellerId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: selling_capabilities FK_396e3d779426d2efdf441ddf2da; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.selling_capabilities
    ADD CONSTRAINT "FK_396e3d779426d2efdf441ddf2da" FOREIGN KEY ("commerceProfileId") REFERENCES public.commerce_profile(id) ON DELETE CASCADE;


--
-- Name: transport_route FK_3b405bb1b0b0e999db33f5074ae; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_route
    ADD CONSTRAINT "FK_3b405bb1b0b0e999db33f5074ae" FOREIGN KEY ("providerId") REFERENCES public.transport_provider(id) ON DELETE CASCADE;


--
-- Name: parcel FK_3d8619e34587053a298cebc65a6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel
    ADD CONSTRAINT "FK_3d8619e34587053a298cebc65a6" FOREIGN KEY ("buyerId") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: product_review FK_3fb05876093909632bd51f2309c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_review
    ADD CONSTRAINT "FK_3fb05876093909632bd51f2309c" FOREIGN KEY ("reviewerId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: parcel_collection FK_40fb47380bb1d103b6cb85aceca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel_collection
    ADD CONSTRAINT "FK_40fb47380bb1d103b6cb85aceca" FOREIGN KEY ("sellerId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: parcel FK_41f0f8a20863fa03ab685a19fac; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel
    ADD CONSTRAINT "FK_41f0f8a20863fa03ab685a19fac" FOREIGN KEY ("sellerId") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: analytics_events FK_42589da045825b9fba75e0c51c9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT "FK_42589da045825b9fba75e0c51c9" FOREIGN KEY ("sessionId") REFERENCES public.analytics_sessions(id) ON DELETE CASCADE;


--
-- Name: service_ad FK_46f65570000317c6a1bbe0dcebc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_ad
    ADD CONSTRAINT "FK_46f65570000317c6a1bbe0dcebc" FOREIGN KEY ("providerId") REFERENCES public."user"(id);


--
-- Name: classified_invoice_request FK_487e8588d7d8ade48dfb1741790; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classified_invoice_request
    ADD CONSTRAINT "FK_487e8588d7d8ade48dfb1741790" FOREIGN KEY ("classifiedId") REFERENCES public.classified(id) ON DELETE CASCADE;


--
-- Name: commerce_profile FK_48d3a63cd0004af826769711b3e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_profile
    ADD CONSTRAINT "FK_48d3a63cd0004af826769711b3e" FOREIGN KEY ("ownerId") REFERENCES public."user"(id);


--
-- Name: super_agent FK_4a28c22570d00e1ce43bd961945; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super_agent
    ADD CONSTRAINT "FK_4a28c22570d00e1ce43bd961945" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: review FK_4afd4e629c7e065272b3932617d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review
    ADD CONSTRAINT "FK_4afd4e629c7e065272b3932617d" FOREIGN KEY ("sellerId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: parcel FK_4c5ad9e141fe9d64a717fcc2a94; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel
    ADD CONSTRAINT "FK_4c5ad9e141fe9d64a717fcc2a94" FOREIGN KEY ("superAgentId") REFERENCES public.super_agent(id) ON DELETE SET NULL;


--
-- Name: business_document FK_4d5a96d505e7711d82a59876378; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_document
    ADD CONSTRAINT "FK_4d5a96d505e7711d82a59876378" FOREIGN KEY ("sellerProfileId") REFERENCES public.seller_profile(id) ON DELETE CASCADE;


--
-- Name: parcel_collection FK_50a7380545dcd9fc95567dbd23f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel_collection
    ADD CONSTRAINT "FK_50a7380545dcd9fc95567dbd23f" FOREIGN KEY ("agentId") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: job_request FK_50ecd121915826bc9a30e299071; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_request
    ADD CONSTRAINT "FK_50ecd121915826bc9a30e299071" FOREIGN KEY ("buyerId") REFERENCES public."user"(id);


--
-- Name: follow FK_550dce89df9570f251b6af2665a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow
    ADD CONSTRAINT "FK_550dce89df9570f251b6af2665a" FOREIGN KEY ("followerId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: delivery_zone FK_55a262c701b55087bd05db8dae0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_zone
    ADD CONSTRAINT "FK_55a262c701b55087bd05db8dae0" FOREIGN KEY ("zoneAgentId") REFERENCES public.super_agent(id) ON DELETE SET NULL;


--
-- Name: sale_item FK_59208ed392dd61056abbcf1482e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_item
    ADD CONSTRAINT "FK_59208ed392dd61056abbcf1482e" FOREIGN KEY ("saleId") REFERENCES public.sale(id) ON DELETE CASCADE;


--
-- Name: business_brand_authorization FK_5ccb14e5881c5be79594ad60903; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_brand_authorization
    ADD CONSTRAINT "FK_5ccb14e5881c5be79594ad60903" FOREIGN KEY ("brandId") REFERENCES public.brand(id) ON DELETE CASCADE;


--
-- Name: batch_parcel FK_5cfced50531350d7143746339c1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_parcel
    ADD CONSTRAINT "FK_5cfced50531350d7143746339c1" FOREIGN KEY ("zoneId") REFERENCES public.delivery_zone(id);


--
-- Name: brand_distributor FK_5e3ed4d4dfed842b91b1486a19e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_distributor
    ADD CONSTRAINT "FK_5e3ed4d4dfed842b91b1486a19e" FOREIGN KEY ("brandId") REFERENCES public.brand(id) ON DELETE CASCADE;


--
-- Name: bulk_shipment FK_5eb98cd39c1789cf7ad35b0a05f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_shipment
    ADD CONSTRAINT "FK_5eb98cd39c1789cf7ad35b0a05f" FOREIGN KEY ("superAgentId") REFERENCES public.super_agent(id) ON DELETE SET NULL;


--
-- Name: service_provider FK_5f099baafb6f88454b6a7b28b87; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_provider
    ADD CONSTRAINT "FK_5f099baafb6f88454b6a7b28b87" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: business_brand_authorization FK_63d8510bb64cff9db02f9d9f641; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_brand_authorization
    ADD CONSTRAINT "FK_63d8510bb64cff9db02f9d9f641" FOREIGN KEY ("distributorId") REFERENCES public.distributor(id) ON DELETE SET NULL;


--
-- Name: conversation FK_65637d1545db470a1a447b8abca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT "FK_65637d1545db470a1a447b8abca" FOREIGN KEY (seller_id) REFERENCES public."user"(id);


--
-- Name: brand_distributor FK_6a49ff44453d228f52afe3e5ace; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_distributor
    ADD CONSTRAINT "FK_6a49ff44453d228f52afe3e5ace" FOREIGN KEY ("distributorId") REFERENCES public.distributor(id) ON DELETE CASCADE;


--
-- Name: commerce_profile_member FK_6ce7e0331f017468fb6b2fa9812; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_profile_member
    ADD CONSTRAINT "FK_6ce7e0331f017468fb6b2fa9812" FOREIGN KEY ("profileId") REFERENCES public.commerce_profile(id);


--
-- Name: provider_availability FK_76f60b3375b905c57c142322e70; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_availability
    ADD CONSTRAINT "FK_76f60b3375b905c57c142322e70" FOREIGN KEY ("routeId") REFERENCES public.transport_route(id) ON DELETE CASCADE;


--
-- Name: parcel_collection FK_7a3f834dc0bb9f1d500bda3931b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel_collection
    ADD CONSTRAINT "FK_7a3f834dc0bb9f1d500bda3931b" FOREIGN KEY ("parcelId") REFERENCES public.parcel(id) ON DELETE SET NULL;


--
-- Name: post_comment FK_8018bc65c89f9b88fdb38d02710; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comment
    ADD CONSTRAINT "FK_8018bc65c89f9b88fdb38d02710" FOREIGN KEY ("parentId") REFERENCES public.post_comment(id) ON DELETE CASCADE;


--
-- Name: sale FK_8107fa8e7838a1882adab4564be; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale
    ADD CONSTRAINT "FK_8107fa8e7838a1882adab4564be" FOREIGN KEY ("sellerId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: dispute FK_81f22bb5160bb333f5a4347a365; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute
    ADD CONSTRAINT "FK_81f22bb5160bb333f5a4347a365" FOREIGN KEY ("arbitratorId") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: business_customer FK_83575a9c4865aa9c7c3338724cc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_customer
    ADD CONSTRAINT "FK_83575a9c4865aa9c7c3338724cc" FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: pickup_point FK_86ef0fdf3c5a06005f11f96942c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickup_point
    ADD CONSTRAINT "FK_86ef0fdf3c5a06005f11f96942c" FOREIGN KEY ("agentId") REFERENCES public.agent(id) ON DELETE CASCADE;


--
-- Name: order FK_88991860e839c6153a7ec878d39; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT "FK_88991860e839c6153a7ec878d39" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE SET NULL;


--
-- Name: business_customer FK_8987011154fbe2ed702719ab067; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_customer
    ADD CONSTRAINT "FK_8987011154fbe2ed702719ab067" FOREIGN KEY (seller_id) REFERENCES public."user"(id);


--
-- Name: push_subscription FK_8a227cbc3dc43c0d56117ea1563; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscription
    ADD CONSTRAINT "FK_8a227cbc3dc43c0d56117ea1563" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: order FK_8a583acc24e13bcf84b1b9d0d20; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT "FK_8a583acc24e13bcf84b1b9d0d20" FOREIGN KEY ("sellerId") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: conversation FK_8cb887e01c7aa9c10555da04aff; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT "FK_8cb887e01c7aa9c10555da04aff" FOREIGN KEY (customer_id) REFERENCES public.business_customer(id);


--
-- Name: follow FK_8fb9092e93201965235f698940f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow
    ADD CONSTRAINT "FK_8fb9092e93201965235f698940f" FOREIGN KEY ("sellerId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: notification FK_928b7aa1754e08e1ed7052cb9d8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT "FK_928b7aa1754e08e1ed7052cb9d8" FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: classified_invoice_request FK_96dbc61b0a52a4ea75a8c610df9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classified_invoice_request
    ADD CONSTRAINT "FK_96dbc61b0a52a4ea75a8c610df9" FOREIGN KEY ("buyerId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: business_team_member FK_98ebcbfabc7e92df4eba976428f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_team_member
    ADD CONSTRAINT "FK_98ebcbfabc7e92df4eba976428f" FOREIGN KEY (seller_id) REFERENCES public."user"(id);


--
-- Name: classified_invoice_request FK_99f55d125cc44cd1e1295957b7c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classified_invoice_request
    ADD CONSTRAINT "FK_99f55d125cc44cd1e1295957b7c" FOREIGN KEY ("orderRefId") REFERENCES public."order"(id) ON DELETE SET NULL;


--
-- Name: parcel FK_9dbb93fbc7d0931627f2a44c293; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel
    ADD CONSTRAINT "FK_9dbb93fbc7d0931627f2a44c293" FOREIGN KEY ("orderId") REFERENCES public."order"(id) ON DELETE SET NULL;


--
-- Name: order FK_a3d9b10c342597e44f095764d88; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT "FK_a3d9b10c342597e44f095764d88" FOREIGN KEY ("classifiedInvoiceRequestId") REFERENCES public.classified_invoice_request(id) ON DELETE SET NULL;


--
-- Name: parcel_tracking FK_a638a049ad828eaf47d2ae29393; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel_tracking
    ADD CONSTRAINT "FK_a638a049ad828eaf47d2ae29393" FOREIGN KEY ("parcelId") REFERENCES public.parcel(id) ON DELETE CASCADE;


--
-- Name: sale FK_a742b91c1b99a4269c102d47541; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale
    ADD CONSTRAINT "FK_a742b91c1b99a4269c102d47541" FOREIGN KEY ("customerId") REFERENCES public.business_customer(id) ON DELETE SET NULL;


--
-- Name: post_comment FK_a8a5a8cd757122e162e86d78d39; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comment
    ADD CONSTRAINT "FK_a8a5a8cd757122e162e86d78d39" FOREIGN KEY ("authorId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: pickup_point FK_a8e28b1f7d217f9840fc616a229; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickup_point
    ADD CONSTRAINT "FK_a8e28b1f7d217f9840fc616a229" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: inventory_movement FK_a9e8b5eb1dd5faad48660bf85e8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movement
    ADD CONSTRAINT "FK_a9e8b5eb1dd5faad48660bf85e8" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: business FK_ac8ad696f6731c86b52c058c0c6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business
    ADD CONSTRAINT "FK_ac8ad696f6731c86b52c058c0c6" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: bulk_shipment FK_af0c920dba651536641fd1bb81b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_shipment
    ADD CONSTRAINT "FK_af0c920dba651536641fd1bb81b" FOREIGN KEY ("lastMileSuperAgentId") REFERENCES public.super_agent(id) ON DELETE SET NULL;


--
-- Name: parcel_collection FK_af625ea29bf6ea143ae89583c8a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel_collection
    ADD CONSTRAINT "FK_af625ea29bf6ea143ae89583c8a" FOREIGN KEY ("orderId") REFERENCES public."order"(id) ON DELETE CASCADE;


--
-- Name: referral FK_b03e2e8eef2766e6ed730a86d63; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral
    ADD CONSTRAINT "FK_b03e2e8eef2766e6ed730a86d63" FOREIGN KEY ("referredUserId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: transport_assignment FK_b04425c82168ebfb2473b11b74e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_assignment
    ADD CONSTRAINT "FK_b04425c82168ebfb2473b11b74e" FOREIGN KEY ("orderRefId") REFERENCES public."order"(id) ON DELETE SET NULL;


--
-- Name: payment FK_b046318e0b341a7f72110b75857; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT "FK_b046318e0b341a7f72110b75857" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: product_serial FK_b633171f57b6fd0006a9ab5f29d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_serial
    ADD CONSTRAINT "FK_b633171f57b6fd0006a9ab5f29d" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: dispute FK_b692f52ca0593aa85f1026ca220; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute
    ADD CONSTRAINT "FK_b692f52ca0593aa85f1026ca220" FOREIGN KEY ("orderId") REFERENCES public."order"(id) ON DELETE CASCADE;


--
-- Name: shipping_rate FK_b948b0bd4efe4513d01e15f9743; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_rate
    ADD CONSTRAINT "FK_b948b0bd4efe4513d01e15f9743" FOREIGN KEY ("superAgentId") REFERENCES public.super_agent(id) ON DELETE CASCADE;


--
-- Name: agent_transaction FK_bb0aa8c640b66784656275bba7c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_transaction
    ADD CONSTRAINT "FK_bb0aa8c640b66784656275bba7c" FOREIGN KEY ("releasedById") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: dispute FK_bbbd20a9d13873a7b08a5f8887a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute
    ADD CONSTRAINT "FK_bbbd20a9d13873a7b08a5f8887a" FOREIGN KEY ("raisedById") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: digital_product_assets FK_c20daca46fd86f57bfd0a26bd18; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_product_assets
    ADD CONSTRAINT "FK_c20daca46fd86f57bfd0a26bd18" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: seller_profile FK_c2b29aefac4072d2503cab6c0c4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_profile
    ADD CONSTRAINT "FK_c2b29aefac4072d2503cab6c0c4" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: warranty_claim FK_c4eaa28d8f965483ef8767b4a6b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim
    ADD CONSTRAINT "FK_c4eaa28d8f965483ef8767b4a6b" FOREIGN KEY ("registrationId") REFERENCES public.warranty_registration(id) ON DELETE CASCADE;


--
-- Name: offer FK_c570c1bd300dcb14fde34499f05; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer
    ADD CONSTRAINT "FK_c570c1bd300dcb14fde34499f05" FOREIGN KEY ("sellerId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: post_comment FK_c7fb3b0d1192f17f7649062f672; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comment
    ADD CONSTRAINT "FK_c7fb3b0d1192f17f7649062f672" FOREIGN KEY ("postId") REFERENCES public.business_feed_item(id) ON DELETE CASCADE;


--
-- Name: transport_assignment FK_cd9f7607da366fa0aa5d768eb20; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_assignment
    ADD CONSTRAINT "FK_cd9f7607da366fa0aa5d768eb20" FOREIGN KEY ("parcelRefId") REFERENCES public.parcel(id) ON DELETE SET NULL;


--
-- Name: payment FK_d09d285fe1645cd2f0db811e293; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT "FK_d09d285fe1645cd2f0db811e293" FOREIGN KEY ("orderId") REFERENCES public."order"(id) ON DELETE SET NULL;


--
-- Name: wishlist FK_d0d1db74ec15d50850c14794f77; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT "FK_d0d1db74ec15d50850c14794f77" FOREIGN KEY ("classifiedId") REFERENCES public.classified(id) ON DELETE CASCADE;


--
-- Name: sale_item FK_d4361a12f11a57a6cf2a2ee6ac9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_item
    ADD CONSTRAINT "FK_d4361a12f11a57a6cf2a2ee6ac9" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE SET NULL;


--
-- Name: transport_assignment FK_d4b4669233f759c46c7e943705e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_assignment
    ADD CONSTRAINT "FK_d4b4669233f759c46c7e943705e" FOREIGN KEY ("providerId") REFERENCES public.transport_provider(id);


--
-- Name: offer FK_d4e3864343bf8666f0a6d0068c0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer
    ADD CONSTRAINT "FK_d4e3864343bf8666f0a6d0068c0" FOREIGN KEY ("classifiedId") REFERENCES public.classified(id) ON DELETE CASCADE;


--
-- Name: product FK_d5cac481d22dacaf4d53f900a3f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT "FK_d5cac481d22dacaf4d53f900a3f" FOREIGN KEY ("sellerId") REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: referral_reward FK_d9145a5d818d071b9094fcdf052; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_reward
    ADD CONSTRAINT "FK_d9145a5d818d071b9094fcdf052" FOREIGN KEY ("referralId") REFERENCES public.referral(id) ON DELETE CASCADE;


--
-- Name: business_feed_item FK_dd0a8e6a02c5d07e60f2591899d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_feed_item
    ADD CONSTRAINT "FK_dd0a8e6a02c5d07e60f2591899d" FOREIGN KEY ("businessId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: warranty_registration FK_dd93c23235205b7aa0e279bf6c9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_registration
    ADD CONSTRAINT "FK_dd93c23235205b7aa0e279bf6c9" FOREIGN KEY ("productId") REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: batch_parcel FK_dd9619dc161ff3fae7b2d53e3a7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_parcel
    ADD CONSTRAINT "FK_dd9619dc161ff3fae7b2d53e3a7" FOREIGN KEY ("batchId") REFERENCES public.daily_batch(id) ON DELETE CASCADE;


--
-- Name: transport_assignment FK_e27aa978b9717ee61985fba7935; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_assignment
    ADD CONSTRAINT "FK_e27aa978b9717ee61985fba7935" FOREIGN KEY ("shipmentRefId") REFERENCES public.shipment(id) ON DELETE SET NULL;


--
-- Name: referral_reward FK_e57cf8776c25eb88986d3dee08c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_reward
    ADD CONSTRAINT "FK_e57cf8776c25eb88986d3dee08c" FOREIGN KEY ("superAgentId") REFERENCES public.super_agent(id) ON DELETE CASCADE;


--
-- Name: business_team_member FK_e586e1f5d72ea915b7247b2be92; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_team_member
    ADD CONSTRAINT "FK_e586e1f5d72ea915b7247b2be92" FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: warranty_claim_audit_log FK_e6b45efe8dac64e63271cc45066; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim_audit_log
    ADD CONSTRAINT "FK_e6b45efe8dac64e63271cc45066" FOREIGN KEY ("claimId") REFERENCES public.warranty_claim(id) ON DELETE CASCADE;


--
-- Name: conversation FK_e72efff83b7c1ee92e4082182fa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT "FK_e72efff83b7c1ee92e4082182fa" FOREIGN KEY (assigned_to_id) REFERENCES public."user"(id);


--
-- Name: payout FK_e9127ac378dc5e81f73a4049db3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout
    ADD CONSTRAINT "FK_e9127ac378dc5e81f73a4049db3" FOREIGN KEY ("sellerId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: invoice FK_ec771041a9248416f3062013973; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT "FK_ec771041a9248416f3062013973" FOREIGN KEY ("buyerId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: tz_ward FK_ef768b1788ffafaaade790ba2d5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tz_ward
    ADD CONSTRAINT "FK_ef768b1788ffafaaade790ba2d5" FOREIGN KEY (region_id) REFERENCES public.tz_region(id);


--
-- Name: batch_parcel FK_f09ce35a1b5373e234690a9c4ae; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_parcel
    ADD CONSTRAINT "FK_f09ce35a1b5373e234690a9c4ae" FOREIGN KEY ("orderId") REFERENCES public."order"(id) ON DELETE CASCADE;


--
-- Name: invoice FK_f494ce6746b91e9ec9562af4857; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT "FK_f494ce6746b91e9ec9562af4857" FOREIGN KEY ("orderId") REFERENCES public."order"(id) ON DELETE CASCADE;


--
-- Name: selling_capabilities FK_f50860d41f364228cccd47eb1f9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.selling_capabilities
    ADD CONSTRAINT "FK_f50860d41f364228cccd47eb1f9" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: classified FK_f66acedea756c8c90d601ae637f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classified
    ADD CONSTRAINT "FK_f66acedea756c8c90d601ae637f" FOREIGN KEY ("sellerId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: wishlist FK_f6eeb74a295e2aad03b76b0ba87; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT "FK_f6eeb74a295e2aad03b76b0ba87" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: reputation_event FK_f95f62c22f1a8492930445d3d86; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reputation_event
    ADD CONSTRAINT "FK_f95f62c22f1a8492930445d3d86" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: provider_availability FK_fa92eee4165a2827afb5a7ea78b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_availability
    ADD CONSTRAINT "FK_fa92eee4165a2827afb5a7ea78b" FOREIGN KEY ("providerId") REFERENCES public.transport_provider(id) ON DELETE CASCADE;


--
-- Name: parcel FK_fd5bb3eca6818c71d47d893d221; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel
    ADD CONSTRAINT "FK_fd5bb3eca6818c71d47d893d221" FOREIGN KEY ("shipmentId") REFERENCES public.shipment(id) ON DELETE SET NULL;


--
-- Name: tz_ward FK_fdddbbae37773153148c4467fbf; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tz_ward
    ADD CONSTRAINT "FK_fdddbbae37773153148c4467fbf" FOREIGN KEY (district_id) REFERENCES public.tz_district(id);


--
-- Name: conversation_message FK_fde1a45d37dfea0608d6f6166a7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_message
    ADD CONSTRAINT "FK_fde1a45d37dfea0608d6f6166a7" FOREIGN KEY (conversation_id) REFERENCES public.conversation(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict HWyYxQqgUk8U4PX0vW02uL4OL9uwQznflRaEQGMKcvKwG31acS7shXCOUAYo9a8
