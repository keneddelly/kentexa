import React, { useState, useEffect, Suspense } from 'react';
import lazyPage, { PageLoading } from './utils/lazyPage';
import { markFirstEntry, restoreScroll, writeEntry, currentDepth } from './navigation/browserHistory';
import { useTranslation } from 'react-i18next';
import { workAppPage } from './utils/posApp';
import { usePWA, InstallBanner, InstallGuide, subscribeToPush, disablePushNotifications } from './public/hooks/usePWA';
import AppPushCard from './public/components/AppPushCard';
import api from './api/api';
import { CartProvider } from './context/CartContext';
import { OnboardingProvider } from './onboarding/OnboardingContext';
import useAnalytics from './public/hooks/useAnalytics';
import { pageToAddress, pathToPage, pathToNavParams, linkPageFromAddress, joinPageFromSearch } from './utils/urlSync';
import { missingForPage } from './utils/accountGate';
import { SUPPORTED_LANGUAGES, changeLanguage as changeAppLanguage } from './utils/supportedLanguages';
import { destinationForIntent, consumeIntent, takeWriterRef } from './utils/campaignIntent';
import { rememberPageForUpdate, takeResumePage } from './utils/appVersion';
import { useRoleContext } from './context/RoleContext';
import ContextEpochBoundary from './context/ContextEpochBoundary';
import PageErrorBoundary from './public/components/PageErrorBoundary';
import SlowNetworkNotice from './public/components/SlowNetworkNotice';
import { contextTransitionState } from './context/contextTransition';
import { getAccessToken } from './api/tokenStore';
import useNavigationShell from './navigation/NavigationShell';
import { homeForRole } from './navigation/navigationRegistry';
import { activeBusinessNameFor } from './context/businessGrouping';
import { evaluateDestination } from './navigation/navigationPolicy';
import { unavailableNotice } from './navigation/unavailableNotice';
import HomeFeed           from './public/pages/HomeFeed';
import { photoSkipped }   from './utils/photoLater';
import { holdWelcomeSteps, isCheckoutBuyer } from './utils/checkoutBuyer';
import BottomNav      from './public/components/BottomNav';
import GuestJoinSheet from './public/components/GuestJoinSheet';
import ShareNudge from './public/components/ShareNudge';
import ShareSheet from './public/components/ShareSheet';
import { claimArrival } from './public/utils/shortLinks';
import ProfileSwitcherSheet from './public/components/ProfileSwitcherSheet';
import PostModal      from './public/components/PostModal';
import CreateMomentModal from './public/components/CreateMomentModal';
import ArticleEditor from './public/components/ArticleEditor';
import { loadPosTeam, OWN_TILL_ROLES } from './utils/posTeam';
import { parseMenuPath }  from './utils/food';
import { loadSession as loadPosSession } from './utils/posOffline';
import PublicLogin from './public/pages/PublicLogin';
import Register from './public/pages/Register';
import SellerAccessGate from './public/components/SellerAccessGate';
import { momentActorProfileId } from './public/utils/publicActor';
import POS from './public/pages/POS';
import AdminData, { PAGE_DATASET } from './admin/pages/AdminData';
import { rememberReferral } from './utils/referralLink';
import UpdateNotice from './public/components/UpdateNotice';
import TrainingSmsNotice from './public/components/TrainingSmsNotice';
import { identityState, afterIdentitySent } from './utils/identityState';
import useIdentityRefresh from './utils/useIdentityRefresh';
import useAgentPresence from './utils/useAgentPresence';
import LineIcon from './public/components/LineIcon';
import AndroidAppPromo from './public/components/AndroidAppPromo';

// Light first load (owner 2026-11-16: a Samsung S23 on mobile data saw a blank page): each page
// downloads when it is opened, not all ~100 at start. Home, sign-in, sign-up and the POS (it must
// open offline) stay in the first download.
const PostDetail         = lazyPage(() => import('./public/pages/PostDetail'));
const TagPage            = lazyPage(() => import('./public/pages/TagPage'));
const SeriesPage         = lazyPage(() => import('./public/pages/SeriesPage'));
const TopicPage          = lazyPage(() => import('./public/pages/TopicPage'));
const MySeries           = lazyPage(() => import('./public/pages/MySeries'));
const CompleteAccount    = lazyPage(() => import('./public/pages/CompleteAccount'));
const CommunityPage      = lazyPage(() => import('./public/pages/CommunityPage'));
const JumuiyaLanding      = lazyPage(() => import('./public/pages/JumuiyaLanding'));
const JumuiyaHome         = lazyPage(() => import('./public/pages/JumuiyaHome'));
const CreateCommunity    = lazyPage(() => import('./public/pages/CreateCommunity'));
const Welcome            = lazyPage(() => import('./public/pages/Welcome'));
const MyProfile          = lazyPage(() => import('./public/pages/MyProfile'));
const RoleActivation     = lazyPage(() => import('./public/pages/RoleActivation'));
const Onboarding          = lazyPage(() => import('./public/pages/Onboarding'));
const AddProfilePhoto     = lazyPage(() => import('./public/pages/AddProfilePhoto'));
const FlashSales          = lazyPage(() => import('./public/pages/FlashSales'));
const PickupPoints        = lazyPage(() => import('./public/pages/PickupPoints'));
const RouteCoverageMap   = lazyPage(() => import('./public/pages/RouteCoverageMap'));
const Activity       = lazyPage(() => import('./public/pages/Activity'));
const BecomeSellerInfo = lazyPage(() => import('./public/pages/BecomeSellerInfo'));
const SellerRecruitment = lazyPage(() => import('./public/pages/SellerRecruitment'));
const ConfirmDelivery    = lazyPage(() => import('./public/pages/ConfirmDelivery'));
const SellerCheckout     = lazyPage(() => import('./public/pages/SellerCheckout'));
const PartnerInvite      = lazyPage(() => import('./public/pages/PartnerInvite'));
const SellerAgentInvite  = lazyPage(() => import('./public/pages/SellerAgentInvite'));
const TeamInvite = lazyPage(() => import('./public/pages/TeamInvite'));
const HotelMenu          = lazyPage(() => import('./public/pages/HotelMenu'));
const FoodOrder          = lazyPage(() => import('./public/pages/FoodOrder'));
const HotelKitchen       = lazyPage(() => import('./public/pages/HotelKitchen'));
const HotelMenuManager   = lazyPage(() => import('./public/pages/HotelMenuManager'));
const SellerCustomers   = lazyPage(() => import('./public/pages/SellerCustomers'));
const AgentEarnings     = lazyPage(() => import('./public/pages/AgentEarnings'));
const KentexaFee        = lazyPage(() => import('./public/pages/KentexaFee'));
const TransportProviderSettings = lazyPage(() => import('./public/pages/TransportProviderSettings'));
const SellerAnalytics            = lazyPage(() => import('./public/pages/SellerAnalytics')); // eslint-disable-line
const BecomeTransportProvider    = lazyPage(() => import('./public/pages/BecomeTransportProvider')); // eslint-disable-line
const TransportAdmin             = lazyPage(() => import('./admin/pages/TransportAdmin')); // eslint-disable-line
const VanOperations              = lazyPage(() => import('./admin/pages/VanOperations')); // eslint-disable-line
const HubAdmin                   = lazyPage(() => import('./admin/pages/HubAdmin')); // eslint-disable-line
const SellerTeam                 = lazyPage(() => import('./public/pages/SellerTeam')); // eslint-disable-line
const AgentScorecard             = lazyPage(() => import('./public/pages/AgentScoreCard')); // eslint-disable-line
const Wishlist                   = lazyPage(() => import('./public/pages/Wishlist')); // eslint-disable-line
const CommerceProfile            = lazyPage(() => import('./public/pages/CommerceProfile')); // eslint-disable-line
const Services                   = lazyPage(() => import('./public/pages/Services')); // eslint-disable-line
const ServiceDetail               = lazyPage(() => import('./public/pages/ServiceDetail')); // eslint-disable-line
const PostService                 = lazyPage(() => import('./public/pages/PostService')); // eslint-disable-line
const MyServices                  = lazyPage(() => import('./public/pages/MyServices')); // eslint-disable-line
const TransportProviderDashboard = lazyPage(() => import('./public/pages/TransportProviderDashboard')); // eslint-disable-line
const SellerInbox       = lazyPage(() => import('./public/pages/SellerInbox'));
const Stores = lazyPage(() => import('./public/pages/Stores'));
const ClassifiedsPublic = lazyPage(() => import('./public/pages/ClassifiedsPublic'));
const ProductDetail = lazyPage(() => import('./public/pages/ProductDetail'));
const ClassifiedDetail = lazyPage(() => import('./public/pages/ClassifiedDetail'));
const OrderTracking       = lazyPage(() => import('./public/pages/OrderTracking'));
const MyOrders = lazyPage(() => import('./public/pages/MyOrders'));
const CustomerProfile = lazyPage(() => import('./public/pages/CustomerProfile'));
const EditPublicProfile = lazyPage(() => import('./public/pages/EditPublicProfile'));
const PayoutSettings = lazyPage(() => import('./public/pages/PayoutSettings'));
const InviteFriends = lazyPage(() => import('./public/pages/InviteFriends'));
const BecomeSeller = lazyPage(() => import('./public/pages/BecomeSeller'));
const SellerDashboard = lazyPage(() => import('./public/pages/SellerDashboard'));
const BusinessDashboard = lazyPage(() => import('./public/pages/BusinessDashboard'));
const MyBusinesses = lazyPage(() => import('./public/pages/MyBusinesses'));
const BusinessHome = lazyPage(() => import('./public/pages/BusinessHome'));
const BusinessIntegrations = lazyPage(() => import('./public/pages/BusinessIntegrations'));
const Workspace = lazyPage(() => import('./public/pages/Workspace'));
const BecomeBusinessServiceProvider = lazyPage(() => import('./public/pages/BecomeBusinessServiceProvider'));
const BecomeBusinessCapability = lazyPage(() => import('./public/pages/BecomeBusinessCapability'));
const ConnectSelling = lazyPage(() => import('./public/pages/ConnectSelling'));
const BecomeBusiness = lazyPage(() => import('./public/pages/BecomeBusiness'));
const BecomeAgent = lazyPage(() => import('./public/pages/BecomeAgent'));
const AgentDashboard = lazyPage(() => import('./public/pages/AgentDashboard'));
const Cart = lazyPage(() => import('./public/pages/Cart'));
const Checkout = lazyPage(() => import('./public/pages/Checkout'));
const GuestCheckout = lazyPage(() => import('./public/pages/GuestCheckout'));
const Search = lazyPage(() => import('./public/pages/Search'));
const VerifyReceipt = lazyPage(() => import('./public/pages/VerifyReceipt'));
const SellerProducts = lazyPage(() => import('./public/pages/SellerProducts'));
const MyBrands = lazyPage(() => import('./public/pages/MyBrands'));
const BrandDashboard = lazyPage(() => import('./public/pages/BrandDashboard'));
const BrandCatalog = lazyPage(() => import('./public/pages/BrandCatalog'));
const VerifyProduct = lazyPage(() => import('./public/pages/VerifyProduct'));
const MyWarranties = lazyPage(() => import('./public/pages/MyWarranties'));
const MyResales = lazyPage(() => import('./public/pages/MyResales'));
const UzaTena = lazyPage(() => import('./public/pages/UzaTena'));
const SellerWarrantyClaims = lazyPage(() => import('./public/pages/SellerWarrantyClaims'));
const SellerClassifieds = lazyPage(() => import('./public/pages/SellerClassifieds'));
const SellerOrders = lazyPage(() => import('./public/pages/SellerOrders'));
const SellerInvoices = lazyPage(() => import('./public/pages/SellerInvoices'));
const Dashboard = lazyPage(() => import('./admin/pages/Dashboard'));
const Products = lazyPage(() => import('./admin/pages/Products'));
const Classifieds = lazyPage(() => import('./admin/pages/Classifieds'));
const Profile = lazyPage(() => import('./admin/pages/Profile'));
const Users = lazyPage(() => import('./admin/pages/Users'));
const SuperAgents = lazyPage(() => import('./admin/pages/SuperAgents'));
const Disputes = lazyPage(() => import('./admin/pages/Disputes'));
const Payouts = lazyPage(() => import('./admin/pages/Payouts'));
const Invoices = lazyPage(() => import('./admin/pages/Invoices'));
const Reports = lazyPage(() => import('./admin/pages/Reports'));
const Orders = lazyPage(() => import('./admin/pages/Orders'));
const AdminShipments = lazyPage(() => import('./admin/pages/AdminShipments'));
const AdminDispatchReminders = lazyPage(() => import('./admin/pages/AdminDispatchReminders'));
const ContactMessages = lazyPage(() => import('./admin/pages/ContactMessages'));
const Announcements = lazyPage(() => import('./admin/pages/Announcements'));
const Analytics = lazyPage(() => import('./admin/pages/Analytics'));
const Payments = lazyPage(() => import('./admin/pages/Payments'));
const Sellers = lazyPage(() => import('./admin/pages/Sellers'));
const Businesses = lazyPage(() => import('./admin/pages/Businesses'));
const AdminServices = lazyPage(() => import('./admin/pages/Services'));
const IdentityVerifications = lazyPage(() => import('./admin/pages/IdentityVerifications'));
const AdminBrands = lazyPage(() => import('./admin/pages/AdminBrands'));
const AdminBrandAuthorizations = lazyPage(() => import('./admin/pages/AdminBrandAuthorizations'));
const AdminWarrantyClaims = lazyPage(() => import('./admin/pages/AdminWarrantyClaims'));
const OfficialProducts = lazyPage(() => import('./admin/pages/OfficialProducts'));
const Agents = lazyPage(() => import('./admin/pages/Agents'));
const SuperAgentDashboard = lazyPage(() => import('./public/pages/SuperAgentDashboard'));
const TrackParcel = lazyPage(() => import('./public/pages/TrackParcel'));
const BodaRates = lazyPage(() => import('./admin/pages/BodaRates'));
const RouteManagement = lazyPage(() => import('./admin/pages/RouteManagement'));
const AgentPerformance = lazyPage(() => import('./admin/pages/AgentPerformance'));
const FinancialDashboard = lazyPage(() => import('./admin/pages/FinancialDashboard'));
const CollectionFees = lazyPage(() => import('./admin/pages/CollectionFees'));
const SuperAgentParcel = lazyPage(() => import('./public/pages/SuperAgentParcel'));
const SuperAgentSettings = lazyPage(() => import('./public/pages/SuperAgentSettings'));
const MyAdvertising = lazyPage(() => import('./public/pages/MyAdvertising'));
const QuoteRequest = lazyPage(() => import('./public/pages/QuoteRequest'));
const MyQuoteRequests = lazyPage(() => import('./public/pages/MyQuoteRequests'));
const QuoteInbox = lazyPage(() => import('./public/pages/QuoteInbox'));
const AdminAdvertisers = lazyPage(() => import('./admin/pages/AdminAdvertisers'));
const AdminKentexaFees = lazyPage(() => import('./admin/pages/AdminKentexaFees'));
const AdminSeries = lazyPage(() => import('./admin/pages/AdminSeries'));
const AdminWriters = lazyPage(() => import('./admin/pages/AdminWriters'));
const AdminShippingCheck = lazyPage(() => import('./admin/pages/AdminShippingCheck'));
const AdminActivity = lazyPage(() => import('./admin/pages/AdminActivity'));
const AdminPerson = lazyPage(() => import('./admin/pages/AdminPerson'));
const AdminChats = lazyPage(() => import('./admin/pages/AdminChats'));
const AdminOnboarding = lazyPage(() => import('./admin/pages/AdminOnboarding'));
const AdminResale = lazyPage(() => import('./admin/pages/AdminResale'));
const AdminBusinessView = lazyPage(() => import('./admin/pages/AdminBusinessView'));
const AdminStaff = lazyPage(() => import('./admin/pages/AdminStaff'));
const SellerShipment = lazyPage(() => import('./public/pages/SellerShipment'));
const SendShipment = lazyPage(() => import('./public/pages/SendShipment'));
const MyShipments = lazyPage(() => import('./public/pages/MyShipments'));
const BuyerParcelAction = lazyPage(() => import('./public/pages/BuyerParcelAction'));
const StoreSettings = lazyPage(() => import('./seller/pages/StoreSettings'));
const BecomeSuperAgentInfo = lazyPage(() => import('./public/pages/BecomeSuperAgentInfo'));
const CategoryPage = lazyPage(() => import('./public/pages/CategoryPage'));
const ListingsPage = lazyPage(() => import('./public/pages/ListingsPage'));
const AboutUs = lazyPage(() => import('./public/pages/AboutUs'));
const ContactUs = lazyPage(() => import('./public/pages/ContactUs'));
const HowItWorks = lazyPage(() => import('./public/pages/HowItWorks'));
const TermsAndConditions = lazyPage(() => import('./public/pages/TermsAndConditions'));
const PrivacyPolicy = lazyPage(() => import('./public/pages/PrivacyPolicy'));

