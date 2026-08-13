'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Lang = 'en' | 'sw';

const STORAGE_KEY = 'kentexa_ea_lang';

const dict = {
  // ── Landing page ──────────────────────────────────────────────────────
  nav_admin: { en: 'Admin', sw: 'Msimamizi' },
  hero_badge: { en: 'EARLY ACCESS — FREE', sw: 'EARLY ACCESS — BURE' },
  hero_headline: {
    en: 'Be Among the First Businesses on Kentexa.',
    sw: 'Kuwa Miongoni mwa Biashara za Kwanza Kwenye Kentexa.',
  },
  hero_sub: {
    en: 'Kentexa is a new AI-powered commerce network connecting sellers, businesses, service providers, transporters and agents with the opportunities that fit them.',
    sw: 'Kentexa ni mtandao mpya wa biashara unaotumia AI kuunganisha wauzaji, biashara, watoa huduma, wasafirishaji na mawakala na fursa zinazowafaa.',
  },
  hero_cta: { en: 'JOIN EARLY ACCESS — FREE →', sw: 'JIUNGE EARLY ACCESS — BURE →' },

  // ── Why join (replaces the old generic benefits list) ─────────────────
  why_join_heading: { en: 'Why Join Early Access?', sw: 'Kwa Nini Ujiunge Early Access?' },
  why_early_title: { en: 'EARLY POSITIONING', sw: 'EARLY POSITIONING' },
  why_early_desc: {
    en: 'Build your business presence before the public launch.',
    sw: 'Jenga uwepo wa biashara yako kabla ya uzinduzi wa umma.',
  },
  why_ai_title: { en: 'AI-POWERED', sw: 'AI-POWERED' },
  why_ai_desc: {
    en: 'Kentexa is built with AI to match needs with the right businesses, products and services.',
    sw: 'Kentexa inajengwa kwa AI ili kuunganisha mahitaji na biashara, bidhaa na huduma zinazofaa.',
  },
  why_network_title: { en: 'NETWORK', sw: 'NETWORK' },
  why_network_desc: {
    en: 'Be part of a new business network connecting Tanzania.',
    sw: 'Kuwa sehemu ya mtandao mpya wa biashara unaounganisha Tanzania.',
  },
  why_free_title: { en: 'FREE', sw: 'BURE' },
  why_free_desc: { en: 'Early Access is free.', sw: 'Early Access ni bure.' },

  // ── "Wa Kwanza Kujiunga" — replaces the live numeric stats counter, which
  // showed things like "0+ Watoa Huduma" and read as social proof in the
  // wrong direction this early. ──────────────────────────────────────────
  founding_heading: { en: 'FIRST TO JOIN', sw: 'WA KWANZA KUJIUNGA' },
  founding_message: {
    en: "We're looking for Kentexa's first partners.",
    sw: 'Tunatafuta washirika wa kwanza wa Kentexa.',
  },
  founding_sellers: { en: 'Sellers & Businesses', sw: 'Wauzaji & Biashara' },
  founding_service_providers: { en: 'Service Providers', sw: 'Watoa Huduma' },
  founding_transporters: { en: 'Transporters', sw: 'Wasafirishaji' },
  founding_agents: { en: 'Agents', sw: 'Mawakala' },

  cta_heading: { en: 'Ready to be first in line?', sw: 'Uko Tayari Kuwa wa Kwanza?' },
  cta_sub: {
    en: 'Registration takes less than a minute. Secure your spot in Kentexa’s early access program today — completely free.',
    sw: 'Usajili unachukua chini ya dakika moja. Hakikisha nafasi yako katika mpango wa Kentexa wa mapema leo — bure kabisa.',
  },
  cta_button: { en: 'JOIN EARLY ACCESS — FREE →', sw: 'JIUNGE EARLY ACCESS — BURE →' },

  footer_rights: { en: 'All rights reserved.', sw: 'Haki zote zimehifadhiwa.' },
  footer_tagline: {
    en: "Made for Tanzania's businesses, service providers, transporters & agents.",
    sw: 'Imetengenezwa kwa biashara, watoa huduma, wasafirishaji na mawakala wa Tanzania.',
  },

  // ── Register page shell ──────────────────────────────────────────────
  back_to_home: { en: '← Back to home', sw: '← Rudi mwanzo' },
  step_x_of_y: { en: 'Step {step} of {total}', sw: 'Hatua ya {step} kati ya {total}' },
  back: { en: 'Back', sw: 'Rudi' },
  next: { en: 'Next', sw: 'Endelea' },
  toast_review_fields: {
    en: 'Please review the highlighted fields before submitting.',
    sw: 'Tafadhali kagua sehemu zilizoangaziwa kabla ya kutuma.',
  },
  toast_too_many_attempts: {
    en: 'Too many registration attempts. Please try again later.',
    sw: 'Majaribio mengi sana ya usajili. Tafadhali jaribu tena baadaye.',
  },
  toast_generic_error: {
    en: 'Something went wrong. Please try again.',
    sw: 'Hitilafu imetokea. Tafadhali jaribu tena.',
  },

  // ── Step labels (wizard progress bar) ────────────────────────────────
  step_label_account_type: { en: 'Account Type', sw: 'Aina ya Akaunti' },
  step_label_business_info: { en: 'Business Info', sw: 'Taarifa za Biashara' },
  step_label_location: { en: 'Location', sw: 'Mahali' },
  step_label_online_presence: { en: 'Online Presence', sw: 'Uwepo Mtandaoni' },
  step_label_media: { en: 'Media', sw: 'Picha' },
  step_label_tell_us_more: { en: 'Tell us more', sw: 'Tuambie zaidi' },
  step_label_review: { en: 'Review & Submit', sw: 'Kagua na Tuma' },

  // ── Step 0: Account Type ─────────────────────────────────────────────
  account_type_heading: { en: 'What best describes you?', sw: 'Ni ipi inayokufafanua vizuri zaidi?' },
  account_type_subtitle: {
    en: 'Choose the account type that fits how you plan to use Kentexa.',
    sw: 'Chagua aina ya akaunti inayolingana na jinsi unavyopanga kutumia Kentexa.',
  },
  account_type_business: { en: 'Business', sw: 'Biashara' },
  account_type_seller: { en: 'Seller', sw: 'Muuzaji' },
  account_type_service_provider: { en: 'Service Provider', sw: 'Mtoa Huduma' },
  account_type_transporter: { en: 'Transporter', sw: 'Msafirishaji' },
  account_type_agent: { en: 'Agent', sw: 'Wakala' },
  account_type_desc_business: {
    en: 'Register a shop, company, or organization',
    sw: 'Sajili duka, kampuni, au shirika',
  },
  account_type_desc_seller: {
    en: 'Sell products directly to customers',
    sw: 'Uza bidhaa moja kwa moja kwa wateja',
  },
  account_type_desc_service_provider: {
    en: 'Offer skilled services like repair, beauty, or health',
    sw: 'Toa huduma za ujuzi kama ukarabati, urembo, au afya',
  },
  account_type_desc_transporter: {
    en: 'Move goods and parcels around Tanzania',
    sw: 'Safirisha bidhaa na vifurushi ndani ya Tanzania',
  },
  account_type_desc_agent: {
    en: 'Help onboard and support other businesses',
    sw: 'Saidia kusajili na kuunga mkono biashara nyingine',
  },

  // ── Step 1: Business Info ────────────────────────────────────────────
  business_info_heading: { en: 'Tell us about your business', sw: 'Tuambie kuhusu biashara yako' },
  business_info_subtitle: {
    en: 'This information helps customers find and trust you on Kentexa.',
    sw: 'Taarifa hii husaidia wateja kukupata na kukuamini kwenye Kentexa.',
  },
  owner_name_label: { en: 'Owner Name', sw: 'Jina la Mmiliki' },
  owner_name_placeholder: { en: 'e.g. Amina Juma', sw: 'mfano: Amina Juma' },
  business_name_label: { en: 'Business Name', sw: 'Jina la Biashara' },
  business_name_placeholder: { en: 'e.g. Amina Fashions', sw: 'mfano: Amina Fashions' },
  phone_label: { en: 'Phone Number', sw: 'Nambari ya Simu' },
  phone_placeholder: { en: 'e.g. 0712 345 678', sw: 'mfano: 0712 345 678' },
  whatsapp_label: { en: 'WhatsApp Number', sw: 'Nambari ya WhatsApp' },
  whatsapp_placeholder: { en: 'If different from phone', sw: 'Ikiwa tofauti na simu' },
  email_label: { en: 'Email', sw: 'Barua Pepe' },
  email_placeholder: { en: 'you@example.com', sw: 'wewe@mfano.com' },
  business_category_label: { en: 'Business Category', sw: 'Aina ya Biashara' },
  business_category_placeholder: { en: 'Select a category', sw: 'Chagua aina' },
  years_in_business_label: { en: 'Years in Business', sw: 'Miaka Ukifanya Biashara' },
  years_in_business_placeholder: { en: 'e.g. 3', sw: 'mfano: 3' },
  business_description_label: { en: 'Business Description', sw: 'Maelezo ya Biashara' },
  business_description_placeholder: {
    en: 'Briefly describe what your business does',
    sw: 'Eleza kwa ufupi biashara yako inafanya nini',
  },
  products_services_label: { en: 'Products or Services', sw: 'Bidhaa au Huduma' },
  products_services_placeholder: {
    en: 'List the main products or services you offer',
    sw: 'Orodhesha bidhaa au huduma kuu unazotoa',
  },
  // Role-specific variants of the same required field — the question itself
  // changes wording per account type instead of reading identically for everyone.
  products_services_label_seller: { en: 'Products You Sell', sw: 'Bidhaa Unazouza' },
  products_services_placeholder_seller: {
    en: 'List the main products you sell',
    sw: 'Orodhesha bidhaa kuu unazouza',
  },
  products_services_label_service_provider: { en: 'Services You Offer', sw: 'Huduma Unazotoa' },
  products_services_placeholder_service_provider: {
    en: 'List the main services you offer, e.g. repair, tutoring, cleaning',
    sw: 'Orodhesha huduma kuu unazotoa, mfano: ukarabati, ufundishaji, usafi',
  },
  products_services_label_transporter: { en: 'What Do You Transport?', sw: 'Unasafirisha Nini?' },
  products_services_placeholder_transporter: {
    en: 'e.g. parcels, furniture, food, construction materials',
    sw: 'mfano: vifurushi, samani, chakula, vifaa vya ujenzi',
  },
  products_services_label_agent: {
    en: 'Support You Provide to Businesses',
    sw: 'Msaada Unaotoa kwa Biashara',
  },
  products_services_placeholder_agent: {
    en: 'e.g. onboarding help, local market knowledge, customer support',
    sw: 'mfano: msaada wa usajili, ufahamu wa soko la eneo, huduma kwa wateja',
  },
  business_category_hidden_note: {
    en: "We've set a default category for you based on your account type — you can skip this.",
    sw: 'Tumeweka aina chaguo-msingi kwa ajili yako kulingana na aina ya akaunti — unaweza kuruka hili.',
  },

  business_category_electronics: { en: 'Electronics', sw: 'Vifaa vya Elektroniki' },
  business_category_fashion: { en: 'Fashion', sw: 'Mitindo' },
  business_category_agriculture: { en: 'Agriculture', sw: 'Kilimo' },
  business_category_food: { en: 'Food', sw: 'Chakula' },
  business_category_construction: { en: 'Construction', sw: 'Ujenzi' },
  business_category_cleaning: { en: 'Cleaning', sw: 'Usafi' },
  business_category_health: { en: 'Health', sw: 'Afya' },
  business_category_beauty: { en: 'Beauty', sw: 'Urembo' },
  business_category_repair: { en: 'Repair', sw: 'Ukarabati' },
  business_category_security: { en: 'Security', sw: 'Ulinzi' },
  business_category_automotive: { en: 'Automotive', sw: 'Magari' },
  business_category_education: { en: 'Education', sw: 'Elimu' },
  business_category_technology: { en: 'Technology', sw: 'Teknolojia' },
  business_category_real_estate: { en: 'Real Estate', sw: 'Mali Isiyohamishika' },
  business_category_home_services: { en: 'Home Services', sw: 'Huduma za Nyumbani' },
  business_category_professional_services: { en: 'Professional Services', sw: 'Huduma za Kitaalamu' },
  business_category_other: { en: 'Other', sw: 'Nyingine' },

  // ── Step 2: Location ──────────────────────────────────────────────────
  location_heading: { en: 'Where are you located?', sw: 'Uko wapi?' },
  location_subtitle: {
    en: 'We use this to connect you with nearby customers.',
    sw: 'Tunatumia hii kukuunganisha na wateja walio karibu nawe.',
  },
  location_area_label: { en: 'Area', sw: 'Eneo' },
  location_area_placeholder: {
    en: 'Start typing your area, e.g. Bunju, Kinondoni, or Dar es Salaam',
    sw: 'Anza kuandika eneo lako, mfano: Bunju, Kinondoni, au Dar es Salaam',
  },
  location_area_hint: {
    en: 'Try a smaller area first — if nothing matches, search the region name instead',
    sw: 'Jaribu eneo dogo kwanza — kama halionekani, tafuta jina la mkoa badala yake',
  },
  location_change: { en: 'Change', sw: 'Badilisha' },
  location_searching: { en: 'Searching…', sw: 'Inatafuta…' },
  location_type_ward: { en: 'Ward', sw: 'Kata' },
  location_type_district: { en: 'District', sw: 'Wilaya' },
  location_type_region: { en: 'Region', sw: 'Mkoa' },
  coordinates_heading: { en: 'Pinpoint coordinates (optional)', sw: 'Alama kamili ya mahali (si lazima)' },
  coordinates_subtitle: {
    en: 'Filled in automatically once you pick an area above. Only edit these if you need to correct them.',
    sw: 'Hujazwa moja kwa moja pindi ukichagua eneo hapo juu. Yabadilishe tu ikiwa unahitaji kuyarekebisha.',
  },
  latitude_label: { en: 'Latitude', sw: 'Latitudo' },
  longitude_label: { en: 'Longitude', sw: 'Longitudo' },

  // ── Step 3: Online Presence ───────────────────────────────────────────
  online_presence_heading: { en: 'Your online presence', sw: 'Uwepo wako mtandaoni' },
  online_presence_subtitle: {
    en: "Optional — helps us cross-link your existing pages once you're live on Kentexa.",
    sw: 'Si lazima — husaidia kuunganisha kurasa zako zilizopo mara ukiwa hai kwenye Kentexa.',
  },
  website_label: { en: 'Website', sw: 'Tovuti' },
  facebook_label: { en: 'Facebook', sw: 'Facebook' },
  facebook_placeholder: { en: 'Page name or URL', sw: 'Jina la ukurasa au kiungo' },
  instagram_label: { en: 'Instagram', sw: 'Instagram' },
  handle_or_url_placeholder: { en: '@handle or URL', sw: '@jina au kiungo' },
  tiktok_label: { en: 'TikTok', sw: 'TikTok' },

  // ── Step 4: Media ──────────────────────────────────────────────────────
  media_heading: { en: 'Add photos', sw: 'Ongeza picha' },
  media_subtitle: {
    en: 'Optional, but profiles with photos get more attention. JPEG, PNG or WEBP, up to 5MB each.',
    sw: 'Si lazima, lakini wasifu wenye picha huvutia zaidi. JPEG, PNG au WEBP, hadi 5MB kila moja.',
  },
  business_logo_label: { en: 'Business Logo', sw: 'Nembo ya Biashara' },
  cover_image_label: { en: 'Cover Image', sw: 'Picha ya Jalada' },
  business_photos_label: { en: 'Business Photos', sw: 'Picha za Biashara' },
  one_image_hint: { en: '1 image', sw: 'Picha 1' },
  up_to_8_images_hint: { en: 'Up to 8 images', sw: 'Hadi picha 8' },

  // ── Step 5: Tell us more ─────────────────────────────────────────────
  tell_us_more_heading: { en: 'Tell us more', sw: 'Tuambie zaidi' },
  tell_us_more_subtitle: {
    en: "A couple of quick questions specific to how you'll use Kentexa.",
    sw: 'Maswali machache kuhusu jinsi utakavyotumia Kentexa.',
  },
  biggest_challenge_label: {
    en: 'What is the biggest challenge you face in your business?',
    sw: 'Ni changamoto gani kubwa unayokutana nayo katika biashara yako?',
  },
  vehicle_type_label: { en: 'What vehicle do you use?', sw: 'Unatumia gari gani?' },
  vehicle_type_placeholder: { en: 'Select a vehicle type', sw: 'Chagua aina ya gari' },
  vehicle_boda: { en: 'Boda (motorcycle)', sw: 'Bodaboda (pikipiki)' },
  vehicle_bajaji: { en: 'Bajaji', sw: 'Bajaji' },
  vehicle_car: { en: 'Car', sw: 'Gari' },
  vehicle_van_pickup: { en: 'Van / Pickup', sw: 'Van / Pikapu' },
  vehicle_truck: { en: 'Truck', sw: 'Lori' },
  vehicle_boat_ferry: { en: 'Boat / Ferry', sw: 'Mashua / Kivuko' },

  cargo_capacity_label: {
    en: 'How much cargo can you carry?',
    sw: 'Unaweza kubeba mzigo kiasi gani?',
  },
  cargo_capacity_placeholder: { en: 'Select capacity', sw: 'Chagua uwezo' },
  cargo_capacity_up_to_50kg: { en: 'Up to 50kg', sw: 'Hadi kilo 50' },
  cargo_capacity_50_500kg: { en: '50kg – 500kg', sw: 'Kilo 50 – 500' },
  cargo_capacity_500kg_2t: { en: '500kg – 2 tons', sw: 'Kilo 500 – tani 2' },
  cargo_capacity_2t_10t: { en: '2 – 10 tons', sw: 'Tani 2 – 10' },
  cargo_capacity_10t_plus: { en: '10+ tons', sw: 'Zaidi ya tani 10' },

  route_type_label: {
    en: 'Do you operate within one city, between cities, or both?',
    sw: 'Unafanya kazi ndani ya jiji moja, kati ya miji, au vyote?',
  },
  route_type_placeholder: { en: 'Select route type', sw: 'Chagua aina ya njia' },
  route_type_intra_city: { en: 'Within one city/town only', sw: 'Ndani ya jiji/mji mmoja tu' },
  route_type_intercity: { en: 'Between cities/regions only', sw: 'Kati ya miji/mikoa tu' },
  route_type_both: { en: 'Both', sw: 'Vyote viwili' },

  coverage_regions_label: {
    en: 'Which regions do you cover?',
    sw: 'Unahudumia mikoa gani?',
  },

  price_range_label: { en: 'What price range are your products?', sw: 'Bidhaa zako ziko katika bei gani?' },
  price_range_placeholder: { en: 'Select price range', sw: 'Chagua kiwango cha bei' },
  price_range_budget: { en: 'Budget', sw: 'Bei nafuu' },
  price_range_mid_range: { en: 'Mid-range', sw: 'Bei ya kati' },
  price_range_premium: { en: 'Premium', sw: 'Bei ya juu' },

  needs_delivery_support_label: {
    en: 'Do you need help with delivery to customers?',
    sw: 'Unahitaji msaada wa kusafirisha bidhaa kwa wateja?',
  },

  employee_count_label: { en: 'How many people work in your business?', sw: 'Watu wangapi wanafanya kazi katika biashara yako?' },
  employee_count_placeholder: { en: 'Select team size', sw: 'Chagua ukubwa wa timu' },
  employee_count_just_me: { en: 'Just me', sw: 'Mimi tu' },
  employee_count_2_5: { en: '2 – 5 people', sw: 'Watu 2 – 5' },
  employee_count_6_20: { en: '6 – 20 people', sw: 'Watu 6 – 20' },
  employee_count_20_plus: { en: '20+ people', sw: 'Zaidi ya watu 20' },

  booking_method_multi_label: {
    en: 'How do customers currently book you? (select all that apply)',
    sw: 'Kwa sasa wateja hukupangiaje huduma? (chagua zote zinazohusika)',
  },
  booking_method_phone_call: { en: 'Phone call', sw: 'Simu' },
  booking_method_whatsapp: { en: 'WhatsApp', sw: 'WhatsApp' },
  booking_method_walk_in: { en: 'Walk-in', sw: 'Kuja moja kwa moja' },
  booking_method_social_media: { en: 'Social media', sw: 'Mitandao ya kijamii' },
  booking_method_booking_app: { en: 'Booking app', sw: 'Programu ya kupanga huduma' },
  booking_method_select_placeholder: { en: 'Select booking method', sw: 'Chagua njia ya kupanga' },

  pricing_model_label: { en: 'How do you price your services?', sw: 'Unawekaje bei za huduma zako?' },
  pricing_model_placeholder: { en: 'Select pricing model', sw: 'Chagua mfumo wa bei' },
  pricing_model_fixed: { en: 'Fixed price', sw: 'Bei maalum' },
  pricing_model_hourly: { en: 'Hourly rate', sw: 'Kwa saa' },
  pricing_model_quote: { en: 'Quote-based (depends on job)', sw: 'Kwa makadirio (kutegemea kazi)' },

  agent_type_label: {
    en: 'What type of agent are you?',
    sw: 'Wewe ni wakala wa aina gani?',
  },
  agent_type_placeholder: { en: 'Select agent type', sw: 'Chagua aina ya wakala' },
  agent_type_pickup_point: { en: 'Pickup point (customers collect here)', sw: 'Kituo cha kuchukulia (wateja huchukua hapa)' },
  agent_type_dropoff_hub: { en: 'Drop-off hub (customers drop off here)', sw: 'Kituo cha kuachia (wateja huachia hapa)' },
  agent_type_both: { en: 'Both', sw: 'Vyote viwili' },

  daily_capacity_label: {
    en: 'How many parcels could you handle per day?',
    sw: 'Unaweza kushughulikia vifurushi vingapi kwa siku?',
  },
  daily_capacity_placeholder: { en: 'Select daily capacity', sw: 'Chagua uwezo wa kila siku' },
  daily_capacity_up_to_10: { en: 'Up to 10', sw: 'Hadi 10' },
  daily_capacity_10_50: { en: '10 – 50', sw: '10 – 50' },
  daily_capacity_50_200: { en: '50 – 200', sw: '50 – 200' },
  daily_capacity_200_plus: { en: '200+', sw: 'Zaidi ya 200' },
  has_license_label: { en: 'Do you have a valid driving license?', sw: 'Una leseni halali ya udereva?' },
  coverage_areas_label: {
    en: 'Which routes or areas do you currently cover?',
    sw: 'Unahudumia njia au maeneo gani kwa sasa?',
  },
  coverage_areas_placeholder: {
    en: 'e.g. Kinondoni to Ilala, city-wide, or specific routes',
    sw: 'mfano: Kinondoni hadi Ilala, jiji zima, au njia mahususi',
  },
  selling_channels_label: { en: 'Where do you currently sell?', sw: 'Kwa sasa unauzia wapi?' },
  platform_facebook: { en: 'Facebook', sw: 'Facebook' },
  platform_instagram: { en: 'Instagram', sw: 'Instagram' },
  platform_whatsapp: { en: 'WhatsApp', sw: 'WhatsApp' },
  platform_google: { en: 'Google', sw: 'Google' },
  platform_word_of_mouth: { en: 'Word of mouth', sw: 'Mdomo kwa mdomo' },
  platform_tiktok: { en: 'TikTok', sw: 'TikTok' },
  platform_none: { en: 'None', sw: 'Hakuna' },
  other_optional_label: { en: 'Other (optional)', sw: 'Nyingine (si lazima)' },
  other_channel_placeholder: {
    en: 'Any other channel you sell through',
    sw: 'Njia nyingine yoyote unayouzia',
  },
  ready_product_count_label: {
    en: 'How many products do you have ready to list?',
    sw: 'Una bidhaa ngapi tayari kuorodheshwa?',
  },
  ready_product_count_placeholder: { en: 'e.g. 12', sw: 'mfano: 12' },
  travels_to_customer_label: {
    en: 'Do you travel to customers, or do they come to you?',
    sw: 'Je, wewe huenda kwa wateja, au wao huja kwako?',
  },
  booking_method_label: {
    en: 'How do customers currently book you?',
    sw: 'Kwa sasa wateja hukupangaje huduma?',
  },
  booking_method_placeholder: {
    en: 'e.g. Phone call, WhatsApp, walk-in',
    sw: 'mfano: Simu, WhatsApp, kuja moja kwa moja',
  },
  has_physical_location_label: {
    en: 'Do you have a physical shop or location customers can visit?',
    sw: 'Una duka au eneo halisi ambalo wateja wanaweza kutembelea?',
  },
  operating_hours_label: { en: 'What are your operating hours?', sw: 'Muda gani unafanya kazi?' },
  operating_hours_placeholder: { en: 'e.g. Mon–Sat, 8am–7pm', sw: 'mfano: Jumatatu–Jumamosi, 8am–7pm' },
  cash_collection_label: {
    en: 'Would you be able to handle cash collection on behalf of Kentexa?',
    sw: 'Je, unaweza kukusanya fedha taslimu kwa niaba ya Kentexa?',
  },
  yes: { en: 'Yes', sw: 'Ndiyo' },
  no: { en: 'No', sw: 'Hapana' },

  // ── Step 6: Review ────────────────────────────────────────────────────
  review_heading: { en: 'Review your details', sw: 'Kagua taarifa zako' },
  review_subtitle: {
    en: 'Please check everything looks right before submitting.',
    sw: 'Tafadhali hakikisha kila kitu ni sahihi kabla ya kutuma.',
  },
  review_account_type: { en: 'Account Type', sw: 'Aina ya Akaunti' },
  review_owner_name: { en: 'Owner Name', sw: 'Jina la Mmiliki' },
  review_business_name: { en: 'Business Name', sw: 'Jina la Biashara' },
  review_phone: { en: 'Phone', sw: 'Simu' },
  review_whatsapp: { en: 'WhatsApp', sw: 'WhatsApp' },
  review_email: { en: 'Email', sw: 'Barua Pepe' },
  review_category: { en: 'Category', sw: 'Aina' },
  review_description: { en: 'Description', sw: 'Maelezo' },
  review_products_services: { en: 'Products / Services', sw: 'Bidhaa / Huduma' },
  review_years_in_business: { en: 'Years in Business', sw: 'Miaka ya Biashara' },
  review_location: { en: 'Location', sw: 'Mahali' },
  review_website: { en: 'Website', sw: 'Tovuti' },
  review_facebook: { en: 'Facebook', sw: 'Facebook' },
  review_instagram: { en: 'Instagram', sw: 'Instagram' },
  review_tiktok: { en: 'TikTok', sw: 'TikTok' },
  review_logo: { en: 'Logo', sw: 'Nembo' },
  review_cover_image: { en: 'Cover Image', sw: 'Picha ya Jalada' },
  review_photos: { en: 'Photos', sw: 'Picha' },
  review_uploaded: { en: 'Uploaded', sw: 'Imepakiwa' },
  review_n_uploaded: { en: '{n} uploaded', sw: 'zimepakiwa {n}' },
  review_biggest_challenge: { en: 'Biggest Challenge', sw: 'Changamoto Kubwa' },
  review_vehicle_type: { en: 'Vehicle Type', sw: 'Aina ya Gari' },
  review_has_license: { en: 'Has License', sw: 'Ana Leseni' },
  review_coverage_areas: { en: 'Coverage Areas', sw: 'Maeneo Yanayohudumiwa' },
  review_selling_channels: { en: 'Selling Channels', sw: 'Njia za Uuzaji' },
  review_ready_product_count: { en: 'Ready Product Count', sw: 'Idadi ya Bidhaa Tayari' },
  review_travels_to_customer: { en: 'Travels To Customer', sw: 'Huenda kwa Mteja' },
  review_booking_method: { en: 'Booking Method', sw: 'Njia ya Kupanga' },
  review_has_physical_location: { en: 'Has Physical Location', sw: 'Ana Eneo Halisi' },
  review_operating_hours: { en: 'Operating Hours', sw: 'Muda wa Kufanya Kazi' },
  review_cash_collection: { en: 'Can Handle Cash Collection', sw: 'Anaweza Kukusanya Fedha' },
  review_cargo_capacity: { en: 'Cargo Capacity', sw: 'Uwezo wa Mzigo' },
  review_route_type: { en: 'Route Type', sw: 'Aina ya Njia' },
  review_price_range: { en: 'Price Range', sw: 'Kiwango cha Bei' },
  review_needs_delivery_support: { en: 'Needs Delivery Support', sw: 'Anahitaji Msaada wa Usafirishaji' },
  review_employee_count: { en: 'Team Size', sw: 'Ukubwa wa Timu' },
  review_pricing_model: { en: 'Pricing Model', sw: 'Mfumo wa Bei' },
  review_agent_type: { en: 'Agent Type', sw: 'Aina ya Wakala' },
  review_daily_capacity: { en: 'Daily Capacity', sw: 'Uwezo wa Kila Siku' },
  review_coverage_regions: { en: 'Coverage Regions', sw: 'Mikoa Inayohudumiwa' },
  consent_label: {
    en: 'I agree to be contacted before my profile is published.',
    sw: 'Nakubali kuwasiliana nami kabla ya wasifu wangu kuchapishwa.',
  },
  submit_registration: { en: 'Submit Registration', sw: 'Tuma Usajili' },

  // ── Quick registration (primary landing-page flow) ────────────────────
  quick_role_heading: { en: 'How are you joining Kentexa?', sw: 'Unajiunga Kentexa kama nani?' },
  quick_role_seller: { en: 'Seller', sw: 'Muuzaji' },
  quick_role_business: { en: 'Business', sw: 'Biashara' },
  quick_role_service_provider: { en: 'Service Provider', sw: 'Mtoa Huduma' },
  quick_role_transporter: { en: 'Transporter', sw: 'Msafirishaji' },
  quick_role_agent: { en: 'Agent', sw: 'Agent' },
  quick_name_label: { en: 'Your name', sw: 'Jina lako' },
  quick_name_placeholder: { en: 'e.g. Amina Juma', sw: 'mfano: Amina Juma' },
  quick_whatsapp_label: { en: 'Your WhatsApp number', sw: 'Namba yako ya WhatsApp' },
  quick_whatsapp_placeholder: { en: 'e.g. 0712 345 678', sw: 'mfano: 0712 345 678' },
  quick_submit: { en: 'JOIN EARLY ACCESS →', sw: 'JIUNGE EARLY ACCESS →' },
  err_whatsapp_format: {
    en: 'Please enter a valid WhatsApp number',
    sw: 'Tafadhali weka namba sahihi ya WhatsApp',
  },

  // ── Success screen ──────────────────────────────────────────────────────
  success_title: { en: '🎉 WELCOME TO KENTEXA', sw: '🎉 KARIBU KENTEXA' },
  success_message1: { en: "You've joined Kentexa Early Access.", sw: 'Umejiunga na Kentexa Early Access.' },
  success_message2: {
    en: "You're among the first people building a new AI-powered commerce network.",
    sw: 'Uko miongoni mwa watu wa kwanza kujenga mtandao mpya wa biashara unaotumia AI.',
  },
  success_id_label: { en: 'Your Early Access ID', sw: 'Namba Yako ya Early Access' },
  success_copied: { en: 'Copied!', sw: 'Imenakiliwa!' },
  success_tap_copy: { en: 'Tap to copy', sw: 'Gusa kunakili' },
  success_tell_more: { en: 'Tell us more about your business', sw: 'Tuambie zaidi kuhusu biashara yako' },
  success_tell_more_sub: {
    en: "Optional — we'll also follow up with you directly.",
    sw: 'Si lazima — tutakufuatilia pia moja kwa moja.',
  },
  success_back_home: { en: 'Back to Home', sw: 'Rudi Mwanzo' },

  // ── "Tell us more" (completes a quick signup via the full wizard) ──────
  loading: { en: 'Loading…', sw: 'Inapakia…' },
  complete_link_invalid: {
    en: "We couldn't find your session. Please register again to get a fresh link.",
    sw: 'Hatukuweza kupata kikao chako. Tafadhali jiunge tena upate kiungo kipya.',
  },
  success_profile_completed_title: { en: '🎉 THANK YOU', sw: '🎉 ASANTE' },
  success_profile_completed_message: {
    en: 'Your full business profile has been saved.',
    sw: 'Wasifu wako kamili wa biashara umehifadhiwa.',
  },

  // ── Validation error messages (referenced as keys from zod issues) ───
  err_account_type: { en: 'Please select an account type', sw: 'Tafadhali chagua aina ya akaunti' },
  err_owner_name: {
    en: 'Owner name must be at least 2 characters',
    sw: 'Jina la mmiliki lazima liwe na herufi 2 au zaidi',
  },
  err_business_name: {
    en: 'Business name must be at least 2 characters',
    sw: 'Jina la biashara lazima liwe na herufi 2 au zaidi',
  },
  err_phone: {
    en: 'Phone number must be at least 7 characters',
    sw: 'Nambari ya simu lazima iwe na tarakimu 7 au zaidi',
  },
  err_phone_verify: { en: 'Please verify your phone number', sw: 'Tafadhali thibitisha nambari yako ya simu' },
  err_email: { en: 'Please enter a valid email address', sw: 'Tafadhali weka barua pepe sahihi' },
  err_region: { en: 'Region is required', sw: 'Mkoa unahitajika' },
  err_district: { en: 'District is required', sw: 'Wilaya inahitajika' },
  err_business_category: {
    en: 'Please select a business category',
    sw: 'Tafadhali chagua aina ya biashara',
  },
  err_business_description: {
    en: 'Please describe your business in at least 10 characters',
    sw: 'Tafadhali eleza biashara yako kwa herufi 10 au zaidi',
  },
  err_products_services: {
    en: 'Please list your products or services (min 3 characters)',
    sw: 'Tafadhali orodhesha bidhaa au huduma zako (herufi 3 kwa uchache)',
  },
  err_must_be_zero_or_more: { en: 'Must be 0 or more', sw: 'Lazima iwe 0 au zaidi' },
  err_url: {
    en: 'Please enter a valid URL (include https://)',
    sw: 'Tafadhali weka kiungo sahihi (jumuisha https://)',
  },
  err_vehicle_type: { en: 'Please select your vehicle type', sw: 'Tafadhali chagua aina ya gari lako' },
  err_cargo_capacity: {
    en: 'Please select how much cargo you can carry',
    sw: 'Tafadhali chagua kiasi cha mzigo unachoweza kubeba',
  },
  err_route_type: {
    en: 'Please select your route type',
    sw: 'Tafadhali chagua aina ya njia unayotumia',
  },
  err_booking_method: {
    en: 'Please tell us how customers currently book you',
    sw: 'Tafadhali tuambie jinsi wateja wanavyokupangia huduma kwa sasa',
  },
  err_consent: {
    en: 'You must agree to be contacted before your profile is published',
    sw: 'Lazima ukubali kuwasiliana nawe kabla ya wasifu wako kuchapishwa',
  },
} as const;

export type TranslationKey = keyof typeof dict;

function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const entry = (dict as Record<string, { en: string; sw: string }>)[key];
  let text = entry ? entry[lang] : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey | string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguageProviderValue(): LanguageContextValue {
  const [lang, setLangState] = useState<Lang>('sw');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'en' || stored === 'sw') setLangState(stored);
    } catch {
      // ignore — localStorage unavailable
    }
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey | string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );

  return useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
}

export { LanguageContext };

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
