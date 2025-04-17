/**
 * CargoX API Client for frontend at http://localhost:5173
 * This file should be added to your frontend project
 */

// Configuration - make sure this points to your Docker backend
const API_BASE_URL = 'http://localhost:8000';

/**
 * Import containers from a CSV file
 * @param {File} file - The CSV file to upload
 * @returns {Promise<Object>} - API response
 */
export async function importContainers(file) {
  console.log('Importing containers to:', API_BASE_URL);
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE_URL}/api/import/containers`, {
      method: 'POST',
      body: formData
    });
    
    return await response.json();
  } catch (error) {
    console.error('Error importing containers:', error);
    throw error;
  }
}

/**
 * Import items from a CSV file
 * @param {File} file - The CSV file to upload
 * @returns {Promise<Object>} - API response
 */
export async function importItems(file) {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE_URL}/api/import/items`, {
      method: 'POST',
      body: formData
    });
    
    return await response.json();
  } catch (error) {
    console.error('Error importing items:', error);
    throw error;
  }
}

/**
 * Run the placement algorithm to place items in containers
 * @returns {Promise<Object>} - Placement results
 */
export async function placeItems() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/placement`, {
      method: 'POST'
    });
    
    return await response.json();
  } catch (error) {
    console.error('Error placing items:', error);
    throw error;
  }
}

/**
 * Get retrieval path for a specific item
 * @param {string} itemId - The ID of the item to retrieve
 * @returns {Promise<Object>} - Retrieval path information
 */
export async function retrieveItem(itemId) {
  try {
    // First search for the item to get its details
    const searchResponse = await fetch(`${API_BASE_URL}/api/search?itemId=${itemId}`);
    const searchData = await searchResponse.json();
    console.log('Item search response:', searchData);
    
    if (searchData && searchData.items && searchData.items.length > 0) {
      const item = searchData.items[0];
      
      // If item is placed in a container, get retrieval path with obstructions
      if (item.is_placed && item.container_id) {
        // Get detailed retrieval information including obstructed items
        const retrievalResponse = await fetch(`${API_BASE_URL}/retrieve/${item.id}`);
        const retrievalData = await retrievalResponse.json();
        console.log('Retrieval path data:', retrievalData);
        
        // Count steps needed (number of disturbed items)
        const steps = retrievalData.disturbed_items.length;
        
        return {
          found: true,
          item_id: item.id,
          path: retrievalData.path || [],
          disturbed_items: retrievalData.disturbed_items || [],
          steps: steps,
          location: {
            container: item.container_id,
            position: item.position || {
              x: item.position_x || 0,
              y: item.position_y || 0,
              z: item.position_z || 0
            }
          },
          retrieval_time: retrievalData.retrieval_time || new Date().toISOString(),
          retrieved_by: retrievalData.retrieved_by || "system",
          item: item
        };
      } else {
        // Item is not placed in a container, so return basic info
        return {
          found: true,
          item_id: item.id,
          path: [],
          disturbed_items: [],
          steps: 0,
          location: null,
          retrieval_time: new Date().toISOString(),
          retrieved_by: "system",
          item: item
        };
      }
    } else {
      return {
        found: false,
        item_id: itemId,
        path: [],
        disturbed_items: [],
        steps: 0,
        location: null,
        retrieval_time: new Date().toISOString(),
        retrieved_by: "system"
      };
    }
  } catch (error) {
    console.error(`Error retrieving item ${itemId}:`, error);
    throw error;
  }
}

/**
 * Track usage of an item when it's retrieved
 * @param {string} itemId - The ID of the item to retrieve
 * @param {string} userId - ID of the person retrieving the item
 * @returns {Promise<Object>} - Updated item information
 */
export async function trackItemUsage(itemId, userId = "system") {
  try {
    const response = await fetch(`${API_BASE_URL}/api/retrieve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ itemId, userId })
    });
    
    const data = await response.json();
    
    // If there was an error like 404, still return a structured response
    if (!response.ok) {
      return {
        success: false,
        message: data.detail || `Error retrieving item ${itemId}`,
        item: null
      };
    }
    
    return data;
  } catch (error) {
    console.error(`Error tracking usage for item ${itemId}:`, error);
    return {
      success: false,
      message: `Error retrieving item: ${error.message}`,
      item: null
    };
  }
}

/**
 * Place an item back in a container after use
 * @param {Object} itemPlacement - The placement information
 * @returns {Promise<Object>} - Updated item information
 */
