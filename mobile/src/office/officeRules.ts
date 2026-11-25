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
  "webOnly": [
    "walkIn",
    "dispatchForm",
    "handoverRequests",
    "awaitingBuyerActions"
  ]
} as const;
