# Space Station Cargo Management System

A comprehensive implementation of the Space Station Cargo Management System API built with FastAPI and Python. This system provides a robust solution for managing cargo placement, retrieval, waste management, and time simulation in a space station environment.

**Demo Video**: [https://youtu.be/4F44rka61LE](https://youtu.be/4F44rka61LE)

## Features

1. ✅ Placement API - Intelligent cargo placement optimization
2. ✅ Search API - Advanced search capabilities for items and containers
3. ✅ Retrieve API - Safe item retrieval with astronaut tracking
4. ✅ Place API - Manual item placement with position control
5. ✅ Waste Management APIs - Comprehensive waste handling system
6. ✅ Time Simulation API - Future state prediction and planning
7. ✅ Import/Export APIs - Data management and system state persistence
8. ✅ Logging API - Detailed activity tracking and audit system
9. ✅ Rearrangement API - Optimize storage space by relocating low-priority items

## Getting Started

1. Clone this repository
```
git clone https://github.com/kry0sc0pic/cargox.git
```
2. Start Docker Containers
```
docker compose up -d --build
```
3. Open the Frontend at [http://localhost:5173](http://localhost:5173)
4. Upload `samples/containers.csv` on the upload page.
5. Upload `samples/input_items.csv` on the upload page.

## API Documentation

### Core APIs

#### Placement API
**Endpoint:** `POST /api/placement`

**Request:**
```json
{
  "items": [
    {
      "itemId": "item-1",
      "name": "Example Item",
      "width": 10,
      "depth": 10,
      "height": 10,
      "mass": 1,
      "priority": 1,
      "preferredZone": "A"
    }
  ],
  "containers": [
    {
      "containerId": "container-1",
      "zone": "A",
      "width": 100,
      "depth": 100,
      "height": 100
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "placements": [
    {
      "itemId": "item-1",
      "containerId": "container-1",
      "position": {
        "startCoordinates": {"width": 0, "depth": 0, "height": 0},
        "endCoordinates": {"width": 10, "depth": 10, "height": 10}
      }
    }
  ]
}
```

#### Search API
**Endpoint:** `GET /api/search`

**Query Parameters:**
- `itemId`: Search by item ID
- `itemName`: Search by item name
- `userId`: Search by user/astronaut ID

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "itemId": "item-1",
      "name": "Example Item",
      "containerId": "container-1",
      "zone": "A",
      "position": {
        "startCoordinates": {"width": 0, "depth": 0, "height": 0},
        "endCoordinates": {"width": 10, "depth": 10, "height": 10}
      }
    }
  ]
}
```

#### Retrieve API
**Endpoint:** `POST /api/retrieve`

**Request:**
```json
{
  "itemId": "item-1",
  "astronaut": "astronaut-1"
}
```

**Response:**
```json
{
  "success": true,
  "item": {
    "itemId": "item-1",
    "name": "Example Item",
    "containerId": "container-1",
    "retrievalPath": [
      {"x": 0, "y": 0, "z": 0},
      {"x": 0, "y": 0, "z": 10}
    ]
  },
  "message": "Item successfully retrieved"
}
```

#### Place API
**Endpoint:** `POST /api/place`

**Request:**
```json
{
  "itemId": "item-1",
  "containerId": "container-1",
  "position": {
    "x": 0,
    "y": 0,
    "z": 0
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Item successfully placed",
  "placement": {
    "itemId": "item-1",
    "containerId": "container-1",
    "position": {
      "startCoordinates": {"width": 0, "depth": 0, "height": 0},
      "endCoordinates": {"width": 10, "depth": 10, "height": 10}
    }
  }
}
```

### Rearrangement API

#### Get Rearrangement Recommendations
**Endpoint:** `GET /api/rearrangement`

**Description:** Generates recommendations for rearranging low-priority items to optimize storage space utilization. The API automatically identifies which items can be moved and creates a step-by-step movement plan that minimizes the time required. It also identifies containers with inefficient space usage.

**Query Parameters:**
- `priority_threshold`: Only move items with priority below this threshold (default: 30, range: 0-100)
- `max_movements`: Maximum number of movements to recommend (default: 10, range: 1-50)
- `space_target`: Target percentage improvement in space utilization (default: 15.0, range: 5.0-50.0)

**Response:**
```json
{
  "success": true,
  "message": "Generated rearrangement plan with 5 movements",
  "total_steps": 5,
  "total_estimated_time": 42.5,
  "space_optimization": 12.3,
  "movements": [
    {
      "step": 1,
      "item_id": "item-56",
      "item_name": "Spare Filters",
      "from_container_id": "container-14",
      "to_container_id": "container-3",
      "estimated_time": 8.5,
      "priority": 15,
      "description": "Move Spare Filters from container-14 (Lab) to container-3 (Storage)"
    },
    {
      "step": 2,
      "item_id": "item-23",
      "item_name": "Maintenance Kit",
      "from_container_id": "container-8",
      "to_container_id": "container-2",
      "estimated_time": 7.2,
      "priority": 22,
      "description": "Move Maintenance Kit from container-8 (Crew) to container-2 (Storage)"
    }
  ],
  "disorganized_containers": [
    {
      "container_id": "container-14",
      "zone": "Lab",
      "inefficiency_score": 68.7,
      "volume_utilization": 42.3,
      "item_count": 8,
      "high_priority_items": 2,
      "low_priority_items": 6,
      "recommended_actions": "Consolidate low priority items"
    },
    {
      "container_id": "container-8",
      "zone": "Crew",
      "inefficiency_score": 54.2,
      "volume_utilization": 38.9,
      "item_count": 5,
      "high_priority_items": 1,
      "low_priority_items": 4,
      "recommended_actions": "Move low priority items to storage"
    }
  ],
  "low_priority_items_moved": ["item-56", "item-23", "item-78", "item-12", "item-45"],
  "high_priority_items_untouched": ["item-1", "item-5", "item-9"]
}
```

#### Apply Rearrangement Plan
**Endpoint:** `POST /api/rearrangement/apply`

**Description:** Allows an astronaut to apply a previously generated rearrangement plan, recording the implementation details.

**Request:**
```json
{
  "movement_ids": ["item-56", "item-23"],
  "astronaut_id": "astronaut-2"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully applied 2 movements",
  "total_steps": 2,
  "total_estimated_time": 15.7,
  "space_optimization": 5.2,
  "movements": []
}
```

### Waste Management APIs

#### Identify Waste
**Endpoint:** `GET /api/waste/identify`

**Description:** Identifies items that have been marked for disposal or have exceeded their useful life. This includes both placed and unplaced items that have expired or reached their usage limit.

**Query Parameters:**
- `expirationBefore`: Filter items expiring before given date (YYYY-MM-DD)
- `usageThreshold`: Minimum usage percentage to consider an item as waste (default: 95)

**Response:**
```json
{
  "success": true,
  "wasteItems": [
    {
      "itemId": "item-23",
      "name": "Expired Food Pack",
      "expirationDate": "2023-01-15",
      "usagePercentage": 100,
      "mass": 0.5,
      "containerId": "container-5",
      "status": "Placed in container-5"
    },
    {
      "itemId": "item-45",
      "name": "Used Air Filter",
      "expirationDate": null,
      "usagePercentage": 98,
      "mass": 2.3,
      "containerId": "container-2",
      "status": "Placed in container-2"
    },
    {
      "itemId": "item-67",
      "name": "Expired Medical Supply",
      "expirationDate": "2023-02-10",
      "usagePercentage": 0,
      "mass": 1.2,
      "containerId": null,
      "status": "Unplaced"
    }
  ],
  "totalWasteMass": 4.0,
  "wasteContainerCapacity": {
    "available": 50.0,
    "required": 4.0,
    "sufficient": true
  }
}
```

#### Generate Return Plan
**Endpoint:** `POST /api/waste/return-plan`

**Description:** Creates an optimized plan for packing waste items into return containers for disposal. The system prioritizes items based on various factors including toxicity, mass, and expiration.

**Request:**
```json
{
  "wasteItemIds": ["item-23", "item-45", "item-67"],
  "returnContainerIds": ["return-container-1", "return-container-2"],
  "priority": "MASS_OPTIMIZED"  // Options: MASS_OPTIMIZED, TOXICITY_FIRST, EXPIRATION_PRIORITY
}
```

**Response:**
```json
{
  "success": true,
  "returnPlan": {
    "containers": [
      {
        "containerId": "return-container-1",
        "items": [
          {
            "itemId": "item-23",
            "position": {
              "startCoordinates": {"width": 0, "depth": 0, "height": 0},
              "endCoordinates": {"width": 5, "depth": 5, "height": 2}
            }
          },
          {
            "itemId": "item-45",
            "position": {
              "startCoordinates": {"width": 6, "depth": 0, "height": 0},
              "endCoordinates": {"width": 16, "depth": 10, "height": 5}
            }
          }
        ],
        "spaceUtilization": 78.5,
        "totalMass": 2.8
      },
      {
        "containerId": "return-container-2",
        "items": [
          {
            "itemId": "item-67",
            "position": {
              "startCoordinates": {"width": 0, "depth": 0, "height": 0},
              "endCoordinates": {"width": 12, "depth": 8, "height": 4}
            }
          }
        ],
        "spaceUtilization": 45.2,
        "totalMass": 3.1
      }
    ],
    "unassignedItems": [],
    "totalWasteMass": 5.9,
    "estimatedReturnDate": "2024-05-15T00:00:00Z"
  }
}
```

#### Complete Undocking
**Endpoint:** `POST /api/waste/complete-undocking`

**Description:** Finalizes the waste disposal process by marking waste items as removed from the space station, updating inventory and logging the undocking event.

**Request:**
```json
{
  "returnMissionId": "RM-2024-05",
  "returnContainerIds": ["return-container-1", "return-container-2"],
  "undockingTime": "2024-05-01T14:30:00Z",
  "operatorId": "astronaut-3"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Undocking successfully completed",
  "details": {
    "missionId": "RM-2024-05",
    "totalItemsRemoved": 3,
    "totalMassRemoved": 5.9,
    "undockingTime": "2024-05-01T14:30:00Z",
    "recoveredSpace": {
      "containerIds": ["container-2", "container-5"],
      "totalVolume": 245.0
    },
    "logEntryId": "log-8734"
  }
}
```

### Time Simulation API
**Endpoint:** `POST /api/simulate/day`

**Description:** Simulates the passage of time in the space station by calculating item usage, expiration, and generating predictions for future cargo needs. The simulation will mark both placed and unplaced items as waste if they expire during the simulation period.

**Request:**
```json
{
  "days": 7,  // Number of days to simulate (default: 1)
  "usage_plan": {
    "item-1": 5,  // Usage per day in percentage
    "item-2": 3,
    "item-31": 10
  },
  "astronaut_activity": {
    "astronaut-1": ["exercise", "science", "maintenance"],
    "astronaut-2": ["sleep", "communication", "food-prep"]
  },
  "simulate_failures": false  // Whether to simulate random equipment failures
}
```

**Response:**
```json
{
  "success": true,
  "simulationResults": {
    "date": "2024-05-08T00:00:00Z",
    "itemUsage": [
      {
        "itemId": "item-1",
        "initialPercentage": 50,
        "finalPercentage": 85,
        "daysUntilDepletion": 3
      },
      {
        "itemId": "item-2",
        "initialPercentage": 20,
        "finalPercentage": 41,
        "daysUntilDepletion": 19
      },
      {
        "itemId": "item-31",
        "initialPercentage": 5,
        "finalPercentage": 75,
        "daysUntilDepletion": 2
      }
    ],
    "expiredItems": [
      {
        "itemId": "item-45",
        "name": "Medical Supplies",
        "expiryDate": "2024-05-07",
        "placementStatus": "Placed",
        "containerId": "container-3"
      },
      {
        "itemId": "item-67",
        "name": "Food Package",
        "expiryDate": "2024-05-08",
        "placementStatus": "Unplaced",
        "containerId": null
      }
    ],
    "spaceUtilization": {
      "initialPercentage": 76.2,
      "finalPercentage": 73.5,
      "freedContainers": ["container-9"]
    },
    "wasteGenerated": {
      "totalItems": 2,
      "totalMass": 1.7,
      "itemIds": ["item-12", "item-47"]
    },
    "criticalAlerts": [
      {
        "type": "DEPLETION",
        "itemId": "item-31",
        "message": "Critical item will be depleted in 2 days",
        "priority": "HIGH"
      }
    ],
    "recommendations": [
      {
        "type": "RESUPPLY",
        "items": ["item-31", "item-1"],
        "urgency": "HIGH",
        "recommendedQuantities": {"item-31": 3, "item-1": 2}
      },
      {
        "type": "WASTE_DISPOSAL",
        "recommendedDate": "2024-05-10T00:00:00Z",
        "wasteItems": ["item-12", "item-47", "item-45", "item-67"]
      }
    ]
  }
}
```

### Import/Export APIs

#### Import Items
**Endpoint:** `POST /api/import/items`

**Description:** Imports item data from a CSV file into the system.

#### Import Containers
**Endpoint:** `POST /api/import/containers`

**Description:** Imports container data from a CSV file into the system.

#### Export Arrangement
**Endpoint:** `GET /api/export/arrangement`

**Description:** Exports the current arrangement of items in containers as a CSV file.

### Logging API
**Endpoint:** `GET /api/logs`

**Query Parameters:**
- `startDate`: Filter logs from date
- `endDate`: Filter logs until date
- `itemId`: Filter by item ID
- `userId`: Filter by user ID
- `actionType`: Filter by action type

**Response:**
```json
{
  "success": true,
  "logs": [
    {
      "id": "log-8734",
      "timestamp": "2024-05-01T14:30:00Z",
      "actionType": "UNDOCKING",
      "userId": "astronaut-3",
      "itemId": null,
      "details": "Completed undocking of waste return mission RM-2024-05"
    },
    {
      "id": "log-8733",
      "timestamp": "2024-05-01T10:15:22Z",
      "actionType": "ITEM_RETRIEVAL",
      "userId": "astronaut-2",
      "itemId": "item-56",
      "details": "Retrieved water filter from container-3"
    }
  ],
  "totalCount": 2,
  "page": 1,
  "pageSize": 10
}
```

## Admin
Adminer is accessible at [http://localhost:8001](http://localhost:8001)

*Credentials*
- System: `PostgreSQL`
- Server: `postgres`
- Username: `postgres`
- Password: `postgres`
- Database: `cargox`
- Permanent Login: `Yes` 