export async function placeItemAfterUse(itemPlacement) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/place`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(itemPlacement)
    });
    return await response.json();
  } catch (error) {
    console.error('Error placing item after use:', error);
    throw error;
  }
}

/**
 * Get all containers and their items
 * @returns {Promise<Object>} - Container data with items
 */
export async function getContainers() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/containers`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching containers:', error);
    // Return a fallback with sample zones
    return {
      containers: [
        { id: "SB01", zone: "Sanitation_Bay" },
        { id: "CC01", zone: "Command_Center" },
        { id: "EB01", zone: "Engineering_Bay" },
        { id: "CQ01", zone: "Crew_Quarters" },
        { id: "MB01", zone: "Medical_Bay" },
        { id: "G01", zone: "Greenhouse" }
      ],
      count: 6,
      message: "Fallback container data"
    };
  }
}

/**
 * Search for items based on various criteria
 * @param {Object} searchParams - Search parameters
 * @returns {Promise<Array>} - Matching items
 */
export async function searchItems(searchParams) {
  try {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== null && value !== undefined) {
        queryParams.append(key, value);
      }
    }
    
    const response = await fetch(`${API_BASE_URL}/api/search?${queryParams.toString()}`);
    return await response.json();
  } catch (error) {
    console.error('Error searching items:', error);
    throw error;
  }
}

/**
 * Identify waste items based on expiry and usage
 * @returns {Promise<Object>} - Waste items information
 */
export async function identifyWaste() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/waste/identify`);
    return await response.json();
  } catch (error) {
    console.error('Error identifying waste:', error);
    throw error;
  }
}

/**
 * Generate a plan for returning waste items
 * @param {string} targetZone - Zone where waste should be moved to
 * @param {boolean} includeAllWaste - Include waste items that are already placed in containers
 * @returns {Promise<Object>} - Waste return plan
 */
export async function generateWasteReturnPlan(zoneId = "W", includeAllWaste = true) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/waste/return-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        zoneId,
        includeAllWaste: includeAllWaste // Add parameter to include all waste items
      })
    });
    return await response.json();
  } catch (error) {
    console.error('Error generating waste return plan:', error);
    throw error;
  }
}

/**
 * Complete the undocking of waste containers
 * @param {string[]} containerIds - IDs of containers to undock
 * @param {boolean} removeItems - Whether to remove items from the system
 * @returns {Promise<Object>} - Result of the undocking operation
 */
export async function completeWasteUndocking(containerIds, removeItems = true) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/waste/complete-undocking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ containerIds, removeItems })
    });
    return await response.json();
  } catch (error) {
    console.error('Error completing waste undocking:', error);
    throw error;
  }
}

/**
 * Simulate a day with optional usage plan
 * @param {Object} usagePlan - Plan for item usage, keys are item IDs and values are usage counts
 * @returns {Promise<Object>} - Simulation results
 */
export async function simulateDay(usagePlan = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}/simulate/day`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ usage_plan: usagePlan })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error simulating day:', error);
    throw error;
  }
}

/**
 * Get action logs with optional filters
 * @param {Object} filters - Log filters
 * @returns {Promise<Object>} - Log entries
 */
export async function getLogs(filters = {}) {
  try {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== null && value !== undefined) {
        queryParams.append(key, value);
      }
    }
    
    const response = await fetch(`${API_BASE_URL}/api/logs?${queryParams.toString()}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching logs:', error);
    throw error;
  }
}

/**
 * Export the current arrangement as CSV
 * @returns {Promise<Blob>} - CSV file as blob
 */
export async function exportArrangement() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/export/arrangement`);
    return await response.blob();
  } catch (error) {
    console.error('Error exporting arrangement:', error);
    throw error;
  }
}

/**
 * Get container rearrangement recommendations
 * @returns {Promise<Object>} - Rearrangement suggestions
 */
