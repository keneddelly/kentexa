import React, { useState, useEffect } from 'react';
import { usePWA, InstallBanner, subscribeToPush } from './public/hooks/usePWA';
import api from './api/api';
import { CartProvider } from './context/CartContext';
import useAnalytics from './public/hooks/useAnalytics';
import HomeFeed           from './public/pages/HomeFeed';
import MyProfile          from './public/pages/MyProfile';
import RoleActivation     from './public/pages/RoleActivation';
import Onboarding          from './public/pages/Onboarding';
import AddProfilePhoto     from './public/pages/AddProfilePhoto';
import FlashSales          from './public/pages/FlashSales';
import PickupPoints        from './public/pages/PickupPoints';
import RouteCoverageMap   from './public/pages/RouteCoverageMap';
import Activity       from './public/pages/Activity';
import BottomNav      from './public/components/BottomNav';
import ProfileSwitcherSheet from './public/components/ProfileSwitcherSheet';
import PostModal      from './public/components/PostModal';
import CreateMomentModal from './public/components/CreateMomentModal';
import BecomeSellerInfo from './public/pages/BecomeSellerInfo';
import ConfirmDelivery    from './public/pages/ConfirmDelivery';
import SellerCustomers   from './public/pages/SellerCustomers';
import AgentEarnings     from './public/pages/AgentEarnings';
import SellerPayouts     from './public/pages/SellerPayouts';
import SellerAnalytics            from './public/pages/SellerAnalytics'; // eslint-disable-line
import BecomeTransportProvider    from './public/pages/BecomeTransportProvider'; // eslint-disable-line
import TransportAdmin             from './admin/pages/TransportAdmin'; // eslint-disable-line
import HubAdmin                   from './admin/pages/HubAdmin'; // eslint-disable-line
import SellerTeam                 from './public/pages/SellerTeam'; // eslint-disable-line
import AgentScorecard             from './public/pages/AgentScoreCard'; // eslint-disable-line
import Wishlist                   from './public/pages/Wishlist'; // eslint-disable-line
import CommerceProfile            from './public/pages/CommerceProfile'; // eslint-disable-line
import Services                   from './public/pages/Services'; // eslint-disable-line
import ServiceDetail               from './public/pages/ServiceDetail'; // eslint-disable-line
import PostService                 from './public/pages/PostService'; // eslint-disable-line
import MyServices                  from './public/pages/MyServices'; // eslint-disable-line
import TransportProviderDashboard from './public/pages/TransportProviderDashboard'; // eslint-disable-line
import SellerInbox       from './public/pages/SellerInbox';
import Stores from './public/pages/Stores';
import SellerStore from './public/pages/SellerStore';
import ClassifiedsPublic from './public/pages/ClassifiedsPublic';
import PublicLogin from './public/pages/PublicLogin';
import Register from './public/pages/Register';
import ProductDetail from './public/pages/ProductDetail';
import ClassifiedDetail from './public/pages/ClassifiedDetail';
import OrderTracking       from './public/pages/OrderTracking';
import MyOrders from './public/pages/MyOrders';
import CustomerProfile from './public/pages/CustomerProfile';
import BecomeSeller from './public/pages/BecomeSeller';
import SellerDashboard from './public/pages/SellerDashboard';
import BecomeAgent from './public/pages/BecomeAgent';
import AgentDashboard from './public/pages/AgentDashboard';
import Cart from './public/pages/Cart';
import Checkout from './public/pages/Checkout';
import Search from './public/pages/Search';
import VerifyReceipt from './public/pages/VerifyReceipt';
import SellerProducts from './public/pages/SellerProducts';
import SellerClassifieds from './public/pages/SellerClassifieds';
import SellerOrders from './public/pages/SellerOrders';
import SellerInvoices from './public/pages/SellerInvoices';
import SellerShipping from './public/pages/SellerShipping';
import PayInvoice from './public/pages/PayInvoice';
import Dashboard from './admin/pages/Dashboard';
import Products from './admin/pages/Products';
import Classifieds from './admin/pages/Classifieds';
import Profile from './admin/pages/Profile';
import Users from './admin/pages/Users';
import SuperAgents from './admin/pages/SuperAgents';
import Disputes from './admin/pages/Disputes';
import Payouts from './admin/pages/Payouts';
import Invoices from './admin/pages/Invoices';
import Reports from './admin/pages/Reports';
import Orders from './admin/pages/Orders';
import ContactMessages from './admin/pages/ContactMessages';
import Announcements from './admin/pages/Announcements';
import Analytics from './admin/pages/Analytics';
import Payments from './admin/pages/Payments';
import Sellers from './admin/pages/Sellers';
import Agents from './admin/pages/Agents';
import SuperAgentDashboard from './public/pages/SuperAgentDashboard';
import TrackParcel from './public/pages/TrackParcel';
import DispatcherManifest from './public/pages/DispatcherManifest';
import HubReceive from './public/pages/HubReceive';
import ZoneManagement from './admin/pages/ZoneManagement';
import BodaRates from './admin/pages/BodaRates';
import RouteManagement from './admin/pages/RouteManagement';
import AgentPerformance from './admin/pages/AgentPerformance';
import FinancialDashboard from './admin/pages/FinancialDashboard';
import CollectionFees from './admin/pages/CollectionFees';
import BatchHandoff from './public/pages/BatchHandoff';
import OfflineIntercityOrder from './public/pages/OfflineIntercityOrder';
import SuperAgentParcel from './public/pages/SuperAgentParcel';
import SuperAgentSettings from './public/pages/SuperAgentSettings';
import SellerShipment from './public/pages/SellerShipment';
import BuyerParcelAction from './public/pages/BuyerParcelAction';
import VanToday from './public/pages/VanToday';
import StoreSettings from './seller/pages/StoreSettings';
import BecomeSuperAgentInfo from './public/pages/BecomeSuperAgentInfo';
import CategoryPage from './public/pages/CategoryPage';
import ListingsPage from './public/pages/ListingsPage';
import AboutUs from './public/pages/AboutUs';
import ContactUs from './public/pages/ContactUs';
import HowItWorks from './public/pages/HowItWorks';
import TermsAndConditions from './public/pages/TermsAndConditions';
import PrivacyPolicy from './public/pages/PrivacyPolicy';

