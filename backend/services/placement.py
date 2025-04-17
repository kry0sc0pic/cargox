from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from loguru import logger
from models import Container, Item
import math
from datetime import datetime, date, timedelta
import itertools

class PlacementService:
    """Service for placing items in containers using a 3D bin packing algorithm with priority and zone preferences"""
    
    def __init__(self, db: Session):
        """Initialize the placement service with a database session"""
        self.db = db
    
    def place_items(self, items: List[Item] = None) -> Dict[str, Any]:
        """
        Place items in containers, considering priority, dimensions, and preferred zones.
        
        Args:
            items: List of items to place, or None to place all unplaced items
        
        Returns:
            Dictionary with placement results
        """
        # Get all containers
        containers = self.db.query(Container).all()
        if not containers:
            logger.warning("No containers available for placement")
            return {"placed_count": 0, "unplaced_count": len(items) if items else 0}
        
        # Get items to place
        if items is None:
            items = self.db.query(Item).filter(Item.is_placed == False).all()
            logger.info(f"Found {len(items)} unplaced items in database")
        
        if not items:
            # Try a different approach to get items
            all_items = self.db.query(Item).all()
            logger.info(f"Total items in database: {len(all_items)}")
            
            # If we have items but none are unplaced, reset placement status
            if all_items:
                logger.info("Resetting placement status for all items")
                for item in all_items:
                    item.is_placed = False
                    item.container_id = None
                    item.position_x = None
                    item.position_y = None
                    item.position_z = None
                self.db.commit()
                items = all_items
            else:
                logger.info("No items to place")
                return {"placed_count": 0, "unplaced_count": 0}
        
        # Track container item counts (for capacity limits)
        container_item_counts = {container.id: 0 for container in containers}
        
        # Group containers by zone for preferred zone placement
        containers_by_zone = {}
        for container in containers:
            if container.zone not in containers_by_zone:
                containers_by_zone[container.zone] = []
            containers_by_zone[container.zone].append(container)
        
        # Sort items by priority (higher first), density, and volume efficiency
        logger.info(f"Sorting {len(items)} items by priority and dimensional efficiency")
        sorted_items = sorted(items, key=lambda i: (
            -i.priority,  # Higher priority first
            self._calculate_volume_efficiency(i)  # More efficient shapes next
        ))
        
        placed_items = []
        unplaced_items = []
        
        for item in sorted_items:
            logger.debug(f"Attempting to place item {item.id} (priority {item.priority})")
            
            # First try the preferred zone if specified
            placed = False
            if item.preferred_zone and item.preferred_zone in containers_by_zone:
                preferred_containers = containers_by_zone[item.preferred_zone]
                placed = self._try_place_in_containers(
                    item, preferred_containers, container_item_counts, placed_items, prioritize_preferred=True
                )
            
            # If not placed in preferred zone, try any zone
            if not placed:
                # Sort containers by available space
                sorted_containers = sorted(containers, key=lambda c: (
                    container_item_counts[c.id] / max(1, c.capacity),  # Fill ratio (lower first)
                    -(c.width * c.height * c.depth)  # Container volume (larger first)
                ))
                
                placed = self._try_place_in_containers(
                    item, sorted_containers, container_item_counts, placed_items
                )
            
            if placed:
                placed_items.append(item)
            else:
                unplaced_items.append(item)
        
        # Commit changes to database
        try:
            self.db.commit()
            logger.info(f"Successfully placed {len(placed_items)} items, {len(unplaced_items)} items unplaced")
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error committing placement changes: {str(e)}")
        
        return {
            "placed_count": len(placed_items),
            "unplaced_count": len(unplaced_items),
            "placed_items": placed_items,
            "unplaced_items": unplaced_items
        }
    
    def _calculate_volume_efficiency(self, item: Item) -> float:
        """
        Calculate a score for how efficiently the item uses space.
        Lower score means more efficient (better) use of space.
        
        Args:
            item: The item to evaluate
            
        Returns:
            Efficiency score (lower is better)
        """
        # Calculate total volume
        volume = item.width * item.height * item.depth
        
        # Calculate the "wasted space" factor - items with similar dimensions on all sides
        # are generally more efficient to pack than long/thin items
        dimensions = [item.width, item.height, item.depth]
        max_dim = max(dimensions)
        min_dim = min(dimensions)
        
        if min_dim > 0:
            aspect_ratio = max_dim / min_dim
        else:
            aspect_ratio = 100  # Arbitrary large number for edge case
        
        # Combine volume and aspect ratio factors - items with lower volume
        # and more cubic shapes (aspect ratio closer to 1) get better scores
        return volume * (0.5 + aspect_ratio * 0.5)
    
    def _try_place_in_containers(self, item: Item, containers: List[Container], 
                                  container_item_counts: Dict[str, int], 
                                  placed_items: List[Item], 
                                  prioritize_preferred: bool = False) -> bool:
        """
        Try to place an item in any of the given containers, considering all possible orientations.
        
        Args:
            item: The item to place
            containers: List of containers to try
            container_item_counts: Dictionary tracking item counts per container
            placed_items: List of already placed items
            prioritize_preferred: Whether these are preferred zone containers
            
        Returns:
            True if the item was placed, False otherwise
        """
        # Sort containers by utilization and size
        containers.sort(key=lambda c: (
            container_item_counts[c.id] / max(1, c.capacity),  # Fill containers evenly, prevent division by zero
            -(c.width * c.height * c.depth)  # Prefer larger containers
        ))
        
        for container in containers:
            # Skip waste containers (containers with IDs starting with "WST") 
            # for regular item placement
            if container.id.startswith("WST") and not item.is_waste:
                logger.debug(f"Skipping waste container {container.id} for regular item placement")
                continue
                
            # Skip if container is at capacity - strictly enforce the capacity limit
            if container_item_counts[container.id] >= container.capacity:
                logger.debug(f"Skipping container {container.id} - at capacity limit ({container_item_counts[container.id]}/{container.capacity})")
                continue
                
            # Get items already in this container
            existing_items = [i for i in placed_items if i.container_id == container.id]
            
            # Double-check the capacity using placed_items (belt and suspenders approach)
            if len(existing_items) >= container.capacity:
                logger.warning(f"Container {container.id} already at capacity ({len(existing_items)}/{container.capacity}) despite tracking dict showing {container_item_counts[container.id]}")
                container_item_counts[container.id] = len(existing_items)  # Correct the count
                continue
            
            # Try all possible orientations of the item
            position, orientation = self._find_position_with_rotation(
                container, 
                item, 
                existing_items, 
                prioritize_access=item.priority > 75
            )
            
            if position:
                # Place the item in the container at the found position with the optimal orientation
                placement_success = self._place_item(item, container, position, orientation)
                
                if placement_success:
                    container_item_counts[container.id] += 1
                    return True
                else:
                    # If placement failed (e.g., due to capacity check), try next container
                    logger.warning(f"Placement of item {item.id} in container {container.id} failed, trying next container")
                    continue
                
        return False
    
    def _clear_existing_placements(self):
        """Clear all existing placements by resetting relevant fields"""
        items = self.db.query(Item).all()
        
        for item in items:
            item.container_id = None
            item.position_x = None
            item.position_y = None
            item.position_z = None
            item.is_placed = False
    
    def _get_item_rotations(self, item: Item) -> List[Tuple[float, float, float]]:
        """
        Generate all possible orthogonal orientations (90° rotations) of an item.
        
        Args:
            item: The item to rotate
            
        Returns:
            List of (width, height, depth) tuples representing all possible orientations
        """
        # Create all possible permutations of the item's dimensions
        # This gives us all 6 possible orthogonal orientations (90° rotations)
        dimensions = [item.width, item.height, item.depth]
        return list(itertools.permutations(dimensions))
    
    def _find_position_with_rotation(self, container: Container, item: Item, 
                                     existing_items: List[Item], 
                                     prioritize_access: bool = False) -> Tuple[Optional[Tuple[float, float, float]], Optional[Tuple[float, float, float]]]:
        """
        Find a valid position for an item in a container, trying all possible orientations.
        
        Args:
            container: The container to place the item in
            item: The item to place
            existing_items: List of items already in the container
            prioritize_access: If True, prioritize positions near the open face (z=0)
            
        Returns:
            Tuple of (position, orientation) where position is (x,y,z) and orientation is (width,height,depth),
            or (None, None) if no valid position found
        """
        # Handle potential unit differences (container dimensions might be in cm while items in m)
        container_width = container.width
        container_height = container.height
        container_depth = container.depth
        
        # If container dimensions are very large compared to items, they might be in cm
        # Detect this automatically and convert to the same units
        item_avg_dim = (item.width + item.height + item.depth) / 3
        container_avg_dim = (container_width + container_height + container_depth) / 3
        
        # If container dimensions are ~50x larger than items, assume they're in different units
        conversion_needed = container_avg_dim > (item_avg_dim * 50)
        
        if conversion_needed:
            # Convert container dimensions from cm to m (or whatever units items are in)
            container_width /= 100
            container_height /= 100
            container_depth /= 100
            logger.info(f"Converting container dimensions from cm to m for placement calculation")
        
        # Check if the container is already at capacity
        if len(existing_items) >= container.capacity:
            return None, None
        
        # Get all possible orientations of the item
        orientations = self._get_item_rotations(item)
        
        # Dictionary to store valid positions for each orientation
        valid_positions_by_orientation = {}
        
        # Try each orientation
        for orientation in orientations:
            width, height, depth = orientation
            
            # Skip orientations that don't fit in the container
            if (width > container_width or 
                height > container_height or 
                depth > container_depth):
                continue
            
            # Calculate max positions in each dimension
            max_x = max(0, container_width - width)
            max_y = max(0, container_height - height)
            max_z = max(0, container_depth - depth)
            
            # Calculate step sizes based on container size
            step_size = 0.1  # 10cm steps (assuming meters)
            
            # For very large containers, use bigger steps to avoid excessive computation
            if container_avg_dim > 10:  # If container is larger than 10m in average dimension
                step_size = 0.25  # 25cm steps
            
            # Calculate number of steps in each dimension
            x_steps = min(int(max_x / step_size) + 1, 20)  # Limit to 20 steps max
            y_steps = min(int(max_y / step_size) + 1, 20)
            z_steps = min(int(max_z / step_size) + 1, 20)
            
            positions = []
            
            # If dimensions are small enough, check more precisely
            if x_steps <= 10 and y_steps <= 10 and z_steps <= 10:
                # For smaller containers, do a more thorough search
                for z in range(0, z_steps):
                    z_pos = (z / max(1, z_steps - 1)) * max_z
                    for y in range(0, y_steps):
                        y_pos = (y / max(1, y_steps - 1)) * max_y
                        for x in range(0, x_steps):
                            x_pos = (x / max(1, x_steps - 1)) * max_x
                            position = (x_pos, y_pos, z_pos)
                    
                    # Check if this position would cause a collision with any existing item
                    collision = False
                    for existing_item in existing_items:
                        ex_pos_x = existing_item.position_x
                        ex_pos_y = existing_item.position_y
                        ex_pos_z = existing_item.position_z
                                
                        if self._check_collision(
                            (x_pos, y_pos, z_pos), 
                            (width, height, depth),
                            (ex_pos_x, ex_pos_y, ex_pos_z),
                            (existing_item.width, existing_item.height, existing_item.depth)
                        ):
                            collision = True
                            break
                    
                    if not collision:
                                positions.append(position)
            else:
                # For larger containers, use a sparser grid to save computation
                # Try placing at corners, edges, and a few points in between
                grid_x = [0, max_x/3, max_x*2/3, max_x] if max_x > 0 else [0]
                grid_y = [0, max_y/3, max_y*2/3, max_y] if max_y > 0 else [0]
                grid_z = [0, max_z/3, max_z*2/3, max_z] if max_z > 0 else [0]
                
                for x_pos in grid_x:
                    for y_pos in grid_y:
                        for z_pos in grid_z:
                            position = (x_pos, y_pos, z_pos)
                            
                            # Check for collisions
                            collision = any(self._check_collision(
                                position,
                                (width, height, depth),
                                (existing_item.position_x, existing_item.position_y, existing_item.position_z),
                                (existing_item.width, existing_item.height, existing_item.depth)
                            ) for existing_item in existing_items)
                            
                            if not collision:
                                positions.append(position)
            
            if positions:
                # Sort positions based on preference
                if prioritize_access:
                    # For high priority items, prefer positions near the front (smallest z)
                    positions.sort(key=lambda pos: pos[2])
                else:
                    # For other items, optimize space usage by placing at the back
                    positions.sort(key=lambda pos: -pos[2])
                
                # Store the best position for this orientation
                valid_positions_by_orientation[orientation] = positions[0]
        
        if not valid_positions_by_orientation:
            return None, None
        
        # Select the best orientation based on position and item priority
        if prioritize_access:
            # For high priority items, select the orientation that gives the most accessible position
            best_orientation = min(valid_positions_by_orientation.keys(), 
                                  key=lambda o: valid_positions_by_orientation[o][2])
        else:
            # For other items, prefer orientations that minimize "wasted space"
            # by aligning with container boundaries or other items
            best_orientation = min(valid_positions_by_orientation.keys(),
                                  key=lambda o: self._calculate_orientation_score(o, valid_positions_by_orientation[o], container_width, container_height, container_depth))
        
        best_position = valid_positions_by_orientation[best_orientation]
        return best_position, best_orientation
    
    def _calculate_orientation_score(self, orientation: Tuple[float, float, float], 
                                   position: Tuple[float, float, float],
                                   container_width: float, container_height: float, container_depth: float) -> float:
        """
        Calculate a score for how well an orientation utilizes space at a given position.
        Lower scores are better.
        
        Args:
            orientation: The item orientation (width, height, depth)
            position: The position (x, y, z)
            container_width/height/depth: Container dimensions
            
        Returns:
            Score (lower is better)
        """
        width, height, depth = orientation
        x, y, z = position
        
        # Calculate how much of the item "touches" the container walls
        # Higher touch area is better (lower score)
        touch_area = 0
        
        # Check if the item touches each wall
        if x == 0:
            touch_area += height * depth
        if y == 0:
            touch_area += width * depth
        if z == 0:
            touch_area += width * height
        if x + width == container_width:
            touch_area += height * depth
        if y + height == container_height:
            touch_area += width * depth
        if z + depth == container_depth:
            touch_area += width * height
        
        # Also consider Z position - prefer items further back for non-priority items
        z_score = -z  # Negative so higher z (further back) gives lower score
        
        # Calculate the final score (lower is better)
        # Emphasize touch area (80%) and z-position (20%)
        return -touch_area * 0.8 + z_score * 0.2
    
    def _check_collision(self, 
                         pos1: Tuple[float, float, float], 
                         dim1: Tuple[float, float, float],
                         pos2: Tuple[float, float, float], 
                         dim2: Tuple[float, float, float]) -> bool:
        """
        Check if two 3D boxes collide.
        
        Args:
            pos1: Position (x, y, z) of first box
            dim1: Dimensions (width, height, depth) of first box
            pos2: Position (x, y, z) of second box
            dim2: Dimensions (width, height, depth) of second box
            
        Returns:
            True if boxes collide, False otherwise
        """
        # Extract positions and dimensions
        x1, y1, z1 = pos1
        width1, height1, depth1 = dim1
        
        x2, y2, z2 = pos2
        width2, height2, depth2 = dim2
        
        # Check for non-collision on each axis
        no_collision_x = x1 + width1 <= x2 or x2 + width2 <= x1
        no_collision_y = y1 + height1 <= y2 or y2 + height2 <= y1
        no_collision_z = z1 + depth1 <= z2 or z2 + depth2 <= z1
        
        # If there's no collision on any axis, the boxes don't collide
        return not (no_collision_x or no_collision_y or no_collision_z)
    
    def _place_item(self, item: Item, container: Container, position: Tuple[float, float, float], 
                   orientation: Optional[Tuple[float, float, float]] = None):
        """
        Place an item in a container at a specified position and orientation.
        
        Args:
            item: The item to place
            container: The container to place the item in
            position: The position (x, y, z) to place the item at
            orientation: Optional orientation (width, height, depth) if different from item's
        """
        # First, double-check if adding this item would exceed the container capacity
        container_items_count = self.db.query(Item).filter(
            Item.container_id == container.id,
            Item.is_placed == True
        ).count()
        
        if container_items_count >= container.capacity:
            logger.warning(f"Cannot place item {item.id} in container {container.id} - capacity limit reached ({container_items_count}/{container.capacity})")
            return False
            
        x, y, z = position
        
        # Store the original dimensions
        original_width = item.width
        original_height = item.height
        original_depth = item.depth
        
        # If an orientation is provided, update the item's dimensions
        if orientation:
            width, height, depth = orientation
            # Only log if the orientation is different from the original
            if (width != original_width or height != original_height or depth != original_depth):
                logger.info(f"Rotating item {item.id} from ({original_width}, {original_height}, {original_depth}) to ({width}, {height}, {depth})")
                # Update the dimensions in the database
                item.width = width
                item.height = height
                item.depth = depth
        
        # Set the placement data
        item.container_id = container.id
        item.position_x = x
        item.position_y = y
        item.position_z = z
        item.is_placed = True
    
        # Log the placement
        logger.info(f"Placed item {item.id} in container {container.id} at position ({x}, {y}, {z})")
        return True
    
    def get_retrieval_path(self, item_id: str, user: str = "system") -> Dict[str, Any]:
        """
        Calculate the retrieval path for an item, considering expiry date and usage counts.
        
        Args:
            item_id: The ID of the item to retrieve
            user: The person retrieving the item
            
        Returns:
            Dictionary with retrieval information including any items that need to be moved
        """
        # Get the item from database
        item = self.db.query(Item).filter(Item.id == item_id).first()
        
        if not item:
            logger.warning(f"Item {item_id} not found")
            return {
                "found": False,
                "item_id": item_id,
                "path": [],
                "disturbed_items": [],
                "location": None,
                "retrieval_time": datetime.now().isoformat(),
                "retrieved_by": user
            }
        
        if not item.is_placed or not item.container_id:
            logger.warning(f"Item {item_id} is not placed in any container")
            return {
                "found": True,
                "item_id": item_id,
                "path": ["Item is not placed in any container"],
                "disturbed_items": [],
                "location": None,
                "retrieval_time": datetime.now().isoformat(),
                "retrieved_by": user
            }
        
        # Get the container
        container = self.db.query(Container).filter(Container.id == item.container_id).first()
        
        if not container:
            logger.error(f"Container {item.container_id} not found for item {item_id}")
            return {
                "found": True,
                "item_id": item_id,
                "path": ["Error: Container not found"],
                "disturbed_items": [],
                "location": None,
                "retrieval_time": datetime.now().isoformat(),
                "retrieved_by": user
            }
        
        # Get all items in the container
        container_items = self.db.query(Item).filter(
            Item.container_id == container.id,
            Item.id != item_id,
            Item.is_placed == True
        ).all()
        
        # Calculate items that need to be moved to access this item
        disturbed_items = []
        for other_item in container_items:
            # An item blocks access if it's positioned in front of the target item
            if (other_item.position_z < item.position_z and
                self._check_collision(
                    (item.position_x, item.position_y, item.position_z),
                    (item.width, item.height, item.depth),
                    (other_item.position_x, other_item.position_y, item.position_z),
                    (other_item.width, other_item.height, other_item.depth)
                )):
                disturbed_items.append(other_item.id)
        
        # Update retrieval statistics for the item
        item.last_retrieved = date.today()
        item.last_retrieved_by = user
        
        # Create the retrieval path
        path = []
        path.append(f"Open container {container.id}")
        
        if disturbed_items:
            path.append(f"Remove {len(disturbed_items)} items that block access")
            for i, disturbed_id in enumerate(disturbed_items):
                path.append(f"  {i+1}. Remove item {disturbed_id}")
        
        path.append(f"Extract item {item_id}")
        
        if disturbed_items:
            path.append("Replace removed items")
        
        path.append(f"Close container {container.id}")
        
        # Try to commit the retrieval stats update
        try:
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating retrieval stats: {str(e)}")
        
        return {
            "found": True,
            "item_id": item_id,
            "path": path,
            "disturbed_items": disturbed_items,
            "location": {
                "container": container.id,
                "position": {
                    "x": item.position_x,
                    "y": item.position_y,
                    "z": item.position_z
                }
            },
            "retrieval_time": datetime.now().isoformat(),
            "retrieved_by": user
        }

    def _find_position(self, container: Container, item: Item, existing_items: List[Item], 
                      prioritize_access: bool = False) -> Tuple[Optional[Tuple[float, float, float]], Optional[Tuple[float, float, float]]]:
        """
        Legacy method to find a position for an item without trying rotations.
        Used as a fallback for compatibility.
        
        Args:
            container: The container to place the item in
            item: The item to place
            existing_items: List of items already in the container
            prioritize_access: If True, prioritize positions near the open face
            
        Returns:
            Tuple of (position, orientation) or (None, None) if no valid position
        """
        # Scale dimensions if needed
        container_width = container.width
        container_height = container.height
        container_depth = container.depth
        
        # Auto-detect unit conversion
        item_avg_dim = (item.width + item.height + item.depth) / 3
        container_avg_dim = (container_width + container_height + container_depth) / 3
        
        # If container dimensions are significantly larger, assume they're in different units
        if container_avg_dim > (item_avg_dim * 50):
            container_width /= 100
            container_height /= 100
            container_depth /= 100
        
        # Check if item fits in container
        if (item.width > container_width or 
            item.height > container_height or 
            item.depth > container_depth):
            return None, None
        
        # Calculate max positions
        max_x = container_width - item.width
        max_y = container_height - item.height
        max_z = container_depth - item.depth
        
        # Use fixed-point positions to try to place the item
        if max(container_width, container_height, container_depth) < 5:
            # For smaller containers, try more positions
            positions = []
            for z in [0, max_z/2, max_z]:
                for y in [0, max_y/2, max_y]:
                    for x in [0, max_x/2, max_x]:
                        if x <= max_x and y <= max_y and z <= max_z:
                            pos = (x, y, z)
                            
                            # Check for collisions
                            if not any(self._check_collision(
                                pos,
                                (item.width, item.height, item.depth),
                                (existing_item.position_x, existing_item.position_y, existing_item.position_z),
                                (existing_item.width, existing_item.height, existing_item.depth)
                            ) for existing_item in existing_items):
                                positions.append(pos)
        else:
            # For larger containers, use fewer positions
            positions = []
            for z in [0, max_z]:
                for y in [0, max_y]:
                    for x in [0, max_x]:
                        if x <= max_x and y <= max_y and z <= max_z:
                            pos = (x, y, z)
                            
                            # Check for collisions
                            if not any(self._check_collision(
                                pos,
                                (item.width, item.height, item.depth),
                                (existing_item.position_x, existing_item.position_y, existing_item.position_z),
                                (existing_item.width, existing_item.height, existing_item.depth)
                            ) for existing_item in existing_items):
                                positions.append(pos)
        
        if not positions:
            return None, None
        
        # Sort positions based on priority
        if prioritize_access:
            # High priority - closest to the front
            positions.sort(key=lambda pos: pos[2])
        else:
            # Low priority - furthest from the front
            positions.sort(key=lambda pos: -pos[2])
        
        return positions[0], (item.width, item.height, item.depth)
        
    def suggest_rearrangement(self) -> Dict[str, Any]:
        """
        Analyze current container organization and suggest rearrangements.
        Looks for inefficient space usage or item accessibility issues.
        
        Returns:
            Dictionary with suggested moves and explanation
        """
        # Get all containers with items
        containers = self.db.query(Container).all()
        items = self.db.query(Item).filter(Item.is_placed == True).all()
        
        if not containers or not items:
            return {
                "suggested_moves": [],
                "disorganized_containers": [],
                "reason": "No containers or items to analyze"
            }
        
        # Group items by container
        items_by_container = {}
        for item in items:
            if item.container_id not in items_by_container:
                items_by_container[item.container_id] = []
            items_by_container[item.container_id].append(item)
        
        # Identify disorganized containers
        disorganized_containers = []
        suggested_moves = []
        
        for container in containers:
            # Skip waste containers when analyzing organization
            if container.container_type == "waste":
                continue
                
            if container.id not in items_by_container:
                continue
                
            container_items = items_by_container[container.id]
            
            # Skip containers with too few items
            if len(container_items) < 3:
                continue
            
            # Check for accessibility issues (high priority items blocked by low priority)
            accessibility_issues = []
            high_priority_items = [item for item in container_items if item.priority > 70]
            
            for high_item in high_priority_items:
                # Items with higher z coordinate are behind this item
                blocking_items = [
                    item for item in container_items
                    if item.position_z > high_item.position_z
                    and item.priority < high_item.priority - 20
                    and self._items_overlap_xy(high_item, item)
                ]
                
                if blocking_items:
                    accessibility_issues.append({
                        "high_priority_item": high_item.id,
                        "blocking_items": [item.id for item in blocking_items]
                    })
            
            # Check for inefficient space usage
            container_volume = container.width * container.height * container.depth
            items_volume = sum(item.width * item.height * item.depth for item in container_items)
            
            # Convert units if necessary
            item_avg_dim = sum(item.width + item.height + item.depth for item in container_items) / (len(container_items) * 3)
            container_avg_dim = (container.width + container.height + container.depth) / 3
            if container_avg_dim > (item_avg_dim * 50):
                # Convert container volume
                container_volume /= 1000000  # cm³ to m³
            
            space_efficiency = (items_volume / container_volume) if container_volume > 0 else 0
            
            # If container is disorganized or inefficient
            if accessibility_issues or space_efficiency < 0.4:
                disorganized_containers.append({
                    "container_id": container.id,
                    "efficiency": space_efficiency,
                    "accessibility_issues": len(accessibility_issues),
                    "items_count": len(container_items)
                })
                
                # Suggest moves to improve organization
                if accessibility_issues:
                    for issue in accessibility_issues:
                        high_item = next((item for item in items if item.id == issue["high_priority_item"]), None)
                        if high_item:
                            # Find suitable target containers in the same zone
                            suitable_containers = [
                                c.id for c in containers 
                                if c.zone == container.zone 
                                and c.id != container.id
                                and self._container_has_space(c, high_item, items_by_container.get(c.id, []))
                            ]
                            
                            # Only suggest a move if there are suitable target containers
                            if suitable_containers:
                                suggested_moves.append({
                                    "item_id": high_item.id,
                                    "item_name": high_item.name,
                                    "from_container": container.id,
                                    "suggested_containers": suitable_containers[:3],
                                    "reason": "High priority item is blocked by lower priority items"
                                })
                
                # Also suggest moving items from overcrowded containers
                if space_efficiency > 0.8 and len(container_items) > container.capacity * 0.9:
                    # Find least important items to move
                    least_important = sorted(container_items, key=lambda i: i.priority)[:3]
                    
                    for item in least_important:
                        # Find suitable target containers with more space
                        suitable_containers = [
                            c.id for c in containers 
                            if c.id != container.id
                            and self._container_has_space(c, item, items_by_container.get(c.id, []))
                            and len(items_by_container.get(c.id, [])) < c.capacity * 0.7
                        ]
                        
                        if suitable_containers:
                            suggested_moves.append({
                                "item_id": item.id,
                                "item_name": item.name,
                                "from_container": container.id,
                                "suggested_containers": suitable_containers[:3],
                                "reason": "Container is overcrowded, redistributing items for better access"
                            })
        
        return {
            "suggested_moves": suggested_moves,
            "disorganized_containers": disorganized_containers,
            "reason": "Found containers with accessibility issues or inefficient space usage"
        }
    
    def _items_overlap_xy(self, item1: Item, item2: Item) -> bool:
        """
        Check if two items overlap in the XY plane (regardless of Z position).
        Used to detect if items are blocking each other.
        
        Args:
            item1: First item
            item2: Second item
            
        Returns:
            True if the items overlap in XY plane
        """
        # Check for non-overlap in X or Y
        no_overlap_x = (item1.position_x + item1.width <= item2.position_x or 
                      item2.position_x + item2.width <= item1.position_x)
        
        no_overlap_y = (item1.position_y + item1.height <= item2.position_y or 
                      item2.position_y + item2.height <= item1.position_y)
        
        # Items overlap if there's neither non-overlap in X nor in Y
        return not (no_overlap_x or no_overlap_y)

    def _container_has_space(self, container: Container, item: Item, existing_items: List[Item]) -> bool:
        """
        Check if a container has space for an item.
        
        Args:
            container: The container to check
            item: The item to place
            existing_items: List of items already in the container
            
        Returns:
            True if the container has space for the item
        """
        # Skip waste containers for regular items
        if container.container_type == "waste" and not item.is_waste:
            return False
            
        # Skip if container is at or above capacity
        if len(existing_items) >= container.capacity:
            return False
        
        # Check if item dimensions fit in container
        if (item.width > container.width or 
            item.height > container.height or 
            item.depth > container.depth):
            return False
        
        # Try to find a position for the item
        position, _ = self._find_position_with_rotation(container, item, existing_items)
        return position is not None

    def manage_waste(self, undocking: bool = False, max_weight: float = None) -> Dict[str, Any]:
        """
        Identify waste items (expired or fully used) and suggest waste management.
        
        Args:
            undocking: If True, prepare for undocking (move waste to waste containers)
            max_weight: Maximum weight limit for undocking waste
            
        Returns:
            Dictionary with waste management information
        """
        # Identify waste items (expired or fully used)
        today = date.today()
        
        # Get items that are expired or fully used
        expired_items = self.db.query(Item).filter(
            Item.expiry_date != None,
            Item.expiry_date < today,
            Item.is_waste == False
        ).all()
        
        fully_used_items = self.db.query(Item).filter(
            Item.usage_limit != None,
            Item.usage_count >= Item.usage_limit,
            Item.is_waste == False
        ).all()
        
        # Mark these items as waste in the database
        waste_items = expired_items + fully_used_items
        for item in waste_items:
            item.is_waste = True
        
        try:
            self.db.commit()
            logger.info(f"Marked {len(waste_items)} items as waste")
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error marking waste items: {str(e)}")
        
        # Find waste containers
        waste_containers = self.db.query(Container).filter(
            Container.container_type == "waste"
        ).all()
        
        waste_container_ids = [c.id for c in waste_containers]
        
        # Calculate total waste mass
        total_waste_mass = sum(item.weight for item in waste_items)
        
        # If undocking, suggest moving waste to waste containers
        waste_movement_plan = []
        if undocking and waste_containers:
            waste_to_move = []
            current_weight = 0
            
            # Sort waste by weight (heaviest first to optimize container usage)
            placed_waste = [item for item in waste_items if item.is_placed]
            placed_waste.sort(key=lambda i: i.weight, reverse=True)
            
            for item in placed_waste:
                if max_weight and current_weight + item.weight > max_weight:
                    continue
                
                waste_to_move.append({
                    "id": item.id,
                    "name": item.name,
                    "weight": item.weight,
                    "current_container": item.container_id
                })
                current_weight += item.weight
            
            # Simple allocation of waste to waste containers
            container_idx = 0
            for item in waste_to_move:
                if container_idx >= len(waste_containers):
                    container_idx = 0
                
                waste_movement_plan.append({
                    "item_id": item["id"],
                    "item_name": item["name"],
                    "from_container": item["current_container"],
                    "to_container": waste_containers[container_idx].id
                })
                container_idx += 1
        
        return {
            "success": True,
            "message": f"Identified {len(waste_items)} waste items",
            "waste_items": [item.id for item in waste_items],
            "waste_containers": waste_container_ids,
            "total_waste_mass": total_waste_mass,
            "waste_movement_plan": waste_movement_plan if undocking else []
        }

    def simulate_time(self, days: int = 1, usage_plan: Dict[str, int] = None) -> Dict[str, Any]:
        """
        Simulate the passage of time and item usage.
        
        Args:
            days: Number of days to simulate
            usage_plan: Dictionary mapping item IDs to usage count increments
            
        Returns:
            Dictionary with simulation results
        """
        today = date.today()
        simulated_date = today + timedelta(days=days)
        
        # Apply usage if a plan is provided
        used_items = []
        if usage_plan:
            for item_id, usage in usage_plan.items():
                item = self.db.query(Item).filter(Item.id == item_id).first()
                if item:
                    item.usage_count += usage
                    used_items.append(item_id)
        
        # Check for newly expired items
        newly_expired = self.db.query(Item).filter(
            Item.expiry_date != None,
            Item.expiry_date > today,
            Item.expiry_date <= simulated_date,
            Item.is_waste == False
        ).all()
        
        # Check for newly fully used items
        newly_used_up = self.db.query(Item).filter(
            Item.usage_limit != None,
            Item.usage_count < Item.usage_limit,
            Item.is_waste == False
        ).all()
        
        newly_used_up = [item for item in newly_used_up if item.usage_count >= item.usage_limit]
        
        # Mark waste items
        new_waste_items = []
        for item in newly_expired + newly_used_up:
            item.is_waste = True
            new_waste_items.append(item.id)
        
        # Commit changes
        try:
            self.db.commit()
            logger.info(f"Simulated {days} days with {len(used_items)} items used")
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error during time simulation: {str(e)}")
        
        return {
            "success": True,
            "message": f"Successfully simulated {days} days",
            "days_simulated": days,
            "simulated_date": simulated_date.isoformat(),
            "items_used": used_items,
            "items_expired": [item.id for item in newly_expired],
            "items_fully_used": [item.id for item in newly_used_up],
            "new_waste_items": new_waste_items
        }

    def generate_waste_placement_plan(self, target_zone: str = "W", include_all_waste: bool = True) -> Dict[str, Any]:
        """
        Generate a plan for placing waste items in waste containers.
        
        Args:
            target_zone: The zone where waste containers are located
            include_all_waste: If True, include waste items already placed in other containers
            
        Returns:
            Dictionary with placement plan details
        """
        # Get all waste items based on the flag
        if include_all_waste:
            # Get ALL waste items, including those already placed
            waste_items_unplaced = self.db.query(Item).filter(
                Item.is_waste == True,
                Item.is_placed == False
            ).all()
            
            # Get placed waste items that are not in waste containers
            waste_items_misplaced = self.db.query(Item).filter(
                Item.is_waste == True,
                Item.is_placed == True,
                ~Item.container_id.like("WST%")  # Not in waste containers 
            ).all()
            
            waste_items = waste_items_unplaced + waste_items_misplaced
            
            logger.info(f"Including ALL waste items: {len(waste_items_unplaced)} unplaced, {len(waste_items_misplaced)} misplaced")
        else:
            # Just get unplaced waste items (original behavior)
            waste_items = self.db.query(Item).filter(
                Item.is_waste == True,
                Item.is_placed == False
            ).all()
        
        if not waste_items:
            return {
                "success": True,
                "message": "No waste items found that need placement",
                "placed_count": 0,
                "unplaced_count": 0,
                "waste_containers": [],
                "placement_plan": []
            }
        
        # Log found waste items
        logger.info(f"Found {len(waste_items)} waste items to place in target zone {target_zone}")
        
        # Get waste containers using multiple methods to ensure compatibility
        waste_containers_from_type = self.db.query(Container).filter(
            Container.container_type.ilike("%waste%")
        ).all()
        
        waste_containers_from_zone_W = self.db.query(Container).filter(
            Container.zone == target_zone
        ).all()
        
        waste_containers_from_zone_Waste = self.db.query(Container).filter(
            Container.zone == "Waste"
        ).all()
        
        waste_containers_from_id = self.db.query(Container).filter(
            Container.id.like("WST%")
        ).all()
        
        # Combine all waste containers, removing duplicates
        all_container_ids = set()
        waste_containers = []
        
        for container_list in [waste_containers_from_type, waste_containers_from_zone_W, 
                              waste_containers_from_zone_Waste, waste_containers_from_id]:
            for container in container_list:
                if container.id not in all_container_ids:
                    waste_containers.append(container)
                    all_container_ids.add(container.id)
        
        if not waste_containers:
            return {
                "success": False,
                "message": f"No waste containers found in zones {target_zone}/Waste or with IDs starting with WST",
                "placed_count": 0,
                "unplaced_count": len(waste_items),
                "waste_containers": [],
                "placement_plan": []
            }
        
        # Log the waste containers found
        logger.info(f"Found {len(waste_containers)} waste containers: {[c.id for c in waste_containers]}")
        
        # Sort waste items by volume efficiency
        sorted_items = sorted(waste_items, key=lambda i: self._calculate_volume_efficiency(i))
        
        # Track container utilization
        container_utilization = {container.id: 0 for container in waste_containers}
        placement_plan = []
        
        # Try to place each waste item
        for item in sorted_items:
            placed = False
            
            # Try each waste container
            for container in waste_containers:
                # Skip if container is at capacity
                if container_utilization[container.id] >= container.capacity:
                    continue
                
                # Try to find a position for the item
                position, orientation = self._find_position_with_rotation(
                    container,
                    item,
                    [i for i in container.items if i.is_placed],
                    prioritize_access=False  # For waste, we don't need to prioritize access
                )
                
                if position:
                    # Add to placement plan
                    placement_plan.append({
                        "item_id": item.id,
                        "item_name": item.name,
                        "container_id": container.id,
                        "position": {
                            "x": position[0],
                            "y": position[1],
                            "z": position[2]
                        },
                        "orientation": orientation if orientation else (item.width, item.height, item.depth)
                    })
                    
                    container_utilization[container.id] += 1
                    placed = True
                    break
            
            if not placed:
                # Item couldn't be placed in any container
                placement_plan.append({
                    "item_id": item.id,
                    "item_name": item.name,
                    "container_id": None,
                    "position": None,
                    "orientation": None,
                    "error": "No suitable container found"
                })
        
        # Count placed and unplaced items
        placed_count = sum(1 for p in placement_plan if p["container_id"] is not None)
        unplaced_count = len(placement_plan) - placed_count
        
        # Log information about the waste containers and placement plan
        logger.info(f"Waste placement plan generated for zone {target_zone}:")
        logger.info(f"- Found {len(waste_containers)} waste containers: {[c.id for c in waste_containers]}")
        logger.info(f"- Successfully placed {placed_count} items in waste containers")
        logger.info(f"- Unable to place {unplaced_count} waste items")
        
        return {
            "success": True,
            "message": f"Generated waste placement plan: {placed_count} items can be placed, {unplaced_count} items unplaced",
            "placed_count": placed_count,
            "unplaced_count": unplaced_count,
            "waste_containers": [c.id for c in waste_containers],
            "placement_plan": placement_plan
        }

    def generate_undocking_plan(self, max_weight: float) -> Dict[str, Any]:
        """
        Generate a plan for items to be undocked from waste containers,
        respecting a maximum weight limit.
        
        Args:
            max_weight: The maximum total weight allowed for undocking.
            
        Returns:
            Dictionary containing the plan (list of items) and total weight.
        """
        try:
            # Find containers in the designated waste zone ('Waste')
            waste_containers = self.db.query(Container).filter(Container.zone == 'Waste').all()
            if not waste_containers:
                return {"success": True, "message": "No containers found in waste zone 'Waste'", "items_in_plan": [], "total_weight": 0.0}
            
            waste_container_ids = [c.id for c in waste_containers]
            
            # Find all items currently located in these waste containers
            items_in_waste = self.db.query(Item).filter(
                Item.container_id.in_(waste_container_ids),
                Item.is_placed == True
            ).order_by(Item.priority.desc(), Item.weight.desc()).all() # Prioritize heavier, higher-priority items first if needed
            
            if not items_in_waste:
                return {"success": True, "message": "No items found in waste containers", "items_in_plan": [], "total_weight": 0.0}
                
            # Select items for the plan based on max_weight
            undocking_plan_items = []
            current_weight = 0.0
            
            for item in items_in_waste:
                if current_weight + item.weight <= max_weight:
                    undocking_plan_items.append({
                        "item_id": item.id,
                        "item_name": item.name,
                        "weight": item.weight,
                        "source_container_id": item.container_id
                    })
                    current_weight += item.weight
                # else: # Optional: break early if you want exactly <= max_weight
                #     break 
                    
            return {
                "success": True,
                "message": f"Generated undocking plan with {len(undocking_plan_items)} items.",
                "items_in_plan": undocking_plan_items,
                "total_weight": current_weight,
                "max_weight_limit": max_weight
            }

        except Exception as e:
            logger.error(f"Error generating undocking plan: {str(e)}")
            # Return an error structure consistent with other responses
            return {
                "success": False,
                "message": f"Error generating undocking plan: {str(e)}",
                "items_in_plan": [],
                "total_weight": 0.0
            } 