export async function getRearrangementSuggestions() {
  try {
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    
    // First get all containers to check their capacity
    console.log("Fetching all containers to check capacity...");
    const containersResponse = await fetch(`${API_BASE_URL}/api/containers?t=${timestamp}`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    let containerCapacityMap = {};
    if (containersResponse.ok) {
      const containersData = await containersResponse.json();
      // Create a map of container ID to available space
      containerCapacityMap = containersData.containers.reduce((map, container) => {
        const capacity = container.capacity || 10;
        const totalItems = container.total_items || 0;
        const availableSpace = capacity - totalItems;
        
        map[container.id] = {
          hasSpace: availableSpace > 0,
          zone: container.zone,
          availableSpace: availableSpace,
          capacity: capacity,
          totalItems: totalItems
        };
        return map;
      }, {});
      
      console.log("Container capacity map:", containerCapacityMap);
    }
    
    // First try the newer API endpoint with more aggressive parameters
    try {
      const priorityThreshold = 50;  // Higher threshold to include more items
      const maxMovements = 20;       // More movements allowed
      const spaceTarget = 10.0;      // Lower space target for easier optimization

      const response = await fetch(`${API_BASE_URL}/api/rearrangement?priority_threshold=${priorityThreshold}&max_movements=${maxMovements}&space_target=${spaceTarget}&t=${timestamp}`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("New API rearrangement response:", data);
        
        // Make sure 'movements' array is properly formatted for the frontend
        if (data.movements && Array.isArray(data.movements)) {
          // Filter movements to only include those where target container has space
          const filteredMovements = data.movements.filter(move => {
            const toContainerId = move.to_container_id;
            // Check if we have capacity info for this container and it has space
            // Explicitly reject containers that have no space available
            if (containerCapacityMap[toContainerId]) {
              console.log(`Container ${toContainerId} capacity check: available space = ${containerCapacityMap[toContainerId].availableSpace}`);
              return containerCapacityMap[toContainerId].availableSpace > 0;
            }
            return true; // Include if no capacity info (will be checked during execution)
          });
          
          console.log(`Filtered movements: ${filteredMovements.length} of ${data.movements.length} (removed ${data.movements.length - filteredMovements.length} to full containers)`);
          
          // Add a rearrangement_plan array for backward compatibility
          data.rearrangement_plan = filteredMovements.map(move => ({
            item_id: move.item_id,
            item_name: move.item_name || move.item_id, 
            from_container: move.from_container_id,
            to_container: move.to_container_id,
            reason: move.description || "Optimize container space"
          }));
        } else {
          // If no movements, ensure we have an empty array instead of null
          data.rearrangement_plan = [];
        }
        
        // Format disorganized_containers to ensure they have all required fields
        if (data.disorganized_containers && Array.isArray(data.disorganized_containers)) {
          data.disorganized_containers = data.disorganized_containers.map(container => ({
            container_id: container.id,
            zone: container.zone || 'N/A',
            efficiency_score: container.efficiency_score || 0,
            inefficiency_score: container.inefficiency_score || 0,
            total_items: container.total_items || 0,
            items_count: container.total_items || 0,
            type: container.type || 'storage',
            // Add capacity info
            capacity: container.capacity || 10,
            available_space: (container.capacity || 10) - (container.total_items || 0)
          }));
        }
        
        // Add timestamp to response
        data.timestamp = timestamp;
        
        return data;
      }
    } catch (newApiError) {
      console.log("Error using new API:", newApiError);
      // Continue to try legacy API
    }
    
    // Fallback to old API if new one failed
    console.log("Trying legacy rearrangement endpoint...");
    const legacyResponse = await fetch(`${API_BASE_URL}/api/rearrangement-recommendation?t=${timestamp}`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
      }
    });
    
    if (!legacyResponse.ok) {
      const errorData = await legacyResponse.json();
      console.error('Legacy rearrangement API error:', errorData);
      throw new Error(errorData.detail || 'Failed to get rearrangement suggestions');
    }
    
    const legacyData = await legacyResponse.json();
    console.log("Legacy API rearrangement response:", legacyData);
    
    // If legacy data has no rearrangement information, return with empty arrays, not fake data
    if (!legacyData.suggested_moves && !legacyData.rearrangement_plan) {
      return {
        success: true,
        message: "No rearrangement needed",
        suggested_moves: [],
        disorganized_containers: legacyData.disorganized_containers || [],
        movements: [],
        rearrangement_plan: [],
        timestamp: timestamp
      };
    }
    
    // If legacy data has suggested_moves but no rearrangement_plan, create it
    if (legacyData.suggested_moves && Array.isArray(legacyData.suggested_moves)) {
      // Filter suggested moves to only include those where target container has space
      const filteredMoves = legacyData.suggested_moves.filter(move => {
        // Get the first suggested container
        const suggestedContainer = move.suggested_containers && move.suggested_containers.length > 0 
          ? move.suggested_containers[0]
          : null;
        
        // If no container suggested or no capacity info, include it
        if (!suggestedContainer || !containerCapacityMap[suggestedContainer]) return true;
        
        // Only include if container has space
        return containerCapacityMap[suggestedContainer].hasSpace;
      });
      
      console.log(`Filtered legacy moves: ${filteredMoves.length} of ${legacyData.suggested_moves.length} (removed ${legacyData.suggested_moves.length - filteredMoves.length} to full containers)`);
      
      // Update the suggested_moves
      legacyData.suggested_moves = filteredMoves;
      
      // Create rearrangement_plan if it doesn't exist
      if (!legacyData.rearrangement_plan || !legacyData.rearrangement_plan.length) {
        legacyData.rearrangement_plan = filteredMoves.map(move => ({
          item_id: move.item_id,
          item_name: move.item_id, // Use ID as name if not provided
          from_container: move.from_container,
          to_container: move.suggested_containers && move.suggested_containers.length > 0 
            ? move.suggested_containers[0] 
            : "Unknown",
          reason: move.reason || "Optimize container space"
        }));
      }
    }
    
    // Format disorganized_containers for consistent structure
    if (legacyData.disorganized_containers && Array.isArray(legacyData.disorganized_containers)) {
      legacyData.disorganized_containers = legacyData.disorganized_containers.map(container => {
        // If container is just an ID string
        const containerId = typeof container === 'string' ? container : (container.id || container.container_id);
        const capacityInfo = containerCapacityMap[containerId] || { hasSpace: true, availableSpace: 5 };
        
        if (typeof container === 'string') {
          return {
            container_id: container,
            zone: capacityInfo.zone || 'N/A',
            efficiency: 0.7,
            efficiency_score: 70,
            accessibility_issues: 1,
            items_count: 0,
            capacity: 10,
            available_space: capacityInfo.availableSpace || 10
          };
        }
        // If container is an object
        return {
          container_id: containerId,
          zone: container.zone || capacityInfo.zone || 'N/A',
          efficiency: container.efficiency || 0.7,
          efficiency_score: container.efficiency_score || 70,
          accessibility_issues: container.accessibility_issues || 1,
          items_count: container.items_count || container.total_items || 0,
          capacity: container.capacity || 10,
          available_space: capacityInfo.availableSpace || (container.capacity || 10) - (container.items_count || container.total_items || 0)
        };
      });
    }
    
    // Add timestamp to response
    legacyData.timestamp = timestamp;
    
    return legacyData;
  } catch (error) {
    console.error('Error getting rearrangement suggestions:', error);
    throw error;
  }
}