// Seller's private order link tokens: the long signed form (?sellerCheckout=a.b) and the
// short one sent since 2026-10-23 (?so=<5 base-36 parts>.<16-char signature>).
const SHORT_SELLER_TOKEN = /^[0-9a-z]{1,12}\.[0-9a-z-]{1,200}\.[0-9a-z]{1,12}\.[0-9a-z]{0,12}\.[0-9a-z]{0,12}\.[A-Za-z0-9_-]{16}$/;
const SELLER_TOKEN = { test: (v) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v) || SHORT_SELLER_TOKEN.test(v) };

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .catch(() => {}); // Silent fail - SW is progressive enhancement
  });
}

/** The installed till's address (owner 2026-10-27). */
const TEAM_INVITE_TOKEN = /^[A-Za-z0-9_-]{16,48}$/;
const isPosPath = () => { try { return /^\/pos\/?$/.test(window.location.pathname); } catch { return false; } };

function App() {
  const { t, i18n } = useTranslation();
  const roleContext = useRoleContext();
  const {
    status: authStatus,
    isAuthenticated: isLoggedIn,
    activeRoleType: userRole,
    activeContext,
    activeProfile,
    roleOptions,
    contextEpoch,
    switching: roleSwitching,
    acceptAuthResponse,
    switchRole,
    refreshContext,
    logout: roleLogout,
  } = roleContext;
  // POS that opens without internet (owner 2026-10-27): /pos on a computer where the till
  // was used before opens with the products and sales kept there, even when the session
  // cannot be restored (no internet). Nothing is sent until the account is back online.
  const [posOfflineBoot, setPosOfflineBoot] = useState(() => isPosPath() && !!loadPosSession()
    && typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    if (authStatus !== 'restoring' || !isPosPath() || !loadPosSession()) return undefined;
    const timer = setTimeout(() => setPosOfflineBoot(true), 6000);
    return () => clearTimeout(timer);
  }, [authStatus]);
  useEffect(() => {
    if (authStatus === 'authenticated' && posOfflineBoot && navigator.onLine !== false) setPosOfflineBoot(false);
  }, [authStatus, posOfflineBoot]);
  const { showInstallPrompt, showGuide, handleInstall, handleDismiss, closeGuide,
    canInstall, hasPrompt, environment, playOffer } = usePWA();
  const [showPostModal, setShowPostModal] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [showMomentModal, setShowMomentModal] = useState(false);
  const [momentModalMode, setMomentModalMode] = useState('selling');
  // Social Home part 3: the community the composer opens in (from a community page), or null.
  const [momentCommunityId, setMomentCommunityId] = useState(null);
  // The welcome's first post (owner 2026-11-02): the composer can open on a kind with a ready start.
  const [momentStart, setMomentStart] = useState(null);
  // Makala (owner approved 2026-11-16): written on its own full screen; { communityId, text } while open.
  const [articleStart, setArticleStart] = useState(null);
  const [momentRefreshKey, setMomentRefreshKey] = useState(0);
  const [postedNudge, setPostedNudge] = useState(null); // C11: the post just made, to invite sharing
  const [postedSheet, setPostedSheet] = useState(false);
  // Single source of truth for every unread-inbox badge (bottom nav,
  // anywhere else that wants it) — GET /business/inbox/unread-count
  // combines seller-side + buyer-side unread conversations, deliberately
  // NOT the generic /notifications/unread-count some pages read today
  // (a different, never-reconciled number — see backend's
  // ConversationService.getUnreadConversationCount comment).
  const [inboxUnread, setInboxUnread] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  // After an automatic update the fresh copy reopens the screen that was open (once).
  const updateResume = React.useRef(undefined);
  if (updateResume.current === undefined) updateResume.current = takeResumePage();
  // A shared link (kentexa.com/uza-tena, /product/42, /@duka...) opened by someone already signed
  // in: the page in the link opens once the account loads, not the role home (2026-11-10).
  const linkPage = React.useRef(undefined);
  if (linkPage.current === undefined) linkPage.current = linkPageFromAddress();
  const [page, setPage]             = useState(() => {
    if (updateResume.current && !updateResume.current.roleType) return updateResume.current.page;
    // Bootstrap from a real URL — lets external links (WhatsApp, SMS) deep-link
    // straight into tracking instead of always landing on Home.
    // e.g. https://kentexa.com/?track=KTX-ORD-47  →  TrackParcel-KTX-ORD-47
    try {
      // A registration link (?ref=...) is kept until the visitor registers.
      rememberReferral(window.location.search);
      // ?go=/product/42-simu (owner 2026-11-03): the share server's fallback when it could not
      // build the page; the address becomes the real one and opens like a direct visit.
      try {
        const go = new URLSearchParams(window.location.search).get('go');
        if (go && /^\/(?:(?:product|classified|service|store|post)\/\d+(?:-[a-z0-9-]*)?|@[a-z0-9_]{2,40})$/i.test(go)) {
          window.history.replaceState(window.history.state, '', go);
        }
      } catch { /* keep the address as it is */ }
      const params = new URLSearchParams(window.location.search);
      const instagramOAuthBusinessId = params.get('businessId');
      if (params.get('instagramOAuth') && /^\d+$/.test(instagramOAuthBusinessId || '')) return 'BusinessIntegrations';
      const track   = params.get('track');
      const receive = params.get('receive');
      const confirm = params.get('confirm');
      const token   = params.get('token');
      if (params.get('notification') === '1' || /^\d+$/.test(params.get('notificationId') || '')) return 'Activity';
      if (confirm && token) return `ConfirmDelivery-${token}`;
      // Seller's private new-order link (SMS / WhatsApp): signed token; the page asks for login first.
      const sellerCheckout = params.get('sellerCheckout');
      if (sellerCheckout && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(sellerCheckout)) return `SellerCheckout-${sellerCheckout}`;
      // The short seller link (?so=..., owner 2026-10-23): same page, shorter token that fits the SMS.
      const shortSeller = params.get('so');
      if (shortSeller && SHORT_SELLER_TOKEN.test(shortSeller)) return `SellerCheckout-${shortSeller}`;
      // A Super Agent's partner invitation (WhatsApp / the sender's own SMS): public page.
      const partnerInvite = params.get('partnerInvite');
      if (partnerInvite && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(partnerInvite)) return `PartnerInvite-${partnerInvite}`;
      // A seller's invitation to their delivery person to be their partner agent: public page.
      const agentInvite = params.get('agentInvite');
      if (agentInvite && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(agentInvite)) return `SellerAgentInvite-${agentInvite}`;
      // A business's invitation to join its team (owner 2026-11-03): public page, Kubali after login.
      const teamInvite = params.get('teamInvite');
      if (teamInvite && /^[A-Za-z0-9_-]{16,48}$/.test(teamInvite)) return `TeamInvite-${teamInvite}`;
      if (receive && /^KTX-[A-Z0-9-]+$/i.test(receive)) return `BuyerParcelAction-${receive}`;
      if (track) return `TrackParcel-${track}`;
      // A hotel's menu link or the QR on its table/room (/menu/:businessId?meza=4), owner 2026-10-27.
      const menu = parseMenuPath(window.location.pathname, window.location.search);
      if (menu) return menu.page;
      // The installed work apps (/pos the till, /ofisi the ofisi desk) open straight there.
      if (workAppPage(window.location.pathname)) return workAppPage(window.location.pathname);
      // A seller's invitation to a transporter or an office (components/InviteCarrier.js).
      const join = params.get('join');
      if (join === 'transport') return 'BecomeTransportProvider';
      if (join === 'office') return 'BecomeSuperAgentInfo';
      // A registration link (?ref=..., an advertiser's or an office's): a visitor who is
      // not signed in goes straight to registration (owner 2026-10-26).
      if (params.get('ref') && !getAccessToken()) return 'Register';
      // Real shareable paths (/product/42, /store/7, ...) — resolves
      // synchronously from the URL alone, no network round trip needed.
      // A refresh keeps the page the person was on (#374): its entry holds the page.
      const kept = window.history.state;
      if (kept && kept.kx && typeof kept.page === 'string' && kept.page) return kept.page;
      const fromPath = pathToPage(window.location.pathname);
      if (fromPath) return fromPath;
    } catch { /* SSR or no window — fall through */ }
    return 'Home';
  });
  const [navParams, setNavParams]   = useState(() => {
    if (updateResume.current && !updateResume.current.roleType) return updateResume.current.navParams;
    // Companion to the /store/:id?cp= boot-time deep-link above — carries
    // WHICH of that account's profiles (personal/business/hub/transport)
    // to show, since CommerceProfile.js can't tell from the bare id alone.
    try {
      const params = new URLSearchParams(window.location.search);
      const instagramOAuthBusinessId = params.get('businessId');
      if (params.get('instagramOAuth') && /^\d+$/.test(instagramOAuthBusinessId || '')) return { businessId: Number(instagramOAuthBusinessId) };
      const menu = parseMenuPath(window.location.pathname, window.location.search);
      if (menu) return menu.navParams;
      const kept = window.history.state;
      if (kept && kept.kx && typeof kept.page === 'string' && kept.page) return kept.params || null;
      return pathToNavParams(window.location.pathname, window.location.search);
    } catch { return null; }
  });
  const [navHistory, setNavHistory] = useState([]);
  // Show language picker only on first visit
  const [showLangPicker, setShowLangPicker] = useState(() => !localStorage.getItem('kentexa_lang'));

  // Landing Localization L1 (§11-12): ?intent= capture itself lives in
  // utils/campaignIntent.js, executed synchronously at module load — same
  // timing as i18n.js's ?lang= resolution, and for the same reason: Welcome.js
  // reads getIntent() synchronously on its first render, and sessionStorage
  // isn't reactive, so a React effect here would run too late (after first
  // paint) for that render to ever see it. Found via local browser
  // acceptance testing.

  // Commerce profiles enrich labels and business-scope parameters only.
  // Active authority is the server-issued AccountRole in RoleContextProvider.
  const myProfiles = roleOptions;
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);
  const [roleSwitchError, setRoleSwitchError] = useState('');

  const fetchInboxUnread = () => {
    if (!isLoggedIn) { setInboxUnread(0); return; }
    api.get('/business/inbox/unread-count')
      .then(res => setInboxUnread(res.data?.unread || 0))
      .catch(() => {});
  };

  useEffect(() => { fetchInboxUnread(); }, [isLoggedIn, contextEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Identity-verification architecture audit (2026-08-28): fetched once at
  // app level so requireVerifiedSeller() below can gate EVERY seller-
  // back-office entry point (Quick Actions tile, direct deep link, bottom
  // nav) from one place, instead of each page independently discovering
  // it's ungated. null = not loaded yet (never treated as "verified" —
  // renderPage() shows nothing/blocks rather than flashing a real page
  // then yanking it away).
  const [identityStatus, setIdentityStatus] = useState(null);
  useIdentityRefresh(setIdentityStatus, isLoggedIn);
  // D1: an agent's "online" stays on while any KenteXa screen is open.
  useAgentPresence(isLoggedIn, roleContext.availableRoles);
  const fetchIdentityStatus = () => {
    if (!isLoggedIn) { setIdentityStatus({ status: 'not_submitted', level: 0 }); return; }
    api.get('/identity/me')
      .then(res => setIdentityStatus(res.data))
      .catch(() => setIdentityStatus({ status: 'not_submitted', level: 0 }));
  };
  useEffect(() => { fetchIdentityStatus(); }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Business-First Frontend Stage 1: `destinationOverride` lets a specific
  // Business capability tile (e.g. POS, which shares the Seller
  // AccountRole with the plain Commerce tile but has its own destination
  // page) land somewhere other than that role's generic home page --
  // still the exact same atomic switchRole() call, same error/nav-reset
  // behavior, never a second switching mechanism.
  const handleSwitchProfile = async (accountRoleId, destinationOverride) => {
    try {
      setRoleSwitchError('');
      const context = await switchRole(accountRoleId);
      setShowProfileSwitcher(false);
      const transition = contextTransitionState(destinationOverride || homeForRole(context.roleType));
      setNavHistory(transition.navHistory);
      setNavParams(transition.navParams);
      setPage(transition.page);
      syncUrl(transition.page, null);
      window.scrollTo(0, 0);
    } catch (error) {
      if (error?.message !== 'ROLE_SWITCH_IN_PROGRESS') {
        setRoleSwitchError(error?.response?.data?.message || error?.message || 'ROLE_SWITCH_FAILED');
      }
    }
  };

  // Analytics — tracks every page, click, scroll automatically
  const { track } = useAnalytics({
    page,
    isLoggedIn,
    userId: (() => {
      try {
        const token = getAccessToken();
        if (!token) return null;
        return JSON.parse(atob(token.split('.')[1]))?.sub || null;
      } catch { return null; }
    })(),
  });

  // One reset boundary for App-owned context state. Component-local state is
  // discarded by the contextEpoch key around the protected page subtree.
  useEffect(() => {
    setNavHistory([]);
    setInboxUnread(0);
    setShowPostModal(false);
    setShowMomentModal(false);
    setShowProfileSwitcher(false);
    setRoleSwitchError('');
    setNavParams(null);
    // Restoring a session from a notification tap must preserve that exact
    // destination; an ordinary role switch still lands on its role home.
    const params = new URLSearchParams(window.location.search);
    const receive = params.get('receive');
    // Same for the seller's new-order link (SMS / WhatsApp): a logged-in seller opening it
    // must land on that order, not on the role home.
    const sellerCheckout = params.get('sellerCheckout') || (SHORT_SELLER_TOKEN.test(params.get('so') || '') ? params.get('so') : null);
    const partnerInvite = params.get('partnerInvite');
    const agentInvite = params.get('agentInvite');
    // Back from an automatic update in the same role: the same screen again, once.
    const resume = updateResume.current;
    if (activeContext?.roleType) updateResume.current = null;
    if (resume?.roleType && resume.roleType === activeContext?.roleType) {
      setNavParams(resume.navParams ?? null);
      setPage(resume.page);
      return;
    }
    // A shared link opened while signed in: that page, once (a later role switch goes home).
    const fromLink = linkPage.current;
    if (activeContext?.roleType) linkPage.current = null;
    if (activeContext?.roleType && fromLink) {
      setNavParams(pathToNavParams(window.location.pathname, window.location.search));
      setPage(fromLink);
      return;
    }
    // A hotel's menu / table QR link (/menu/:businessId?meza=4) stays on that menu.
    const menu = parseMenuPath(window.location.pathname, window.location.search);
    if (activeContext?.roleType && menu) { setNavParams(menu.navParams); setPage(menu.page); return; }
    // The installed till (/pos) stays on the till.
    if (activeContext?.roleType && workAppPage(window.location.pathname)) { setPage(workAppPage(window.location.pathname)); return; }
    if (activeContext?.roleType) setPage(
      receive && /^KTX-[A-Z0-9-]+$/i.test(receive)
        ? `BuyerParcelAction-${receive}`
        : sellerCheckout && SELLER_TOKEN.test(sellerCheckout)
          ? `SellerCheckout-${sellerCheckout}`
          : partnerInvite && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(partnerInvite)
            ? `PartnerInvite-${partnerInvite}`
            : agentInvite && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(agentInvite)
              ? `SellerAgentInvite-${agentInvite}`
            : TEAM_INVITE_TOKEN.test(params.get('teamInvite') || '')
              ? `TeamInvite-${params.get('teamInvite')}`
            : params.get('notification') === '1' || /^\d+$/.test(params.get('notificationId') || '')
              ? 'Activity' : homeForRole(activeContext.roleType));
  }, [contextEpoch, activeContext?.roleType]);

  // Syncs the visible browser URL for the 4 shareable content types
  // (product/classified/service/store) — every other page intentionally
  // leaves the URL untouched, matching today's behavior.
  // One navigation (owner 2026-11-16, #374): EVERY page opened gets its own browser history
  // entry (its address, its details, later its scroll), so every back returns to it.
  const syncUrl = (pageName, params, state = { page: pageName }, mode = 'push') => {
    writeEntry(pageToAddress(pageName, params), { ...state, params: params || null }, mode);
  };

  // Signed in, but the address still says the login page (login sets the page without a new
  // history entry): the address follows the page, so Back and a reload never show the login again.
  useEffect(() => {
    if (!isLoggedIn || page === 'PublicLogin' || page === 'Register') return;
    if (!/^\/p\/(PublicLogin|Register)\/?$/.test(window.location.pathname)) return;
    syncUrl(page, navParams, { page, contextEpoch, accountRoleId: activeContext?.accountRoleId ?? null }, 'replace');
  }, [isLoggedIn, page]); // eslint-disable-line react-hooks/exhaustive-deps

  // A page that cannot open says why (owner 2026-11-09 audit), instead of a silent jump home.
  const [navNotice, setNavNotice] = useState(null);
  useEffect(() => {
    if (!navNotice) return undefined;
    const t = setTimeout(() => setNavNotice(null), 7000);
    return () => clearTimeout(t);
  }, [navNotice]);

  const navigation = useNavigationShell({
    page, setPage, navParams, setNavParams, navHistory, setNavHistory,
    isAuthenticated: isLoggedIn, activeContext, capabilities: roleContext.capabilities,
    contextEpoch, syncUrl, onUnavailable: (decision) => setNavNotice(unavailableNotice(decision)),
  });

  // Direct boot/auth/deep-link state changes pass through the same policy as
  // onNavigate. This prevents a stale bookmark or notification from rendering
  // one frame of another role's operational UI.
  useEffect(() => {
    if (authStatus === 'restoring') return;
    const decision = evaluateDestination({
      page, isAuthenticated: isLoggedIn, roleType: activeContext?.roleType,
      capabilities: roleContext.capabilities,
    });
    if (!decision.allowed) navigation.replace(page, null, 'replace');
  }, [page, authStatus, isLoggedIn, activeContext?.roleType, contextEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNavigate = (pageName, params = null) => {
    if (pageName === 'back') {
      return navigation.back();
    }
    // Leaving the inbox is the one moment we know for sure messages might
    // have just been read (their unreadCount reset server-side) — refetch
    // the badge count now instead of waiting for the next full page load.
    const leavingInbox = typeof page === 'string'
      && (page.startsWith('SellerInbox') || page.startsWith('MessageSeller') || page.startsWith('MessageOperational'));
    if (leavingInbox && pageName !== page) fetchInboxUnread();

    return navigation.navigate(pageName, params);
  };

  // Browser back/forward — re-derive the page from the URL the user landed
  // on. Only fires for real navigation events (not our own pushState calls,
  // which don't trigger popstate), so this is purely additive to the
  // existing in-app "back" button logic above.
  // Once a signed-in person opens Home, it stays loaded under other pages (#374).
  const [homeAlive, setHomeAlive] = useState(false);
  useEffect(() => {
    if (!isLoggedIn) setHomeAlive(false);
    else if (page === 'Home') setHomeAlive(true);
  }, [page, isLoggedIn]);

  // The first page of the tab gets an entry, so coming back to it restores it.
  const lastDepth = React.useRef(0);
  useEffect(() => {
    markFirstEntry({ page, params: navParams || null, contextEpoch, accountRoleId: activeContext?.accountRoleId ?? null });
    lastDepth.current = currentDepth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { lastDepth.current = currentDepth(); }, [page]);

  useEffect(() => {
    const onPopState = (event) => {
      const st = event?.state && event.state.kx ? event.state : null;
      const next = (st && typeof st.page === 'string' && st.page)
        || pathToPage(window.location.pathname)
        || (window.location.pathname === '/' ? 'Home' : null);
      if (!next) return;
      const params = st ? (st.params || null) : pathToNavParams(window.location.pathname, window.location.search);
      const wentBack = st ? (Number(st.kxDepth) || 0) < lastDepth.current : true;
      lastDepth.current = st ? Number(st.kxDepth) || 0 : 0;
      if (navigation.handleBrowserDestination(next, params, window.history.state, wentBack)) {
        restoreScroll(st?.scrollY || 0);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [navigation]);

  const handleLoginSuccess = async (data, options = {}) => {
    try {
      if (data) await acceptAuthResponse(data);
      if (options.refreshOnly) await refreshContext();
      if (getAccessToken()) {
        // Fetch full profile first — avatarUrl can't be read from the JWT
        // (it's signed before the mandatory-photo step completes, so a baked-in
        // claim would go stale). Await it so the photo gate can act on live data.
        let profile = null;
        try {
          const res = await api.get('/auth/profile');
          profile = res.data;
          setCurrentUser(profile);
          // Subscribe to push notifications in background
          // Keep push subscription for already-granted users. Ask new users only
          // after showing the visible Kentexa explanation and receiving their click.
          if ('Notification' in window && Notification.permission === 'granted') {
            subscribeToPush(process.env.REACT_APP_API_URL || '').catch(() => {});
          } else if ('Notification' in window && Notification.permission === 'default') {
            setShowNotificationPrompt(true);
          }
          localStorage.setItem('kentexa_user', JSON.stringify(profile));
          // Viral engine B8 (#381): a new account that came through a shared link is counted for it.
          claimArrival();
        } catch {}
        setNavParams(null);
        // Signed in from the checkout: straight on to the order; photo and welcome wait for Home.
        const fromCheckout = isCheckoutBuyer();
        if (!fromCheckout && profile && !profile.avatarUrl && !photoSkipped(profile.id)) {
          setPage('AddProfilePhoto');
          return;
        }
        if (!fromCheckout && profile && profile.onboardingCompleted === false) {
          setPage('Onboarding');
          return;
        }
        {
          // Personal photo setup finishes before consuming the user's destination.
          // Check if there's a stored intended destination (e.g. from + menu)
          const intended = localStorage.getItem('kentexa_after_login');
          if (intended) {
            localStorage.removeItem('kentexa_after_login');
            setPage(intended);
          } else if (!options.targetPage) {
            // Landing Localization L1 (§12-13): campaign intent's one defined
            // consumption point — read and cleared together (consumeIntent)
            // so it can only ever redirect this one post-auth landing, same
            // priority tier as the plain 'Home' fallback it replaces. Never
            // overrides an explicit targetPage a caller already asked for.
            const consumedIntent = consumeIntent();
            const intentDestination = destinationForIntent(consumedIntent);
            // Writers programme (#417): a writer's link opens the Makala editor right after sign-up.
            if (consumedIntent === 'writer') setArticleStart({});
            // Writers programme (#417 B): someone who came from an invitation counts as joined.
            const writerRef = takeWriterRef();
            if (writerRef) Promise.resolve().then(() => api.post('/writer-outreach/claim', { token: writerRef })).catch(() => {});
            const params = new URLSearchParams(window.location.search);
            const receive = params.get('receive');
            // The seller's new-order link asks for login first; after login it opens that order.
            const sellerCheckout = params.get('sellerCheckout') || (SHORT_SELLER_TOKEN.test(params.get('so') || '') ? params.get('so') : null);
            // A partner invitation: back to the join page after login.
            const partnerInvite = params.get('partnerInvite');
            const agentInvite = params.get('agentInvite');
            // Logged in from a hotel's menu (or its table QR): back to that menu, same table.
            const menu = parseMenuPath(window.location.pathname, window.location.search);
            if (menu) { setNavParams(menu.navParams); setPage(menu.page); return; }
            if (workAppPage(window.location.pathname)) { setPage(workAppPage(window.location.pathname)); return; }
            // An office / transporter invitation (?join=...): back to that application after login.
            const joinPage = joinPageFromSearch(window.location.search);
            if (joinPage) { setPage(joinPage); return; }
            setPage(receive && /^KTX-[A-Z0-9-]+$/i.test(receive)
              ? `BuyerParcelAction-${receive}`
              : sellerCheckout && SELLER_TOKEN.test(sellerCheckout)
                ? `SellerCheckout-${sellerCheckout}`
                : partnerInvite && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(partnerInvite)
                  ? `PartnerInvite-${partnerInvite}`
                  : agentInvite && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(agentInvite)
                    ? `SellerAgentInvite-${agentInvite}`
                  : TEAM_INVITE_TOKEN.test(params.get('teamInvite') || '')
                    ? `TeamInvite-${params.get('teamInvite')}`
                  : params.get('notification') === '1' || /^\d+$/.test(params.get('notificationId') || '')
                    ? 'Activity' : (intentDestination || 'Home'));
          } else {
            setPage(options.targetPage);
          }
        }
      }
    } catch (e) {
      roleContext.clearLocalAuthority('login_initialization_failed');
      throw e;
    }
  };

  // Load legacy/presentation profile only after the server has restored the
  // authoritative ActiveRoleSession and AccountRole context.
  useEffect(() => {
    if (isLoggedIn) {
      api.get('/auth/profile').then(res => {
        setCurrentUser(res.data);
        localStorage.setItem('kentexa_user', JSON.stringify(res.data));
        if (isCheckoutBuyer()) return; // signed in from the checkout: these wait for Home
        if (!res.data.avatarUrl && !photoSkipped(res.data.id)) setPage('AddProfilePhoto');
        else if (res.data.onboardingCompleted === false) setPage('Onboarding');
      }).catch(() => {});
    }
  }, [isLoggedIn, contextEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch the profile whenever the tab regains focus. currentUser.activeRoles
  // (what every role gate — hasAnyRole — actually checks) is otherwise only
  // ever fetched once per session: a seller approved by an admin while still
  // logged in stays locked out of seller-only pages until they log out and
  // back in, since nothing else refreshes it. Throttled so switching tabs
  // repeatedly doesn't spam the endpoint.
  const lastProfileRefreshRef = React.useRef(0);
  useEffect(() => {
    const refreshProfile = () => {
      if (!isLoggedIn || document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastProfileRefreshRef.current < 30000) return;
      lastProfileRefreshRef.current = now;
      api.get('/auth/profile').then(res => {
        setCurrentUser(res.data);
        localStorage.setItem('kentexa_user', JSON.stringify(res.data));
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', refreshProfile);
    window.addEventListener('focus', refreshProfile);
    return () => {
      document.removeEventListener('visibilitychange', refreshProfile);
      window.removeEventListener('focus', refreshProfile);
    };
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Boot-time /@username routing — resolves a public commerce-identity
  // handle (e.g. kentexa.com/@bishoo_intelligence_syst) straight to that
  // profile's owner. Can't be read synchronously like ?track=/?confirm=
  // in the page useState initializer above because it needs a network
  // round trip to resolve the username to an owner id; runs once on mount
  // instead, same as the other boot effects here.
  useEffect(() => {
    try {
      const match = window.location.pathname.match(/^\/@([a-z0-9_]+)\/?$/i);
      if (!match) return;
      api.get(`/profiles/username/${match[1]}`).then(res => {
        if (res.data?.ownerId) {
          // Carries the SPECIFIC profile that was resolved (not just the
          // owning account) so the page renders exactly that identity —
          // never a shared "all of this owner's roles" view. See
          // CommerceProfile.js's commerceProfileId prop.
          setNavParams({ commerceProfileId: res.data.id });
          setPage(`CommerceProfile-${res.data.ownerId}`);
        }
      }).catch(() => {});
    } catch { /* no window — SSR */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Boot-time /verify/:code routing (spec §14 serial/IMEI authenticity) —
  // a QR code printed on a physical unit points here. No network round
  // trip needed to resolve the route itself (unlike /@username above) —
  // VerifyProduct.js does its own GET /products/verify/:code — so this
  // just needs to recognize the path and hand off the raw code. A serial
  // can contain letters/digits/hyphens, so this can't reuse urlSync.js's
  // PREFIX_TO_SEGMENT map (which assumes a trailing numeric id).
  useEffect(() => {
    try {
      const match = window.location.pathname.match(/^\/verify\/([A-Za-z0-9-]+)\/?$/);
      if (!match) return;
      setNavParams({ code: match[1] });
      setPage('VerifyProduct');
    } catch { /* no window — SSR */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Lets any page (profile edit, avatar upload, etc.) push a fresh user
  // object up into App's currentUser state after a save — without this,
  // BottomNav/HomeFeed keep reading the currentUser snapshot taken at
  // login (also cached in localStorage, so even a page reload wouldn't
  // pick up the change) and a newly-added photo never appears outside
  // the page that set it.
  const handleUserUpdated = (updatedUser) => {
    setCurrentUser(updatedUser);
    localStorage.setItem('kentexa_user', JSON.stringify(updatedUser));
  };

  const handleLogout = async () => {
    await disablePushNotifications().catch(() => {});
    await roleLogout();
    setCurrentUser(null);
    localStorage.removeItem('kentexa_user');
    setPage('Home');
    setNavParams(null);
  };



  const publicProps = {
    onNavigate: handleNavigate, isLoggedIn, onLogout: handleLogout, userRole, currentUser,
    canInstallKentexa: canInstall, onInstallKentexa: handleInstall, installEnv: environment, installReady: hasPrompt,
    onUserUpdated: handleUserUpdated,
    activeProfile, activeProfileId: activeProfile?.id,
    activeContext, availableRoles: roleContext.availableRoles,
    onRefreshContext: roleContext.refreshContext,
    // Business-First Frontend Stage 1: roleOptions already carries
    // businessId/businessName/workspaceId per server-issued role
    // (rolePresentation.js) -- Business Home/My Businesses read it for
    // presentation only, never as an authority source. onSwitchAccountRole
    // is the SAME atomic switch handler the profile switcher already uses
    // (preserves old context on failure, resets nav on success) -- no
    // second switching mechanism.
    roleOptions, onSwitchAccountRole: handleSwitchProfile,
    // Business-First Frontend Stage 1: the current Business's name, for
    // shell/header presentation only ("Bishoo Intelligence Systems /
    // Commerce" instead of just "Seller"). Resolved from roleOptions
    // (which carries businessName) matched against activeContext.accountRoleId
    // -- never persisted as its own authority, never used to derive access.
    activeBusinessName: activeBusinessNameFor(activeContext, roleOptions),
    // #374 C: the identity pill sits in the Home and Kazi top bars (it no longer floats).
    myProfiles, onOpenSwitcher: () => setShowProfileSwitcher(true),
    capabilities: roleContext.capabilities, contextEpoch,
    onOpenMoment: (_mode, opts) => {
      if (!isLoggedIn) { handleNavigate('PublicLogin'); return; }
      if (opts?.kind === 'article') { setArticleStart({ communityId: opts?.communityId ?? null, text: opts?.text || '' }); return; }
      setMomentModalMode('selling');
      setMomentCommunityId(opts?.communityId ?? null);
      // A detail page (classified, service, transport) opens the composer with its item already tagged.
      const linked = opts?.type && opts?.id ? { type: opts.type, id: opts.id, title: opts.title || '', price: opts.price ?? null } : null;
      setMomentStart(opts?.kind || opts?.text || linked ? { kind: opts.kind || null, text: opts.text || '', tagged: linked } : null);
      setShowMomentModal(true);
    },
    momentRefreshKey,
    inboxUnread,
  };
  const homeProps = publicProps;

  const adminProps  = { onNavigate: handleNavigate, onLogout: handleLogout };

  const loginPage = <PublicLogin onNavigate={handleNavigate} onLoginSuccess={handleLoginSuccess} />;

  const requireLogin = (component) => {
    const token = getAccessToken();
    if (!token) return loginPage;
    return isLoggedIn ? component : loginPage;
  };

  const requireAdmin = (component) => {
    const token = getAccessToken();
    if (!token) return loginPage;
    const role = activeContext?.roleType;
    // Admin and KenteXa staff (owner 2026-11-09); the server limits each staff role to its area.
    if (['admin', 'manager', 'customer_care', 'finance', 'moderator'].includes(role)) return component;
    return <HomeFeed {...publicProps} />;
  };

  // Identity-verification architecture audit (2026-08-28): closes every
  // entry point into the seller back office (Quick Actions "Seller
  // Center" tile, direct deep link, bottom nav — whatever got the user
  // here) behind identity verification, at the single router level,
  // rather than each page discovering separately that it was never
  // gated. This is about IDENTITY (NIDA/passport/etc.) only — level 1 is
  // enough to pass; whether a given ACTION inside also needs an
  // approved SellerProfile (level 2) is decided separately, backend-
  // side, by VerificationService.requireFeature() per endpoint. Staff
  // (admin/manager) bypass, same as the backend's own shipment gate —
  // they access these pages administratively, not as a commerce
  // participant selling their own goods. Known gap: a BusinessTeamMember
  // (SellerTeam.js — a cashier with e.g. canOperatePOS) is gated on
  // THEIR OWN identity here, not their verified employer's, unlike the
  // backend action-level checks (which correctly resolve to the
  // employer via SellerScopeService). Zero active team members exist in
  // production as of this fix (confirmed via DB), so this is currently
  // inert, not a live regression — revisit if team accounts start
  // getting used and a legitimate unverified staff member gets blocked.
  const requireVerifiedSeller = (component) => {
    const token = getAccessToken();
    if (!token) return loginPage;
    const role = activeContext?.roleType;
    if (role === 'admin' || role === 'manager' || role === 'super_agent') return component;
    if (identityStatus === null) return null; // brief post-login load; avoid flashing either state
    // Seller pages need a VERIFIED ID (server rule). Missing/rejected -> the ID step;
    // waiting -> "kinasubiri" (never asked again). utils/identityState.
    if (identityState(identityStatus) !== 'verified') {
      return (
        <SellerAccessGate
          onNavigate={handleNavigate}
          identityStatus={identityStatus}
          onVerified={() => setIdentityStatus(prev => afterIdentitySent(prev))}
        />
      );
    }
    return component;
  };

  // The photo is optional (owner approved 2026-11-02): "Ruka kwa sasa" is remembered on this phone.
  const welcomeHeld = holdWelcomeSteps(page);
  const needsProfilePhoto = isLoggedIn && !!currentUser && !currentUser.avatarUrl && !photoSkipped(currentUser.id) && !welcomeHeld;

  const needsOnboarding = isLoggedIn && currentUser?.onboardingCompleted === false && !welcomeHeld;

  const renderPage = () => {
    if (needsProfilePhoto) return <AddProfilePhoto {...publicProps} />;
    if (needsOnboarding) return <Onboarding {...publicProps} />;
    const pageStr = typeof page === 'string' ? page : 'Home';
    const policyDecision = evaluateDestination({
      page: pageStr, isAuthenticated: isLoggedIn, roleType: activeContext?.roleType,
      capabilities: roleContext.capabilities,
    });
    // The effect above replaces invalid state with the current role home. Render
    // nothing during that transition so wrong-context operational UI never flashes.
    if (pageStr !== page || !policyDecision.allowed) return null;

    // Owner 2026-11-17: a feature that needs a phone and a region asks for them first, so it never
    // fails half-way (accounts made with Google / Facebook or email have no phone).
    const missingDetails = isLoggedIn ? missingForPage(pageStr, currentUser) : [];
    if (missingDetails.length) {
      return <CompleteAccount page={pageStr} missing={missingDetails} onNavigate={handleNavigate}
        onDone={(fresh) => handleUserUpdated({ ...currentUser, ...fresh })} />;
    }

    // ── Dynamic routes (single source of truth — do not duplicate below) ────
    // "New comment"/"New save" notifications append "-comments" so the
    // detail page opens straight on its comment thread instead of its
    // default view — split it off before Number() parsing so a suffix can
    // never turn the id into NaN (see CommerceProfile's pageParam parsing
    // for the same fix, applied earlier this session).
    if (page.startsWith('ClassifiedDetail-')) {
      const [rawId, suffix] = page.split('ClassifiedDetail-')[1].split('-');
      return <ClassifiedDetail {...publicProps} classifiedId={Number(rawId)} openComments={suffix === 'comments'} />;
    }
    // Home Feed phase C: one post on its own page (share link /post/:id, notifications).
    // Social Home part 3: a community page.
    if (page.startsWith('Community-'))
      return <CommunityPage {...publicProps} communityId={Number(page.split('Community-')[1])} />;
    // Hashtags (owner 2026-11-15): a tag's page, kentexa.com/tag/<key>.
    if (page.startsWith('Tag-'))
      return <TagPage {...publicProps} tagKey={page.slice(4)} />;
    // Mfululizo (#410): a series and a topic page.
    if (/^Series-\d+$/.test(page))
      return <SeriesPage {...publicProps} seriesId={Number(page.slice(7))} />;
    if (page.startsWith('Topic-'))
      return <TopicPage {...publicProps} topicKey={page.slice(6)} />;
    // Mfululizo wangu (#410 phase 5): a writer's own series.
    if (page === 'MySeries')
      return requireLogin(<MySeries {...publicProps} />);
    if (page.startsWith('PostDetail-')) {
      const [rawId, suffix] = page.split('PostDetail-')[1].split('-');
      return <PostDetail {...publicProps} postId={Number(rawId)} openComments={suffix === 'comments'} />;
    }
    if (page.startsWith('ProductDetail-')) {
      const [rawId, suffix] = page.split('ProductDetail-')[1].split('-');
      return <ProductDetail {...publicProps} productId={Number(rawId)} track={track}
        initialTab={suffix === 'comments' ? 'reviews' : null} offerId={navParams?.offerId || null} />;
    }
    // Deep-links from a warranty-claim notification (WarrantyService's own
    // actionPage/actionParam) straight to the relevant registration —
    // see MyWarranties.js/SellerWarrantyClaims.js's own registrationId prop.
    if (page.startsWith('MyWarranties-'))
      return requireLogin(<MyWarranties {...publicProps} registrationId={page.split('MyWarranties-')[1]} />);
    if (page.startsWith('SellerWarrantyClaims-'))
      return requireLogin(<SellerWarrantyClaims {...publicProps} registrationId={page.split('SellerWarrantyClaims-')[1]} />);
    // Deep-links straight into editing one item — from that item's own
    // detail page ••• menu, so the owner doesn't have to re-find it on the
    // separate SellerProducts/SellerClassifieds management page.
    if (page.startsWith('EditProduct-'))
      return requireLogin(<SellerProducts {...publicProps} editProductId={Number(page.split('EditProduct-')[1])} />);
    if (page.startsWith('EditClassified-'))
      return requireLogin(<SellerClassifieds {...publicProps} editItemId={Number(page.split('EditClassified-')[1])} />);
    if (page.startsWith('ServiceDetail-')) {
      const [rawId, suffix] = page.split('ServiceDetail-')[1].split('-');
      return <ServiceDetail {...publicProps} serviceId={Number(rawId)} openComments={suffix === 'comments'} />;
    }
    if (page.startsWith('BusinessDashboard-'))
      return requireLogin(<BusinessDashboard {...publicProps} businessId={Number(page.split('BusinessDashboard-')[1])} />);
    if (page.startsWith('BusinessHome-'))
      return requireLogin(<BusinessHome {...publicProps} businessId={Number(page.split('BusinessHome-')[1])} />);
    if (page.startsWith('BecomeBusinessCapability-')) {
      const [, id, code] = page.split('-');
      if (['commerce', 'transport', 'super_agent'].includes(code)) return requireLogin(<BecomeBusinessCapability {...publicProps} businessId={Number(id)} code={code} />);
    }
    if (page.startsWith('BecomeBusinessServiceProvider-'))
      return requireLogin(<BecomeBusinessServiceProvider {...publicProps} businessId={Number(page.split('BecomeBusinessServiceProvider-')[1])} />);
    // Duka page template (owner approved 2026-11-18): the old shop page is now the shop's own
    // profile page, which opens on Duka.
    if (page.startsWith('SellerStore-'))
      return <CommerceProfile {...publicProps} pageParam={`${page.split('SellerStore-')[1]}-posts`} track={track} />;
    // Store- is a legacy alias — route it through the same CommerceProfile
    // page as everywhere else, so there is only ever ONE seller-profile
    // implementation (and therefore only one source of truth for follow state).
    if (page.startsWith('Store-'))
      return <CommerceProfile {...publicProps} pageParam={page.split('Store-')[1]} track={track} />;
    if (page.startsWith('CommerceProfile-')) {
      const pid = page.split('CommerceProfile-')[1];
      return <CommerceProfile {...publicProps} pageParam={pid} commerceProfileId={navParams?.commerceProfileId} track={track} />;
    }
    // Order-lifecycle notifications (orderPlaced, orderPaid, disputeRaised,
    // payoutReleased, ...) carry actionPage + orderId as actionParam. Without
    // these, Activity.js builds "MyOrders-42" and the switch below has no
    // case for that literal string, so it silently fell through to Home
    // instead of even the plain list.
    if (page.startsWith('MyOrders-'))
      return requireLogin(<MyOrders {...publicProps} highlightOrderId={Number(page.split('MyOrders-')[1])} />);
    if (page.startsWith('SellerOrders-'))
      return requireLogin(<SellerOrders {...publicProps} highlightOrderId={Number(page.split('SellerOrders-')[1])} />);
    // Malipo hidden (owner 2026-11-03): KenteXa never holds money; an old link opens Maagizo.
    if (page.startsWith('SellerPayouts-'))
      return requireLogin(<SellerOrders {...publicProps} />);
    // Tracking must work without an account — the recipient of a parcel
    // often isn't the buyer and may not be logged in at all.
    if (page.startsWith('TrackParcel-'))
      return <TrackParcel {...publicProps} trackingNumber={page.split('TrackParcel-')[1]} />;
    if (page.startsWith('TrackOrder-'))
      return <TrackParcel {...publicProps} orderId={page.split('TrackOrder-')[1]} />;
    if (page.startsWith('OrderTracking-'))
      return requireLogin(<OrderTracking {...publicProps} orderId={Number(page.split('OrderTracking-')[1])} />);
    if (page.startsWith('ConfirmDelivery-'))
      return <ConfirmDelivery token={page.split('ConfirmDelivery-')[1]} />;
    if (page.startsWith('SellerCheckout-'))
      return requireLogin(<SellerCheckout token={page.slice('SellerCheckout-'.length)} onNavigate={publicProps.onNavigate} />);
    if (page.startsWith('PartnerInvite-'))
      return <PartnerInvite token={page.slice('PartnerInvite-'.length)} isLoggedIn={isLoggedIn} onNavigate={publicProps.onNavigate} />;
    // Hotel food ordering (owner 2026-10-27): anyone may look at a menu; ordering needs login.
    if (page.startsWith('HotelMenu-'))
      return <HotelMenu {...publicProps} businessId={Number(page.split('HotelMenu-')[1])}
        placeType={navParams?.placeType} placeNumber={navParams?.placeNumber} />;
    // Ada ya KenteXa (2026-11-03): a fee notification opens KentexaFee-office|agent|seller.
    if (/^KentexaFee-(office|agent|seller)$/.test(page))
      return requireLogin(<KentexaFee {...publicProps} as={page.split('KentexaFee-')[1]} />);
    if (page.startsWith('HotelKitchen-'))
      return requireLogin(<HotelKitchen {...publicProps} businessId={Number(page.split('HotelKitchen-')[1])} />);
    if (page.startsWith('FoodOrder-'))
      return requireLogin(<FoodOrder {...publicProps} orderId={Number(page.split('FoodOrder-')[1])} />);
    if (page.startsWith('TeamInvite-'))
      return <TeamInvite token={page.slice('TeamInvite-'.length)} isLoggedIn={isLoggedIn} onNavigate={publicProps.onNavigate} />;
    if (page.startsWith('SellerAgentInvite-'))
      return <SellerAgentInvite token={page.slice('SellerAgentInvite-'.length)} isLoggedIn={isLoggedIn} onNavigate={publicProps.onNavigate} />;
    if (page.startsWith('BuyerParcelAction-'))
      return requireLogin(<BuyerParcelAction {...publicProps} trackingNumber={page.split('BuyerParcelAction-')[1]} />);
    if (page.startsWith('BatchHandoff-'))
      return requireLogin(<SuperAgentDashboard {...publicProps} startTab="tuma" />);
    // PayInvoice is hidden for now (owner 2026-11-02): it pays through KenteXa, and KenteXa
    // never holds money. Old links land on the buyer's orders (or Home for a visitor).
    if (page.startsWith('PayInvoice-'))
      return isLoggedIn ? <MyOrders {...publicProps} /> : <Welcome {...publicProps} />;
    if (page.startsWith('VerifyReceipt-'))
      return <VerifyReceipt {...publicProps} initialReceipt={page.split('VerifyReceipt-')[1]} />;
    if (page.startsWith('SellerInbox-')) {
      const customerId = page.split('SellerInbox-')[1];
      return requireLogin(<SellerInbox {...publicProps} initialCustomerId={customerId} />);
    }
    if (page.startsWith('MessageSeller-')) {
      const sellerId = page.split('MessageSeller-')[1];
      return requireLogin(<SellerInbox {...publicProps} initialCustomerId={null} sellerId={sellerId}
        messageCommerceProfileId={navParams?.commerceProfileId}
        messageContextType={navParams?.contextType} messageContextId={navParams?.contextId} />);
    }
    // Communication canonicality fix: messaging a Super Agent/Transport
    // Provider/Agent profile must NOT collapse onto that same person's
    // Seller conversation just because MessageSeller-{id} only ever
    // carried the bare User.id. `commerceProfileId` here is the SAME id
    // CommerceProfile.js already has as activeProfile.id -- resolved
    // server-side (see POST /business/my-conversations/start), never
    // trusted as authority by itself.
    if (page.startsWith('MessageOperational-')) {
      const [, targetType, commerceProfileId] = page.split('-');
      return requireLogin(<SellerInbox {...publicProps} initialCustomerId={null}
        messageTargetType={targetType} messageTargetId={commerceProfileId}
        messageContextType={navParams?.contextType} messageContextId={navParams?.contextId} />);
    }
    if (page.startsWith('Search-'))
      return <Search {...publicProps} initialQuery={page.split('Search-')[1]} aiIntent={navParams?.aiIntent} track={track} />;
    if (page.startsWith('Category-'))
      return <CategoryPage {...publicProps} category={page.split('Category-')[1]} />;
    if (page.startsWith('Listings-'))
      return <ListingsPage {...publicProps} initialTab={page.split('Listings-')[1]} />;
    if (page === 'Listings')
      return <ListingsPage {...publicProps} />;
    switch (page) {
      // Signed in, Home stays loaded underneath (#374): drawn by the kept Home below.
      case 'Home':              return isLoggedIn ? null : <Welcome {...publicProps} onLoginSuccess={handleLoginSuccess} />;

      case 'AboutUs':              return <AboutUs {...publicProps} />;
      case 'UzaTena':              return <UzaTena {...publicProps} />;
      case 'StartSelling':         return <SellerRecruitment {...publicProps} />;
      case 'ContactUs':            return <ContactUs {...publicProps} />;
      case 'HowItWorks':           return <HowItWorks {...publicProps} />;
      case 'Privacy':
      case 'PrivacyPolicy':              return <PrivacyPolicy {...publicProps} />;
      case 'Terms':
      case 'TermsAndConditions':   return <TermsAndConditions {...publicProps} />;
      case 'FlashSales':           return <FlashSales {...publicProps} />;
      case 'PickupPoints':         return <PickupPoints {...publicProps} />;
      case 'ClassifiedDetail':     return <ClassifiedDetail {...publicProps} />;
      case 'ServiceDetail':        return <ServiceDetail {...publicProps} />;
      case 'ProductDetail':        return <ProductDetail {...publicProps} />;
      case 'VerifyProduct':        return <VerifyProduct {...publicProps} code={navParams?.code} />;
      case 'MyWarranties':         return requireLogin(<MyWarranties {...publicProps} />);
      case 'MyResales':            return requireLogin(<MyResales {...publicProps} startTab={navParams?.tab} supplierId={navParams?.supplierId} />);
      case 'SellerWarrantyClaims': return requireLogin(<SellerWarrantyClaims {...publicProps} />);
      case 'OrderTracking':        return requireLogin(<OrderTracking {...publicProps} />);

      case 'Discover':          return <Search {...publicProps} initialTab={navParams?.initialTab} track={track} />;
      case 'JumuiyaLanding':   return <JumuiyaLanding {...publicProps} />;
      case 'JumuiyaHome':      return <JumuiyaHome {...publicProps} />;
      case 'Activity':          return requireLogin(<Activity {...publicProps} />);
      case 'RoleActivation':    return requireLogin(<RoleActivation {...publicProps} />);
      case 'Onboarding':        return requireLogin(<Onboarding {...publicProps} />);
      case 'AddProfilePhoto':   return requireLogin(<AddProfilePhoto {...publicProps} />);
      case 'RouteCoverageMap':   return <RouteCoverageMap {...publicProps} />;
      case 'MyProfile':         return requireLogin(<MyProfile {...publicProps} />);
      case 'MyAdvertising':     return requireLogin(<MyAdvertising {...publicProps} />);
      case 'FoodOrder':         return requireLogin(<FoodOrder {...publicProps} orderId={null} />);
      case 'HotelKitchen':      return requireLogin(<HotelKitchen {...publicProps} businessId={navParams?.businessId} />);
      case 'HotelMenuManager':  return requireLogin(<HotelMenuManager {...publicProps} businessId={navParams?.businessId} />);
      case 'QuoteRequest':      return requireLogin(<QuoteRequest {...publicProps} kind={navParams?.kind} />);
      case 'MyQuoteRequests':   return requireLogin(<MyQuoteRequests {...publicProps} />);
      case 'QuoteInbox':        return requireLogin(<QuoteInbox {...publicProps} />);
      case 'CommerceProfile':     return requireLogin(<CommerceProfile {...publicProps} pageParam={null} track={track} />);
      case 'Store':
      case 'Stores':            return <Stores {...publicProps} />;
      case 'ClassifiedsPublic': return <ClassifiedsPublic {...publicProps} />;
      case 'PublicLogin':       return loginPage;
      case 'Register':          return <Register onNavigate={handleNavigate} onLoginSuccess={handleLoginSuccess} />;
      case 'Search':            return <Search {...publicProps} aiIntent={navParams?.aiIntent} track={track} />;
      case 'Cart':              return <Cart {...publicProps} />;
      case 'BecomeSeller':      return <BecomeSeller {...publicProps} />;
      case 'BecomeSellerInfo':  return <BecomeSellerInfo {...publicProps} />;
      case 'SellerCustomers':   return requireVerifiedSeller(<SellerCustomers {...publicProps} />);
      case 'AgentEarnings':     return requireLogin(<AgentEarnings {...publicProps} />);
      case 'KentexaFee':        return requireLogin(<KentexaFee {...publicProps} navParams={navParams} />);
      case 'SellerPayouts':     return requireVerifiedSeller(<SellerOrders {...publicProps} />);
      // Hidden (owner 2026-11-03): KenteXa never holds the seller's money; an old link opens Maagizo.
      case 'SellerWallet':      return requireVerifiedSeller(<SellerOrders {...publicProps} />);
      case 'BecomeAgent':       return <BecomeAgent {...publicProps} />;
      case 'BecomeSuperAgentInfo': return <BecomeSuperAgentInfo {...publicProps} />;
      case 'VerifyReceipt':     return <VerifyReceipt {...publicProps} />;
      case 'PayInvoice':        return isLoggedIn ? <MyOrders {...publicProps} /> : <Welcome {...publicProps} />; // hidden for now

      case 'MyOrders':          return requireLogin(<MyOrders {...publicProps} />);
      case 'EditPublicProfile': return requireLogin(<EditPublicProfile {...publicProps} commerceProfileId={navParams?.commerceProfileId} />);
      case 'PayoutSettings': return requireLogin(<PayoutSettings {...publicProps} />);
      case 'InviteFriends': return requireLogin(<InviteFriends {...publicProps} />);
      case 'CustomerProfile':   return requireLogin(<CustomerProfile {...publicProps} editField={navParams?.editField} />);
      case 'Checkout':
        // Signed out at checkout: buy with a phone number, no sign-up first (owner 2026-11-10).
        if (!isLoggedIn) return <GuestCheckout onNavigate={handleNavigate} onLoginSuccess={handleLoginSuccess} />;
        return <Checkout {...publicProps} />;
      case 'GuestCheckout':
        return isLoggedIn ? <Checkout {...publicProps} /> : <GuestCheckout onNavigate={handleNavigate} onLoginSuccess={handleLoginSuccess} />;
      case 'StoreSettings':     return requireVerifiedSeller(<StoreSettings {...publicProps} userId={activeContext?.userId} />);
      case 'SellerDashboard':   return requireVerifiedSeller(<SellerDashboard {...publicProps} />);
      case 'BusinessDashboard': return requireLogin(<BusinessDashboard {...publicProps} />);
      case 'MyBusinesses':      return requireLogin(<MyBusinesses {...publicProps} />);
      case 'Workspace':         return requireLogin(<Workspace {...publicProps} />);
      case 'CreateCommunity':   return requireLogin(<CreateCommunity {...publicProps} />);
      case 'ConnectSelling':    return requireLogin(<ConnectSelling {...publicProps} />);
      case 'BusinessHome':      return requireLogin(<BusinessHome {...publicProps} businessId={null} />);
      case 'BusinessIntegrations': return requireLogin(<BusinessIntegrations {...publicProps} businessId={navParams?.businessId} returnTo={navParams?.returnTo} />);
      case 'MyClassifieds':     return requireLogin(<SellerClassifieds {...publicProps} listingMode="personal" />);
      case 'CreateClassified':  return requireLogin(<SellerClassifieds {...publicProps} listingMode="personal" createOnly prefill={navParams?.prefill} />);
      case 'BecomeBusiness':    return <BecomeBusiness {...publicProps} presetCategory={navParams?.category} />;
      case 'SellerProducts':    return requireLogin(<SellerProducts {...publicProps} />);
      case 'MyBrands':          return requireVerifiedSeller(<MyBrands {...publicProps} />);
      case 'BrandDashboard':    return requireLogin(<BrandDashboard {...publicProps} />);
      case 'BrandCatalog':      return requireLogin(<BrandCatalog {...publicProps} />);
      case 'TeamPOS': {
        const team = navParams?.posTeam || loadPosTeam();
        return team ? requireLogin(<POS {...publicProps} posTeam={team} activeProfileId={team.commerceProfileId || undefined} />) : requireLogin(<Workspace {...publicProps} />);
      }
      case 'POS': {
        // A cashier invited by a business (owner 2026-11-03) sells on THAT business's till: the
        // owner's verification covers the shop; the server checks her canOperatePOS on every call.
        const posTeam = navParams?.posTeam || (!OWN_TILL_ROLES.includes(activeContext?.roleType) ? loadPosTeam() : null);
        if (posTeam) return requireLogin(<POS {...publicProps} posTeam={posTeam} activeProfileId={posTeam.commerceProfileId || undefined} />);
        return requireVerifiedSeller(<POS {...publicProps} />);
      }
      case 'SellerClassifieds': return requireLogin(<SellerClassifieds {...publicProps} listingMode="business" />);
      case 'SellerOrders':      return requireVerifiedSeller(<SellerOrders {...publicProps} />);
      // Hidden (2026-11-03): an escrow-era page ("KenteXa holds the money"), linked from nowhere; old links open Maagizo.
      case 'SellerShipping':    return requireVerifiedSeller(<SellerOrders {...publicProps} />);
      case 'SendShipment':      return requireLogin(<SendShipment {...publicProps} navParams={navParams} />);
      case 'MyShipments':       return requireLogin(<MyShipments {...publicProps} />);
      case 'SellerInvoices':    return requireVerifiedSeller(<SellerInvoices {...publicProps} preSelected={navParams?.preSelected} />);
      case 'AgentDashboard':    return requireLogin(<AgentDashboard {...publicProps} />);
      case 'AgentOrderDashboard': return requireLogin(<AgentDashboard {...publicProps} />); // merged into unified dashboard
      case 'SuperAgentDashboard':   return requireLogin(<SuperAgentDashboard {...publicProps} startTab={navParams?.tab} />);
      // The old daily-batch screens read an API that is not served (owner 2026-11-09 audit, known fault #11):
      // they open the office's own POKEA / TUMA instead.
      case 'DispatcherManifest':    return requireLogin(<SuperAgentDashboard {...publicProps} startTab="tuma" />);
      case 'HubReceive':           return requireLogin(<SuperAgentDashboard {...publicProps} startTab="pokea" />);
      case 'BatchHandoff':          return requireLogin(<SuperAgentDashboard {...publicProps} startTab="tuma" />);
      case 'SuperAgentParcel':       return requireLogin(<SuperAgentParcel {...publicProps} />);
      case 'SuperAgentSettings':     return requireLogin(<SuperAgentSettings {...publicProps} />);
      case 'SellerShipment':         return requireVerifiedSeller(<SellerShipment {...publicProps} prefill={navParams} />);
      case 'Dashboard':   return requireAdmin(<Dashboard activePage={page} {...adminProps} />);
      case 'Products':    return requireAdmin(<Products activePage={page} {...adminProps} />);
      case 'Classifieds': return requireAdmin(<Classifieds activePage={page} {...adminProps} />);
      case 'Users':       return requireAdmin(<Users activePage={page} {...adminProps} />);
      case 'Orders':      return requireAdmin(<Orders activePage={page} {...adminProps} />);
      case 'AdminShipments': return requireAdmin(<AdminShipments activePage={page} {...adminProps} />);
      case 'AdminDispatchReminders': return requireAdmin(<AdminDispatchReminders activePage={page} {...adminProps} />);
      case 'AdminAdvertisers': return requireAdmin(<AdminAdvertisers activePage={page} {...adminProps} />);
      case 'AdminKentexaFees': return requireAdmin(<AdminKentexaFees activePage={page} {...adminProps} />);
      case 'AdminShippingCheck': return requireAdmin(<AdminShippingCheck activePage={page} {...adminProps} />);
      // Owner 2026-11-09: the admin mirror. Every action, and one page per person / business.
      case 'AdminActivity': return requireAdmin(<AdminActivity activePage={page} {...adminProps} />);
      case 'AdminPerson': return requireAdmin(<AdminPerson activePage="Users" userId={navParams?.userId} {...adminProps} />);
      case 'AdminChats': return requireAdmin(<AdminChats activePage="AdminChats" userId={navParams?.userId} {...adminProps} />);
      case 'AdminOnboarding': return requireAdmin(<AdminOnboarding activePage="AdminOnboarding" {...adminProps} />);
      case 'AdminResale': return requireAdmin(<AdminResale activePage="AdminResale" {...adminProps} />);
      case 'AdminBusinessView': return requireAdmin(<AdminBusinessView activePage="Businesses" businessId={navParams?.businessId} {...adminProps} />);
      // Stage 3: every kind of data that had no admin page (one screen, the menu item picks the list).
      case 'AdminMoments': case 'AdminReports': case 'AdminCommunities': case 'AdminHotelOrders': case 'AdminPosSales':
      case 'AdminTeamInvitations': case 'AdminInstagram': case 'AdminOfficePrices': case 'AdminAgentJobs': case 'AdminReviews':
      case 'AdminNotifications':
        return requireAdmin(<AdminData key={page} dataset={PAGE_DATASET[page]} activePage={page} {...adminProps} />);
      case 'AdminStaff': return requireAdmin(<AdminStaff activePage={page} {...adminProps} />);
      // Mfululizo na Mada (#410 phase 3).
      case 'AdminSeries': return requireAdmin(<AdminSeries activePage={page} {...adminProps} />);
      case 'AdminWriters': return requireAdmin(<AdminWriters activePage={page} {...adminProps} />);
      case 'Payments':    return requireAdmin(<Payments activePage={page} {...adminProps} />);
      case 'Sellers':     return requireAdmin(<Sellers activePage={page} {...adminProps} />);
      case 'Businesses':  return ['admin', 'manager', 'customer_care', 'moderator'].includes(activeContext?.roleType)
        ? requireAdmin(<Businesses activePage={page} {...adminProps} />)
        : <HomeFeed {...publicProps} />;
      // 'AdminServices', not 'Services' — that page key is already taken by
      // the public services-browse page below; a duplicate case label would
      // have silently made this the only one that ever executes, breaking
      // the public page for every user.
      case 'AdminServices': return requireAdmin(<AdminServices activePage={page} {...adminProps} />);
      case 'IdentityVerifications': return requireAdmin(<IdentityVerifications activePage={page} {...adminProps} />);
      case 'AdminBrands': return requireAdmin(<AdminBrands activePage={page} {...adminProps} />);
      case 'AdminBrandAuthorizations': return requireAdmin(<AdminBrandAuthorizations activePage={page} {...adminProps} />);
      case 'AdminWarrantyClaims': return requireAdmin(<AdminWarrantyClaims activePage={page} {...adminProps} />);
      case 'OfficialProducts': return requireAdmin(<OfficialProducts activePage={page} {...adminProps} />);
      case 'Agents':      return requireAdmin(<Agents activePage={page} {...adminProps} />);
      case 'Profile':     return requireLogin(<Profile activePage={page} {...adminProps} />);
      case 'TrackParcel': return <TrackParcel {...publicProps} />;
      case 'SuperAgents': return requireAdmin(<SuperAgents activePage={page} {...adminProps} />);
      case 'Disputes':    return requireAdmin(<Disputes    activePage={page} {...adminProps} />);
      case 'Payouts':     return requireAdmin(<Payouts     activePage={page} {...adminProps} />);
      case 'Invoices':    return requireAdmin(<Invoices    activePage={page} {...adminProps} />);
      case 'Reports':        return requireAdmin(<Reports     activePage={page} {...adminProps} />);
      case 'ContactMessages': return requireAdmin(<ContactMessages activePage={page} {...adminProps} />);
      case 'Announcements':    return requireAdmin(<Announcements activePage={page} targetUserId={navParams?.targetUserId} targetName={navParams?.targetName} {...adminProps} />);
      case 'Analytics':        return requireAdmin(<Analytics activePage={page} {...adminProps} />);
      case 'BodaRates':         return requireAdmin(<BodaRates onNavigate={handleNavigate} onLogout={handleLogout} />);
      case 'RouteManagement':   return requireAdmin(<RouteManagement onNavigate={handleNavigate} onLogout={handleLogout} />);
      case 'CollectionFees':    return requireAdmin(<CollectionFees onNavigate={handleNavigate} onLogout={handleLogout} />);
      case 'AgentPerformance':  return requireAdmin(<AgentPerformance onNavigate={handleNavigate} onLogout={handleLogout} />);
      case 'FinancialDashboard': return requireAdmin(<FinancialDashboard onNavigate={handleNavigate} onLogout={handleLogout} />);

      case 'BecomeTransportProvider':    return requireLogin(<BecomeTransportProvider {...publicProps} />);
      case 'TransportProviderDashboard': return requireLogin(<TransportProviderDashboard {...publicProps} />);
      case 'TransportProviderSettings': return requireLogin(<TransportProviderSettings {...publicProps} />);
      case 'TransportAdmin':             return requireAdmin(<TransportAdmin onNavigate={handleNavigate} activePage={page} />);
      case 'VanOperations':              return requireAdmin(<VanOperations onNavigate={handleNavigate} activePage={page} />);
      case 'HubAdmin':                   return requireAdmin(<HubAdmin onNavigate={handleNavigate} activePage={page} />);
      case 'SellerAnalytics':            return requireVerifiedSeller(<SellerAnalytics {...publicProps} />);
      case 'SellerTeam':                 return requireVerifiedSeller(<SellerTeam {...publicProps} />);
      case 'AgentScorecard':             return requireLogin(<AgentScorecard {...publicProps} />);
      case 'Wishlist':                   return requireLogin(<Wishlist {...publicProps} />);
      case 'SellerInbox':                return requireLogin(<SellerInbox {...publicProps} />);

      case 'Services':                     return <Services {...publicProps} />;
      case 'PostService':                  return requireLogin(<PostService {...publicProps} />);
      case 'MyServices':                   return requireVerifiedSeller(<MyServices {...publicProps} />);
      default: return <HomeFeed {...publicProps} />;
    }
  };

  const handleLangPick = (lang) => {
    changeAppLanguage(i18n, lang);
    setShowLangPicker(false);
  };

  if (posOfflineBoot && (authStatus === 'restoring' || !isLoggedIn)) {
    return <POS onNavigate={() => {}} offlineBoot />;
  }

  if (authStatus === 'restoring') {
    return (<>
      <div role="status" style={{ minHeight:'100vh', display:'grid', placeItems:'center', color:'#64748b' }}>Inafungua KenteXa…</div>
      <SlowNetworkNotice page="restoring" />
    </>);
  }

  return (
    <OnboardingProvider currentUser={currentUser}>
    <CartProvider>
      {/* Safety net (owner 2026-11-15): a failing page shows "Jaribu tena", never a white screen. */}
      {/* One navigation (owner 2026-11-16, #374): once opened, Home stays loaded while other pages
          are open, so coming back shows the same posts at the same place, like the big apps. */}
      {homeAlive && (
        <div data-testid="kept-home" style={{ display: page === 'Home' ? 'block' : 'none' }} aria-hidden={page !== 'Home'}>
          <PageErrorBoundary page="Home" onHome={() => handleNavigate('Home')}>
            <ContextEpochBoundary contextEpoch={contextEpoch}><HomeFeed {...homeProps} /></ContextEpochBoundary>
          </PageErrorBoundary>
        </div>
      )}
      <PageErrorBoundary page={page} onHome={() => handleNavigate('Home')}>
        <Suspense fallback={<PageLoading />}>
          <ContextEpochBoundary contextEpoch={contextEpoch}>{renderPage()}</ContextEpochBoundary>
        </Suspense>
      </PageErrorBoundary>
      <SlowNetworkNotice page={page} />

      {/* A phone that kept the app open gets a new website version by itself, never mid-form. */}
      <UpdateNotice page={page}
        beforeReload={() => rememberPageForUpdate({ page, navParams, roleType: activeContext?.roleType })} />
      <TrainingSmsNotice />
      {navNotice && (
        <div role="status" data-testid="nav-notice"
          style={{ position: 'fixed', left: 12, right: 12, bottom: 84, zIndex: 3000, maxWidth: 520, margin: '0 auto', background: '#0f1419', color: '#fff',
            borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', fontSize: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
          <span style={{ flex: 1 }}>{navNotice.text}</span>
          {navNotice.canSwitch && isLoggedIn && (
            <button type="button" onClick={() => { setNavNotice(null); setShowProfileSwitcher(true); }}
              style={{ background: '#fff', color: '#0f1419', border: 'none', borderRadius: 16, padding: '6px 12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Badilisha kazi</button>
          )}
          <button type="button" aria-label="Funga" onClick={() => setNavNotice(null)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1, fontFamily: 'inherit' }}>×</button>
        </div>
      )}

      {/* ── Social Commerce Navigation ─────────────────────── */}
      {/* Hidden during Onboarding — a focused setup wizard shouldn't show
          tab navigation, and this also fixes the Continue button being
          hidden behind the nav bar on each step. Also hidden on the Inbox
          (SellerInbox / SellerInbox-{id} / MessageSeller-{id}, same
          startsWith check already used above for the unread-refetch-on-exit
          logic): SellerInbox.js is its own full 100dvh chat surface with a
          message composer pinned to the true bottom edge — this fixed,
          position:fixed, zIndex:1000 bar was rendering directly on top of
          it, covering the send button (and on the conversation list, the
          bottom rows) since nothing in SellerInbox reserved space for it. */}
      {/* Viral engine C11 (#381): right after posting a question, poll or discussion. */}
      {postedNudge && !postedSheet && (
        <ShareNudge floating testid="posted-nudge"
          title={postedNudge.intent === 'poll' ? 'Kura yako iko hewani' : postedNudge.intent === 'question' ? 'Swali lako liko hewani' : postedNudge.intent === 'article' ? 'Makala yako iko hewani' : 'Mjadala wako uko hewani'}
          text={postedNudge.intent === 'poll' ? 'Shiriki ili watu wengi zaidi wapige kura.' : postedNudge.intent === 'question' ? 'Shiriki ili upate majibu haraka.' : postedNudge.intent === 'article' ? 'Shiriki ili watu wengi zaidi waisome.' : 'Shiriki ili watu wajiunge na mazungumzo.'}
          onShare={() => setPostedSheet(true)} onDismiss={() => setPostedNudge(null)} />
      )}
      {postedNudge && postedSheet && (
        <ShareSheet open onClose={() => { setPostedSheet(false); setPostedNudge(null); }} contentType="post" contentId={Number(postedNudge.id)}
          words={postedNudge.intent === 'article' ? postedNudge.title : (postedNudge.body || postedNudge.title)} intent={postedNudge.intent} plainUrl={`${window.location.origin}/post/${postedNudge.id}`} />
      )}
      {/* Viral engine B (#381): a guest who taps Jibu, Penda, Kura, Jiunge... is invited to join here. */}
      {!isLoggedIn && <GuestJoinSheet onNavigate={handleNavigate} />}
      {isLoggedIn && !needsProfilePhoto && !needsOnboarding && page !== 'Onboarding' && page !== 'AddProfilePhoto' && page !== 'POS' && page !== 'TeamPOS'
        && !(typeof page === 'string' && (page.startsWith('SellerInbox') || page.startsWith('MessageSeller') || page.startsWith('MessageOperational')))
        // Tuma mzigo (send form v2) is a focused 5-step form with its own back button and an
        // "Endelea" bar pinned to the bottom: the menu bar would cover it on a phone.
        && !(typeof page === 'string' && (page.startsWith('SendShipment') || page.startsWith('SellerShipment'))) && (
        <BottomNav
          // Remount protection (profile-switch architecture spec): a stable
          // profile-context key forces React to tear down and rebuild this
          // subtree on every profile switch rather than patch it in place.
          // BottomNav itself holds no internal state that could go stale —
          // its tabs are already fully re-derived from activeProfile on
          // every render — but this makes "one active profile = one fresh
          // navigation instance" true structurally, not just by convention,
          // so a future change that DOES add local nav state can't
          // reintroduce the leak-across-switches bug this key guards against.
          key={activeContext ? `role-${activeContext.accountRoleId}-${contextEpoch}` : 'no-context'}
          currentPage={page}
          onNavigate={handleNavigate}
          isLoggedIn={isLoggedIn}
          userRole={userRole}
          activeContext={activeContext}
          currentUser={currentUser}
          onPostClick={() => setShowPostModal(true)}
          activeProfile={activeProfile}
          activeBusinessName={activeBusinessNameFor(activeContext, roleOptions)}
          myProfiles={myProfiles}
          onOpenSwitcher={() => setShowProfileSwitcher(true)}
          switching={roleSwitching}
        />
      )}
      {showProfileSwitcher && (
        <ProfileSwitcherSheet
          profiles={myProfiles}
          activeAccountRoleId={activeContext?.accountRoleId}
          onSwitch={handleSwitchProfile}
          onClose={() => setShowProfileSwitcher(false)}
          onNavigate={handleNavigate}
          onOpenBusiness={(businessId) => { setShowProfileSwitcher(false); handleNavigate(`BusinessHome-${businessId}`); }}
          switching={roleSwitching}
          error={roleSwitchError}
        />
      )}
      {showPostModal && (
        <PostModal
          onNavigate={handleNavigate}
          onClose={() => setShowPostModal(false)}
          activeProfile={activeProfile}
          onOpenMoment={(mode) => {
            setShowPostModal(false);
            setMomentModalMode(mode);
            setMomentCommunityId(null);
            setMomentStart(null);
            setShowMomentModal(true);
          }}
        />
      )}
      {showMomentModal && (
        <CreateMomentModal
          currentUser={currentUser}
          initialMode={momentModalMode}
          initialCommunityId={momentCommunityId}
          initialKind={momentStart?.kind || null}
          initialText={momentStart?.text || ''}
          initialTagged={momentStart?.tagged || null}
          activeProfileId={momentActorProfileId(activeProfile) ?? null}
          activeProfile={activeProfile}
          onNavigate={handleNavigate}
          onClose={() => setShowMomentModal(false)}
          onPosted={(created) => {
            setMomentRefreshKey(k => k + 1);
            if (page !== 'Home') handleNavigate('Home');
            // Viral engine C11 (#381): a new public question, poll or discussion: one invitation to share it.
            if (created?.id && ['question', 'poll', 'discussion'].includes(created.intent) && (created.visibility || 'public') === 'public') setPostedNudge(created);
          }}
          onOpenArticle={(start) => { setShowMomentModal(false); setArticleStart(start || {}); }}
        />
      )}
      {articleStart && isLoggedIn && (
        <ArticleEditor
          initialCommunityId={articleStart.communityId ?? null}
          initialText={articleStart.text || ''}
          activeProfileId={momentActorProfileId(activeProfile) ?? null}
          onClose={() => setArticleStart(null)}
          onPosted={(created) => {
            setMomentRefreshKey(k => k + 1);
            // The writer lands on the new Makala, ready to share it.
            if (created?.id) { handleNavigate(`PostDetail-${created.id}`); setPostedNudge(created); }
          }}
        />
      )}

      {/* Notification opt-in explanation — shown before the native browser permission prompt */}
      {showNotificationPrompt && 'Notification' in window && Notification.permission === 'default' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 420, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', borderRadius: 20, padding: '24px 22px', boxShadow: '0 24px 70px rgba(0,0,0,0.32)', textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>🔔</div>
            <h2 style={{ margin: '0 0 10px', color: '#0f172a', fontSize: 22, fontWeight: 900 }}>Usikose taarifa muhimu za Kentexa!</h2>
            <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 15, lineHeight: 1.55 }}>Washa notifications ili upate taarifa za:</p>
            <div style={{ textAlign: 'left', background: '#f8fafc', borderRadius: 14, padding: '14px 16px', marginBottom: 20, color: '#1e293b', fontSize: 15, lineHeight: 1.7 }}>
              <div>• Ujumbe mpya (Chat)</div><div>• Watu wanaokufuata (Followers)</div><div>• Posts na comments</div><div>• Ofa maalum</div><div>• Taarifa nyingine muhimu za Kentexa</div>
            </div>
            <button onClick={() => { setShowNotificationPrompt(false); Notification.requestPermission().then(perm => { if (perm === 'granted') subscribeToPush(process.env.REACT_APP_API_URL || '').catch(() => {}); }); }} style={{ width: '100%', minHeight: 48, padding: '13px 16px', border: 0, borderRadius: 12, background: '#1d4ed8', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', marginBottom: 10 }}>Washa Notifications</button>
            <button onClick={() => setShowNotificationPrompt(false)} style={{ width: '100%', minHeight: 48, padding: '12px 16px', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff', color: '#334155', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Baadaye</button>
          </div>
        </div>
      )}
      {/* First-visit language picker — Landing Localization L1 (§2): buttons
          now come from the canonical SUPPORTED_LANGUAGES list instead of 3
          hardcoded ones, and the modal's own copy is translated via t()
          rather than hand-written bilingual text. i18n.js has already
          resolved a sensible initial language (URL/saved/browser/default)
          by the time this renders, so t() here always has something sane
          to render even before the visitor picks anything. */}
      {showLangPicker && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: '32px 24px', width: '100%', maxWidth: 340, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}><LineIcon name="globe" size={40} /></div>
            <h2 style={{ fontSize: 20, fontWeight:800, color: '#1e293b', margin: '0 0 6px', fontFamily:'inherit' }}>{t('welcome.language_picker.title')}</h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 24px' }}>{t('welcome.language_picker.subtitle')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button key={lang.code} onClick={() => handleLangPick(lang.code)}
                  style={{ padding: '14px', borderRadius: 12, border: lang.code === 'sw' ? '2px solid #1d4ed8' : '2px solid #e2e8f0', backgroundColor: lang.code === 'sw' ? '#eff6ff' : '#f8fafc', cursor: 'pointer', fontSize: 15, fontWeight: 800, color: lang.code === 'sw' ? '#1d4ed8' : '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  {lang.flag} {lang.label}
                  {lang.code === 'sw' && <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>({t('welcome.language_picker.recommended')})</span>}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 16 }}>{t('welcome.language_picker.hint')}</p>
          </div>
        </div>
      )}
      <AndroidAppPromo languagePickerOpen={showLangPicker} page={page} />
      {canInstall && showInstallPrompt && page === 'Home' && !showLangPicker && !showPostModal &&
        !showMomentModal && !showGuide &&
        !(environment.android && /Chrome\//i.test(navigator.userAgent || '') && !/EdgA|OPR|SamsungBrowser|Firefox|CriOS/i.test(navigator.userAgent || '')) &&
        <InstallBanner onInstall={handleInstall} onDismiss={handleDismiss} play={playOffer} />}
      {/* Inside the Google Play app: alerts come as the app (owner 2026-11-10). */}
      {/* Alerts card: Android app as before; on the web for signed-in people with alerts off (Smart Post / alerts opt-in, approved 2026-11-27). */}
      {isLoggedIn && page === 'Home' && !showLangPicker && !showPostModal && !showMomentModal && !showNotificationPrompt &&
        <AppPushCard allowDenied={!!environment.androidApp} />}
      {showGuide && <InstallGuide environment={environment} onClose={closeGuide} />}
    </CartProvider>
    </OnboardingProvider>
  );
}

export default App;
