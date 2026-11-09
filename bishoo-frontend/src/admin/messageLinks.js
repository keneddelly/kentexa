// Pages a KenteXa message can open (owner 2026-11-09: "admin can write a message to user about a
// new feature with its link"). `param` asks for a number (e.g. which product). The server only
// accepts a page name and a short id, never a script.
export const MESSAGE_LINKS = [
  { key: 'none', label: 'Bila kiungo' },
  { key: 'Home', page: 'Home', label: 'Mwanzo' },
  { key: 'Discover', page: 'Discover', label: 'Gundua' },
  { key: 'Workspace', page: 'Workspace', label: 'Kazi' },
  { key: 'POS', page: 'POS', label: 'POS ya duka' },
  { key: 'SellerOrders', page: 'SellerOrders', label: 'Oda za duka' },
  { key: 'SendShipment', page: 'SendShipment', label: 'Tuma mzigo' },
  { key: 'MyShipments', page: 'MyShipments', label: 'Mizigo yangu' },
  { key: 'MyOrders', page: 'MyOrders', label: 'Oda zangu' },
  { key: 'CreateClassified', page: 'CreateClassified', label: 'Weka tangazo' },
  { key: 'CreateCommunity', page: 'CreateCommunity', label: 'Fungua jumuiya' },
  { key: 'BecomeBusiness', page: 'BecomeBusiness', label: 'Fungua biashara' },
  { key: 'BecomeSuperAgentInfo', page: 'BecomeSuperAgentInfo', label: 'Fungua ofisi' },
  { key: 'BecomeAgent', page: 'BecomeAgent', label: 'Kuwa agent' },
  { key: 'BecomeTransportProvider', page: 'BecomeTransportProvider', label: 'Sajili usafiri' },
  { key: 'KentexaFee', page: 'KentexaFee', label: 'Ada ya KenteXa' },
  { key: 'EditPublicProfile', page: 'EditPublicProfile', label: 'Hariri wasifu' },
  { key: 'AddProfilePhoto', page: 'AddProfilePhoto', label: 'Weka picha ya wasifu' },
  { key: 'ProductDetail', page: 'ProductDetail', param: 'Namba ya bidhaa', label: 'Bidhaa moja' },
  { key: 'PostDetail', page: 'PostDetail', param: 'Namba ya chapisho', label: 'Chapisho moja' },
  { key: 'Community', page: 'Community', param: 'Namba ya jumuiya', label: 'Jumuiya moja' },
  { key: 'external', label: 'Kiungo cha nje (https)' },
];

export const linkLabel = (page, param) => {
  const l = MESSAGE_LINKS.find((x) => x.page === page);
  if (!l) return page || '';
  return param ? `${l.label} #${param}` : l.label;
};
