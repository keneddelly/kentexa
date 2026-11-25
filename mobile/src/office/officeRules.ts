// GENERATED from shared/office-rules.json by scripts/office-rules/sync-mobile.js. Do not edit by hand.
/* eslint-disable */
export const OFFICE_RULES = {
  "version": 1,
  "statusLabels": {
    "pending": "Inasubiri",
    "received_at_hub": "Iko ofisini",
    "verified": "Imethibitishwa",
    "ready_for_dispatch": "Tayari Kutuma",
    "dispatched": "Imetumwa",
    "in_transit": "Njiani",
    "arrived_at_hub": "Imefika ofisini",
    "awaiting_buyer": "Mteja Achague",
    "out_for_delivery": "Inafikishwa",
    "delivered": "Imefikishwa",
    "collection_requested": "Ombi la Kuchukua",
    "collected_by_agent": "Imechukuliwa"
  },
  "groups": {
    "pokea": {
      "incoming": {
        "statuses": [
          "dispatched",
          "in_transit",
          "arrived_at_hub"
        ],
        "myRole": "destination"
      }
    },
    "tuma": {
      "toDispatch": {
        "statuses": [
          "received_at_hub",
          "ready_for_dispatch"
        ],
        "myRole": "not_destination"
      },
      "inTransit": {
        "statuses": [
          "dispatched",
          "in_transit"
        ],
        "myRole": "not_destination"
      },
      "awaitingBuyer": {
        "statuses": [
          "awaiting_buyer",
          "out_for_delivery"
        ],
        "myRole": "not_origin"
      }
    },
    "delivered": {
      "delivered": {
        "statuses": [
          "delivered"
        ]
      }
    }
  },
  "counts": {
    "pokea": [
      "incoming",
      "handoverRequests"
    ],
    "tuma": [
      "toDispatch",
      "awaitingBuyer"
    ]
  },
  "expectedActions": {
    "receive_from_sender": {
      "label": "Mtumaji yuko hapa: pokea mzigo",
      "endpoint": "PATCH /super-agents/parcels/:trackingNumber/status",
      "body": {
        "status": "received_at_hub"
      }
    },
    "receive_order": {
      "label": "Muuzaji yuko hapa: pokea oda",
      "endpoint": "PATCH /orders/:orderId/super-agent-receive",
      "body": {}
    },
    "confirm_agent_handover": {
      "label": "Pokea kutoka kwa wakala",
      "endpoint": "POST /pickup-tasks/:pickupTaskId/hub-receive",
      "body": {}
    },
    "agent_on_the_way": {
      "label": null,
      "endpoint": null,
      "body": null
    }
  },
  "arrival": {
    "endpoint": "PATCH /super-agents/shipments/:trackingNumber/arrived",
    "body": {
      "city": "<office city>"
    }
  },
  "regionMatch": {
    "$comment": "Same place or not. Copied from bishoo-frontend/src/utils/regionMatch.js (backend: src/super-agents/region-match.ts).",
    "separatorsPattern": "[-_.,]",
    "stripPattern": "\\bmkoa wa\\b|\\bregion\\b|\\bmkoa\\b"
  },
  "walkIn": {
    "$comment": "Walk-in counter rules copied from SuperAgentDashboard.js (handleWalkSubmit) and OfficePricePreview.js.",
    "reasonMinLength": 3,
    "defaultServicePath": "local_agent",
    "servicePaths": [
      "local_agent",
      "van",
      "intercity"
    ],
    "pricePreviewEndpoint": "POST /super-agents/me/price-quote",
    "submitEndpoint": "POST /super-agents/offline-intercity",
    "hubsEndpoint": "GET /super-agents/hubs/:city",
    "routeEndpoint": "GET /super-agents/route/:from/:to",
    "estimateEndpoint": "GET /pricing/estimate?from&to&weight&destDistrict",
    "placeSearchEndpoint": "GET /location-intelligence/places?q&limit=8"
  },
  "statusModal": {
    "$comment": "Status change rules copied from SuperAgentDashboard.js (status modal, handleConfirmPickup, handleSendPickupCode, handleIssueAgentHandoff). preDispatchStatuses decides which intake options show. Server enforces the same stages.",
    "preDispatchStatuses": [
      "pending",
      "collection_requested",
      "collected_by_agent",
      "received_at_hub",
      "verified",
      "ready_for_dispatch"
    ],
    "originOptions": [
      {
        "value": "received_at_hub",
        "label": "Imepokewa ofisini",
        "onlyPreDispatch": true
      },
      {
        "value": "verified",
        "label": "Imethibitishwa",
        "onlyPreDispatch": true
      },
      {
        "value": "ready_for_dispatch",
        "label": "Tayari Kutuma",
        "onlyPreDispatch": true
      },
      {
        "value": "in_transit",
        "label": "Njiani",
        "onlyPreDispatch": false
      }
    ],
    "destinationOptions": [
      {
        "value": "arrived_at_hub",
        "label": "Imefika ofisini"
      },
      {
        "value": "awaiting_buyer",
        "label": "Inasubiri Mteja"
      }
    ],
    "pickupOfferStatuses": [
      "arrived_at_hub",
      "awaiting_buyer"
    ],
    "pickupCodeLength": 6,
    "agentHandoffMinutes": 10,
    "endpoints": {
      "status": "PATCH /super-agents/parcels/:trackingNumber/status",
      "sendPickupCode": "POST /super-agents/parcels/:trackingNumber/pickup-code",
      "confirmPickup": "POST /super-agents/parcels/:trackingNumber/confirm-pickup",
      "agentHandoffCode": "POST /super-agents/parcels/:trackingNumber/agent-handoff-code"
    }
  },
  "localDispatch": {
    "$comment": "Parcel for the same town goes to a local agent (web: isDirectLocalParcel + 'Chagua Agent').",
    "agentsEndpoint": "GET /agents/nearby?region=:city",
    "dispatchEndpoint": "PATCH /super-agents/parcels/:trackingNumber/dispatch",
    "defaultTransportType": "bus"
  },
  "handover": {
    "$comment": "Agent handovers awaiting receipt at this hub (web: 'Agent handovers awaiting receipt').",
    "listEndpoint": "GET /collections/hub/handover-requests",
    "acceptEndpoint": "PATCH /collections/:id/hub-accept"
  },
  "pricing": {
    "$comment": "Office prices copied from bishoo-frontend/src/public/components/OfficePrices.js, ChargeRuleSection.js, RouteRangePanel.js and OfficePickupCard.js.",
    "chargeModes": [
      "value",
      "kg"
    ],
    "valueDefaults": {
      "chargeMode": "value",
      "valuePercent": 10,
      "valueMinimum": 5000
    },
    "routeDefaults": {
      "estimatedDays": 3
    },
    "goodsTypes": [
      [
        "parcel",
        "Vifurushi vidogo"
      ],
      [
        "large",
        "Mzigo mkubwa"
      ],
      [
        "container",
        "Kontena"
      ]
    ],
    "pickupModes": [
      [
        "none",
        "Sichukui mzigo kwa mteja"
      ],
      [
        "free",
        "Nachukua bure"
      ],
      [
        "fixed",
        "Nachukua kwa bei"
      ]
    ],
    "endpoints": {
      "priceRuleGet": "GET /super-agents/me/price-rule",
      "priceRulePut": "PUT /super-agents/me/price-rule",
      "ratesGet": "GET /super-agents/rates/:city",
      "ratesPost": "POST /super-agents/rates",
      "regions": "GET /locations/regions",
      "goodsGet": "GET /quote-requests/goods-types",
      "goodsPut": "PUT /quote-requests/goods-types",
      "pickupGet": "GET /super-agents/me/pickup",
      "pickupPut": "PUT /super-agents/me/pickup",
      "routeRange": "GET /super-agents/me/route-range?destinationCity&weightKg",
      "officePointPatch": "PATCH /super-agents/my-profile/office-point"
    }
  },
  "webOnly": [
    "officePointGps",
    "vanDesk",
    "bulkShipments",
    "referrals",
    "revenue"
  ]
} as const;