/**
 * Execute a rearrangement plan by moving the specified items
 * @param {Array} rearrangementPlan - The plan to execute, containing item moves
 * @returns {Promise<Object>} - Result of the rearrangement operation
 */
export async function executeRearrangementPlan(rearrangementPlan) {
  try {
    console.log("Executing rearrangement plan:", rearrangementPlan);
    
    if (!rearrangementPlan || rearrangementPlan.length === 0) {
      return {
        success: false,
        message: "No rearrangement plan provided",
        results: []
      };
    }
    
    // Get a timestamp to prevent caching
    const timestamp = new Date().getTime();
    
    // Format the rearrangement plan for the bulk /api/placement endpoint
    // This follows the problem statement requirement of calling /api/placement with container and item data
    const itemsToMove = rearrangementPlan.map(move => ({
      id: move.item_id || move.itemId,
      containerId: move.to_container || move.toContainer,
      from_container: move.from_container || move.fromContainer,
      auto_position: true // Use auto-positioning
    }));
    
    console.log("Using bulk placement with /api/placement for rearrangement:", itemsToMove);
    
    // Call the bulk placement endpoint with all items at once
    const response = await fetch(`${API_BASE_URL}/api/placement?t=${timestamp}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        items: itemsToMove,
        rearrangement: true // Flag to indicate this is a rearrangement operation
      })
    });
    
    const responseData = await response.json();
    console.log("Bulk placement response:", responseData);
    
    // Process the results
    let results = [];
    let successCount = 0;
    
    if (responseData.success || (responseData.placed_items?.length > 0 || responseData.failed_items?.length > 0)) {
      // Handle cases where the overall call might report success but individual items failed,
      // or where the call failed but provided detailed results.
      results = rearrangementPlan.map(move => {
        const itemId = move.item_id || move.itemId;
        const toContainer = move.to_container || move.toContainer;
        const fromContainer = move.from_container || move.fromContainer;
        
        // Check if the item was successfully placed
        const placedItem = responseData.placed_items?.find(item => item.id === itemId && item.success);
        
        if (placedItem) {
          successCount++;
          // Check if it was placed in the intended container or an alternative
          const wasAlternative = placedItem.container_id !== toContainer;
          return {
            ...move,
            success: true,
            to_container: placedItem.container_id, // Use actual placed container
            message: wasAlternative ? 
              `Successfully moved ${itemId} from ${fromContainer} to ${placedItem.container_id} (alternative)` :
              `Successfully moved ${itemId} from ${fromContainer} to ${toContainer}`
          };
        } else {
          // Item failed to place, find the specific error message
          const failedItemData = responseData.failed_items?.find(item => item.id === itemId);
          return {
            ...move,
            success: false,
            message: failedItemData?.message || `Failed to move ${itemId} to ${toContainer}` // Use specific message if available
          };
        }
      });
    } else {
      // If the bulk operation failed entirely and didn't provide details
      results = rearrangementPlan.map(move => {
        const itemId = move.item_id || move.itemId;
        const toContainer = move.to_container || move.toContainer;
        
        return {
          ...move,
          success: false,
          // Use the overall error message from the backend response
          message: responseData.message || `Failed to process move for ${itemId} to ${toContainer}`
        };
      });
    }
    
    // Try to get a fresh data load after the moves
    try {
      console.log("Refreshing container data...");
      await fetch(`${API_BASE_URL}/api/containers?refresh=true&t=${timestamp}`, {
        headers: {'Cache-Control': 'no-cache', 'Pragma': 'no-cache'}
      });
    } catch (e) {
      console.log("Container refresh failed:", e);
    }
    
    return {
      success: successCount > 0,
      message: `Successfully moved ${successCount}/${rearrangementPlan.length} items`,
      results,
      timestamp: timestamp
    };
  } catch (error) {
    console.error('Error executing rearrangement plan:', error);
    return {
      success: false,
      message: `Error executing rearrangement plan: ${error.message}`,
      results: []
    };
  }
}

/**
 * Get all items
 * @returns {Promise<Object>} - All items
 */
export async function getAllItems() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/search`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching all items:', error);
    throw error;
  }
}

/**
 * Execute the waste placement plan by saving it to the database
 * @param {Object} plan - The waste placement plan to execute
 * @returns {Promise<Object>} - Result of the execution
 */
export async function executeWastePlacementPlan(plan) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/waste/execute-placement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        placement_plan: plan.placement_plan
      }),
    });
    
    return await response.json();
  } catch (error) {
    console.error('Error executing waste placement plan:', error);
    throw error;
  }
}