const decodeToken = (token) => {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
};

const checkToken = () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return { loggedIn: false, role: null };
    const decoded = decodeToken(token);
    if (!decoded) return { loggedIn: false, role: null };
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      localStorage.removeItem('token');
      return { loggedIn: false, role: null };
    }
    return { loggedIn: true, role: decoded.role };
  } catch (e) {
    return { loggedIn: false, role: null };
  }
};

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .catch(() => {}); // Silent fail - SW is progressive enhancement
  });
}

function App() {
  const { showInstallPrompt, handleInstall, handleDismiss } = usePWA();
  const [isLoggedIn, setIsLoggedIn] = useState(() => checkToken().loggedIn);
  const [userRole, setUserRole]     = useState(() => checkToken().role);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showMomentModal, setShowMomentModal] = useState(false);
  const [momentModalMode, setMomentModalMode] = useState('selling');
  const [momentRefreshKey, setMomentRefreshKey] = useState(0);
  const [currentUser, setCurrentUser] = useState(() => {
    // Load cached user from localStorage so forms pre-fill immediately
    try { return JSON.parse(localStorage.getItem('kentexa_user') || 'null'); }
    catch { return null; }
  });
  const [page, setPage]             = useState(() => {
    // Bootstrap from a real URL — lets external links (WhatsApp, SMS) deep-link
    // straight into tracking instead of always landing on Home.
    // e.g. https://kentexa.com/?track=KTX-ORD-47  →  TrackParcel-KTX-ORD-47
    try {
      const params = new URLSearchParams(window.location.search);
      const track   = params.get('track');
      const confirm = params.get('confirm');
      const token   = params.get('token');
      if (confirm && token) return `ConfirmDelivery-${token}`;
      if (track) return `TrackParcel-${track}`;
    } catch { /* SSR or no window — fall through */ }
    return 'Home';
  });
  const [navParams, setNavParams]   = useState(null);
  // Show language picker only on first visit
  const [showLangPicker, setShowLangPicker] = useState(() => !localStorage.getItem('kentexa_lang'));

  // ── Active commerce profile ───────────────────────────────────────────────
  // Every account owns one PERSONAL profile plus whichever business/hub/
  // agent/transport profiles it's had approved. "Active" is which one the
  // app shell is currently acting as — it changes what BottomNav shows and
  // what new posts get attributed to, but never re-authenticates: it's the
  // same account, same JWT, just a different lens (same model as switching
  // between a personal Facebook profile and a Page you manage).
  const [myProfiles, setMyProfiles] = useState([]);
  const [activeProfileId, setActiveProfileIdState] = useState(() => {
    const v = localStorage.getItem('kentexa_active_profile_id');
    return v ? Number(v) : null;
  });
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);
  const activeProfile = myProfiles.find(p => p.id === activeProfileId)
    || myProfiles.find(p => p.type === 'personal')
    || null;

  const setActiveProfileId = (id) => {
    setActiveProfileIdState(id);
    if (id) localStorage.setItem('kentexa_active_profile_id', String(id));
    else localStorage.removeItem('kentexa_active_profile_id');
  };

  // Loads every profile this account can act as, once logged in. Re-runs
  // after login and can be called again after a new role gets approved
  // (RoleActivation) so a freshly-created profile shows up in the switcher
  // without requiring a full app reload.
  const loadMyProfiles = () => {
    api.get('/profiles/mine').then(res => {
      const list = res.data || [];
      setMyProfiles(list);
      // First time ever (no stored choice) or the stored profile no longer
      // exists (e.g. different browser/device) — default to personal.
      if (!activeProfileId || !list.some(p => p.id === activeProfileId)) {
        const personal = list.find(p => p.type === 'personal');
        if (personal) setActiveProfileId(personal.id);
      }
    }).catch(() => {});
  };

  useEffect(() => {
    if (isLoggedIn) loadMyProfiles();
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Which page each profile type lands on when it becomes active — the
  // "home base" for that identity, same idea as roleHome() below but keyed
  // to the profile actually being switched to, not the account's overall role.
  const DASHBOARD_BY_TYPE = {
    business: 'SellerDashboard',
    hub: 'SuperAgentDashboard',
    transport_provider: 'TransportProviderDashboard',
    agent: 'AgentDashboard',
    personal: 'Home',
  };

  const handleSwitchProfile = (profileId) => {
    setActiveProfileId(profileId);
    setShowProfileSwitcher(false);
    const p = myProfiles.find(x => x.id === profileId);
    handleNavigate(DASHBOARD_BY_TYPE[p?.type] || 'Home');
  };

  // Analytics — tracks every page, click, scroll automatically
  const { track } = useAnalytics({
    page,
    isLoggedIn,
    userId: (() => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return null;
        return JSON.parse(atob(token.split('.')[1]))?.sub || null;
      } catch { return null; }
    })(),
  });

  // ── Role-based home — where to go when history is empty ─────────────────
  const roleHome = () => {
    if (!isLoggedIn) return 'Home';
    switch (userRole) {
      case 'admin':       return 'Dashboard';
      case 'super_agent': return 'SuperAgentDashboard';
      case 'agent':       return 'AgentDashboard';
      case 'seller':      return 'SellerDashboard';
      default:            return 'Home';
    }
  };

  // ── Navigation history stack ──────────────────────────────────────────────
  // Enables onNavigate('back') to always return to the correct previous page
  // regardless of what each page hard-codes as its back destination.
  // eslint-disable-next-line no-unused-vars
  const [navHistory, setNavHistory] = useState([]);

  const handleNavigate = (pageName, params = null) => {
    if (pageName === 'back') {
      // Pop the history stack
      setNavHistory(h => {
        const prev = [...h];
        const destination = prev.pop() || roleHome();
        setNavParams(null);
        setPage(destination);
        window.scrollTo(0, 0);
        return prev;
      });
      return;
    }
    // Push current page to history before navigating
    // Don't push if navigating to same page or going to login
    setNavHistory(h => {
      const current = page;
      if (current === pageName || pageName === 'PublicLogin') return h;
      // Cap history at 10 entries to avoid memory issues
      const next = [...h, current].slice(-10);
      return next;
    });
    setNavParams(params);
    setPage(pageName);
    window.scrollTo(0, 0);
  };

  const handleLoginSuccess = async (targetPage) => {
    try {
      const token   = localStorage.getItem('token');
      const decoded = decodeToken(token);
      if (decoded) {
        setIsLoggedIn(true);
        setUserRole(decoded.role);
        // Fetch full profile first — avatarUrl can't be read from the JWT
        // (it's signed before the mandatory-photo step completes, so a baked-in
        // claim would go stale). Await it so the photo gate can act on live data.
        let profile = null;
        try {
          const res = await api.get('/auth/profile');
          profile = res.data;
          setCurrentUser(profile);
          // Subscribe to push notifications in background
          if ('Notification' in window && Notification.permission === 'granted') {
            subscribeToPush(process.env.REACT_APP_API_URL || '').catch(() => {});
          } else if ('Notification' in window && Notification.permission !== 'denied') {
            Notification.requestPermission().then(perm => {
              if (perm === 'granted') subscribeToPush(process.env.REACT_APP_API_URL || '').catch(() => {});
            });
          }
          localStorage.setItem('kentexa_user', JSON.stringify(profile));
        } catch {}
        setNavParams(null);
        if (profile && !profile.avatarUrl) {
          setPage('AddProfilePhoto');
        } else if (!decoded.onboardingCompleted && decoded.role === 'user') {
          setTimeout(() => setPage('Onboarding'), 100);
        } else {
          // Check if there's a stored intended destination (e.g. from + menu)
          const intended = localStorage.getItem('kentexa_after_login');
          if (intended) {
            localStorage.removeItem('kentexa_after_login');
            setPage(intended);
          } else {
            const dest = typeof targetPage === 'string' ? targetPage : 'Home';
            setPage(dest);
          }
        }
        window.dispatchEvent(new Event('kentexa-auth-changed'));
      }
    } catch (e) {
      setIsLoggedIn(false);
      setUserRole(null);
    }
  };

  // Load profile on app start if token exists
  useEffect(() => {
    if (isLoggedIn && !currentUser) {
      api.get('/auth/profile').then(res => {
        setCurrentUser(res.data);
        localStorage.setItem('kentexa_user', JSON.stringify(res.data));
        if (!res.data.avatarUrl) {
          setPage('AddProfilePhoto');
        }
      }).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('kentexa_user');
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    setUserRole(null);
    setPage('Home');
    setNavParams(null);
    window.dispatchEvent(new Event('kentexa-auth-changed'));
  };



  const publicProps = {
    onNavigate: handleNavigate, isLoggedIn, onLogout: handleLogout, userRole, currentUser,
    onUserUpdated: handleUserUpdated,
    onOpenMoment: () => {
      if (!isLoggedIn) { handleNavigate('PublicLogin'); return; }
      setMomentModalMode('selling');
      setShowMomentModal(true);
    },
    momentRefreshKey,
  };
  const adminProps  = { onNavigate: handleNavigate, onLogout: handleLogout };

  const loginPage = <PublicLogin onNavigate={handleNavigate} onLoginSuccess={handleLoginSuccess} />;

  const requireLogin = (component) => {
    const token = localStorage.getItem('token');
    if (!token) return loginPage;
    return isLoggedIn ? component : loginPage;
  };

  const requireAdmin = (component) => {
    const token = localStorage.getItem('token');
    if (!token) return loginPage;
    const decoded = decodeToken(token);
    const role = decoded?.role;
    if (role === 'admin' || role === 'manager') return component;
    return <HomeFeed {...publicProps} />;
  };

  const renderPage = () => {
    const pageStr = typeof page === 'string' ? page : 'Home';
    if (pageStr !== page) { setPage('Home'); return <HomeFeed {...publicProps} />; }

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
    if (page.startsWith('ProductDetail-')) {
      const [rawId, suffix] = page.split('ProductDetail-')[1].split('-');
      return <ProductDetail {...publicProps} productId={Number(rawId)} track={track}
        initialTab={suffix === 'comments' ? 'reviews' : null} />;
    }
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
    if (page.startsWith('SellerStore-'))
      return <SellerStore {...publicProps} sellerId={page.split('SellerStore-')[1]} />;
    // Store- is a legacy alias — route it through the same CommerceProfile
    // page as everywhere else, so there is only ever ONE seller-profile
    // implementation (and therefore only one source of truth for follow state).
    if (page.startsWith('Store-'))
      return <CommerceProfile {...publicProps} pageParam={page.split('Store-')[1]} />;
    if (page.startsWith('CommerceProfile-')) {
      const pid = page.split('CommerceProfile-')[1];
      return <CommerceProfile {...publicProps} pageParam={pid} commerceProfileId={navParams?.commerceProfileId} />;
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
    if (page.startsWith('SellerPayouts-'))
      return requireLogin(<SellerPayouts {...publicProps} highlightOrderId={Number(page.split('SellerPayouts-')[1])} />);
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
    if (page.startsWith('BuyerParcelAction-'))
      return requireLogin(<BuyerParcelAction {...publicProps} trackingNumber={page.split('BuyerParcelAction-')[1]} />);
    if (page.startsWith('BatchHandoff-'))
      return requireLogin(<BatchHandoff {...publicProps} orderId={page.split('BatchHandoff-')[1]} />);
    if (page.startsWith('PayInvoice-'))
      return <PayInvoice {...publicProps} prefilledOrderId={page.split('PayInvoice-')[1]} />;
    if (page.startsWith('VerifyReceipt-'))
      return <VerifyReceipt {...publicProps} initialReceipt={page.split('VerifyReceipt-')[1]} />;
    if (page.startsWith('SellerInbox-')) {
      const customerId = page.split('SellerInbox-')[1];
      return requireLogin(<SellerInbox {...publicProps} initialCustomerId={customerId} />);
    }
    if (page.startsWith('MessageSeller-')) {
      const sellerId = page.split('MessageSeller-')[1];
      return requireLogin(<SellerInbox {...publicProps} initialCustomerId={null} sellerId={sellerId} />);
    }
    if (page.startsWith('Search-'))
      return <Search {...publicProps} initialQuery={page.split('Search-')[1]} aiIntent={navParams?.aiIntent} />;
    if (page.startsWith('Category-'))
      return <CategoryPage {...publicProps} category={page.split('Category-')[1]} />;
    if (page === 'Listings')
      return <ListingsPage {...publicProps} />;
    switch (page) {
      case 'Home':              return <HomeFeed {...publicProps} />;

      case 'AboutUs':              return <AboutUs {...publicProps} />;
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
      case 'OrderTracking':        return requireLogin(<OrderTracking {...publicProps} />);

      case 'Discover':          return <Search {...publicProps} />;
      case 'Activity':          return requireLogin(<Activity {...publicProps} />);
      case 'RoleActivation':    return requireLogin(<RoleActivation {...publicProps} />);
      case 'Onboarding':        return requireLogin(<Onboarding {...publicProps} />);
      case 'AddProfilePhoto':   return requireLogin(<AddProfilePhoto {...publicProps} />);
      case 'RouteCoverageMap':   return <RouteCoverageMap {...publicProps} />;
      case 'MyProfile':         return requireLogin(<MyProfile {...publicProps} />);
      case 'CommerceProfile':     return requireLogin(<CommerceProfile {...publicProps} pageParam={null} />);
      case 'Store':
      case 'Stores':            return <Stores {...publicProps} />;
      case 'ClassifiedsPublic': return <ClassifiedsPublic {...publicProps} />;
      case 'PublicLogin':       return loginPage;
      case 'Register':          return <Register onNavigate={handleNavigate} onLoginSuccess={handleLoginSuccess} />;
      case 'Search':            return <Search {...publicProps} aiIntent={navParams?.aiIntent} />;
      case 'Cart':              return <Cart {...publicProps} />;
      case 'BecomeSeller':      return <BecomeSeller {...publicProps} />;
      case 'BecomeSellerInfo':  return <BecomeSellerInfo {...publicProps} />;
      case 'SellerCustomers':   return requireLogin(<SellerCustomers {...publicProps} />);
      case 'AgentEarnings':     return requireLogin(<AgentEarnings {...publicProps} />);
      case 'SellerPayouts':     return requireLogin(<SellerPayouts {...publicProps} />);
      case 'BecomeAgent':       return <BecomeAgent {...publicProps} />;
      case 'BecomeSuperAgentInfo': return <BecomeSuperAgentInfo {...publicProps} />;
      case 'VerifyReceipt':     return <VerifyReceipt {...publicProps} />;
      case 'PayInvoice':        return <PayInvoice {...publicProps} />;

      case 'MyOrders':          return requireLogin(<MyOrders {...publicProps} />);
      case 'CustomerProfile':   return requireLogin(<CustomerProfile {...publicProps} />);
      case 'Checkout':          return requireLogin(<Checkout {...publicProps} />);
      case 'StoreSettings':     return requireLogin(<StoreSettings {...publicProps} userId={decodeToken(localStorage.getItem('token'))?.sub} />);
      case 'SellerDashboard':   return requireLogin(<SellerDashboard {...publicProps} />);
      case 'SellerProducts':    return requireLogin(<SellerProducts {...publicProps} />);
      case 'SellerClassifieds': return requireLogin(<SellerClassifieds {...publicProps} />);
      case 'SellerOrders':      return requireLogin(<SellerOrders {...publicProps} />);
      case 'SellerShipping':    return requireLogin(<SellerShipping {...publicProps} />);
      case 'SellerInvoices':    return requireLogin(<SellerInvoices {...publicProps} preSelected={navParams?.preSelected} />);
      case 'AgentDashboard':    return requireLogin(<AgentDashboard {...publicProps} />);
      case 'AgentOrderDashboard': return requireLogin(<AgentDashboard {...publicProps} />); // merged into unified dashboard
      case 'SuperAgentDashboard':   return requireLogin(<SuperAgentDashboard {...publicProps} />);
      case 'DispatcherManifest':    return requireLogin(<DispatcherManifest {...publicProps} />);
      case 'HubReceive':           return requireLogin(<HubReceive {...publicProps} />);
      case 'BatchHandoff':          return requireLogin(<BatchHandoff {...publicProps} />);
      case 'OfflineIntercityOrder':  return requireLogin(<OfflineIntercityOrder {...publicProps} />);
      case 'SuperAgentParcel':       return requireLogin(<SuperAgentParcel {...publicProps} />);
      case 'SuperAgentSettings':     return requireLogin(<SuperAgentSettings {...publicProps} />);
      case 'SellerShipment':         return requireLogin(<SellerShipment {...publicProps} prefill={navParams} />);
      case 'VanToday':             return requireLogin(<VanToday {...publicProps} />);
      case 'Dashboard':   return requireAdmin(<Dashboard activePage={page} {...adminProps} />);
      case 'Products':    return requireAdmin(<Products activePage={page} {...adminProps} />);
      case 'Classifieds': return requireAdmin(<Classifieds activePage={page} {...adminProps} />);
      case 'Users':       return requireAdmin(<Users activePage={page} {...adminProps} />);
      case 'Orders':      return requireAdmin(<Orders activePage={page} {...adminProps} />);
      case 'Payments':    return requireAdmin(<Payments activePage={page} {...adminProps} />);
      case 'Sellers':     return requireAdmin(<Sellers activePage={page} {...adminProps} />);
      case 'Agents':      return requireAdmin(<Agents activePage={page} {...adminProps} />);
      case 'Profile':     return requireLogin(<Profile activePage={page} {...adminProps} />);
      case 'TrackParcel': return <TrackParcel {...publicProps} />;
      case 'SuperAgents': return requireAdmin(<SuperAgents activePage={page} {...adminProps} />);
      case 'Disputes':    return requireAdmin(<Disputes    activePage={page} {...adminProps} />);
      case 'Payouts':     return requireAdmin(<Payouts     activePage={page} {...adminProps} />);
      case 'Invoices':    return requireAdmin(<Invoices    activePage={page} {...adminProps} />);
      case 'Reports':        return requireAdmin(<Reports     activePage={page} {...adminProps} />);
      case 'ContactMessages': return requireAdmin(<ContactMessages activePage={page} {...adminProps} />);
      case 'Announcements':    return requireAdmin(<Announcements activePage={page} {...adminProps} />);
      case 'Analytics':        return requireAdmin(<Analytics activePage={page} {...adminProps} />);
      case 'ZoneManagement':    return requireAdmin(<ZoneManagement onNavigate={handleNavigate} onLogout={handleLogout} />);
      case 'BodaRates':         return requireAdmin(<BodaRates onNavigate={handleNavigate} onLogout={handleLogout} />);
      case 'RouteManagement':   return requireAdmin(<RouteManagement onNavigate={handleNavigate} onLogout={handleLogout} />);
      case 'CollectionFees':    return requireAdmin(<CollectionFees onNavigate={handleNavigate} onLogout={handleLogout} />);
      case 'AgentPerformance':  return requireAdmin(<AgentPerformance onNavigate={handleNavigate} onLogout={handleLogout} />);
      case 'FinancialDashboard': return requireAdmin(<FinancialDashboard onNavigate={handleNavigate} onLogout={handleLogout} />);

      case 'BecomeTransportProvider':    return requireLogin(<BecomeTransportProvider {...publicProps} />);
      case 'TransportProviderDashboard': return requireLogin(<TransportProviderDashboard {...publicProps} />);
      case 'TransportAdmin':             return requireAdmin(<TransportAdmin onNavigate={handleNavigate} activePage={page} />);
      case 'HubAdmin':                   return requireAdmin(<HubAdmin onNavigate={handleNavigate} activePage={page} />);
      case 'SellerAnalytics':            return requireLogin(<SellerAnalytics {...publicProps} />);
      case 'SellerTeam':                 return requireLogin(<SellerTeam {...publicProps} />);
      case 'AgentScorecard':             return requireLogin(<AgentScorecard {...publicProps} />);
      case 'Wishlist':                   return requireLogin(<Wishlist {...publicProps} />);
      case 'SellerInbox':                return requireLogin(<SellerInbox {...publicProps} />);

      case 'Services':                     return <Services {...publicProps} />;
      case 'PostService':                  return requireLogin(<PostService {...publicProps} />);
      case 'MyServices':                   return requireLogin(<MyServices {...publicProps} />);
      default: return <HomeFeed {...publicProps} />;
    }
  };

  const handleLangPick = (lang) => {
    localStorage.setItem('kentexa_lang', lang);
    // Change i18n language
    if (window.i18nInstance) window.i18nInstance.changeLanguage(lang);
    setShowLangPicker(false);
  };

  return (
    <CartProvider>
      {renderPage()}

      {/* ── Social Commerce Navigation ─────────────────────── */}
      {/* Hidden during Onboarding — a focused setup wizard shouldn't show
          tab navigation, and this also fixes the Continue button being
          hidden behind the nav bar on each step. */}
      {isLoggedIn && page !== 'Onboarding' && page !== 'AddProfilePhoto' && (
        <BottomNav
          currentPage={page}
          onNavigate={handleNavigate}
          isLoggedIn={isLoggedIn}
          userRole={userRole}
          currentUser={currentUser}
          onPostClick={() => setShowPostModal(true)}
          activeProfile={activeProfile}
          onOpenSwitcher={() => setShowProfileSwitcher(true)}
        />
      )}
      {showProfileSwitcher && (
        <ProfileSwitcherSheet
          profiles={myProfiles}
          activeProfileId={activeProfile?.id}
          onSwitch={handleSwitchProfile}
          onClose={() => setShowProfileSwitcher(false)}
          onNavigate={handleNavigate}
        />
      )}
      {showPostModal && (
        <PostModal
          onNavigate={handleNavigate}
          onClose={() => setShowPostModal(false)}
          currentUser={currentUser}
          userRole={userRole}
          onOpenMoment={(mode) => {
            setShowPostModal(false);
            setMomentModalMode(mode);
            setShowMomentModal(true);
          }}
        />
      )}
      {showMomentModal && (
        <CreateMomentModal
          currentUser={currentUser}
          initialMode={momentModalMode}
          onClose={() => setShowMomentModal(false)}
          onPosted={() => {
            setMomentRefreshKey(k => k + 1);
            if (page !== 'Home') handleNavigate('Home');
          }}
        />
      )}

      {/* First-visit language picker */}
      {showLangPicker && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: '32px 24px', width: '100%', maxWidth: 340, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🇹🇿</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 6px', fontFamily: 'Manrope,sans-serif' }}>Karibu KenteXa!</h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 24px' }}>Chagua lugha yako / Choose your language</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => handleLangPick('sw')}
                style={{ padding: '14px', borderRadius: 12, border: '2px solid #1d4ed8', backgroundColor: '#eff6ff', cursor: 'pointer', fontSize: 15, fontWeight: 800, color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                🇹🇿 Kiswahili <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>(Inayopendekezwa)</span>
              </button>
              <button onClick={() => handleLangPick('en')}
                style={{ padding: '14px', borderRadius: 12, border: '2px solid #e2e8f0', backgroundColor: '#f8fafc', cursor: 'pointer', fontSize: 15, fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                🇬🇧 English
              </button>
              <button onClick={() => handleLangPick('fr')}
                style={{ padding: '14px', borderRadius: 12, border: '2px solid #e2e8f0', backgroundColor: '#f8fafc', cursor: 'pointer', fontSize: 15, fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                🇫🇷 Français
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 16 }}>Unaweza kubadilisha lugha wakati wowote / You can change this anytime</p>
          </div>
        </div>
      )}
      {showInstallPrompt && <InstallBanner onInstall={handleInstall} onDismiss={handleDismiss} />}
    </CartProvider>
  );
}

export default App;