// --- New Undocking API Functions --- 

/**
 * Generate an undocking plan based on max weight.
 * @param {number} maxWeight - The maximum weight limit.
 * @returns {Promise<Object>} - Undocking plan details.
 */
export async function generateUndockingPlan(maxWeight) {
  if (maxWeight === null || maxWeight === undefined || maxWeight <= 0) {
    return { success: false, message: "Invalid maximum weight provided.", items_in_plan: [], total_weight: 0 };
  }
  try {
    const timestamp = new Date().getTime(); // Prevent caching
    const response = await fetch(`${API_BASE_URL}/api/undocking/generate-plan?max_weight=${maxWeight}&t=${timestamp}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `HTTP error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error generating undocking plan:', error);
    return { success: false, message: `Error: ${error.message}`, items_in_plan: [], total_weight: 0 };
  }
}

/**
 * Triggers the download of the undocking manifest CSV.
 * @param {number} maxWeight - The maximum weight limit (must match the generated plan).
 */
export async function downloadUndockingManifest(maxWeight) {
  if (maxWeight === null || maxWeight === undefined || maxWeight <= 0) {
    console.error("Invalid maximum weight provided for manifest download.");
    // Optionally show a user-friendly error, e.g., using toast
    alert("Please enter a valid maximum weight before downloading the manifest.");
    return;
  }
  try {
    const timestamp = new Date().getTime();
    const url = `${API_BASE_URL}/api/undocking/export-manifest?max_weight=${maxWeight}&t=${timestamp}`;
    
    // Use window.open for simple download triggering, works across most browsers
    // for GET requests resulting in file downloads.
    window.open(url, '_blank');
    
  } catch (error) {
    console.error('Error downloading undocking manifest:', error);
    alert(`Failed to download manifest: ${error.message}`); // Simple feedback
  }
} 