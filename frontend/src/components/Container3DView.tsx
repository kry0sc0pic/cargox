import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Box, Text, Edges, Html, Sphere } from '@react-three/drei';
import * as THREE from 'three';

interface Item {
  id: string;
  name: string;
  width: number;
  height: number;
  depth: number;
  position?: {
    x: number;
    y: number;
    z: number;
  };
}

interface Container3DViewProps {
  containerId: string;
  containerWidth: number;
  containerHeight: number;
  containerDepth: number;
  items: Item[];
  onClose: () => void;
}

// Component to render the arrow helper, needs access to the scene
const OpenFaceArrow: React.FC<{ width: number; height: number; depth: number }> = ({ width, height, depth }) => {
  const scene = useThree(state => state.scene);

  useMemo(() => {
    const dir = new THREE.Vector3(0, 0, 1); // Pointing along positive Z
    dir.normalize();
    // Position arrow origin at the center of the +Z face
    const origin = new THREE.Vector3(width / 2, height / 2, depth);
    const length = Math.min(width, height, depth) * 0.3; // Arrow length relative to container size
    const hex = 0xffff00; // Yellow color

    const arrowHelper = new THREE.ArrowHelper(dir, origin, length, hex, length * 0.5, length * 0.3);
    scene.add(arrowHelper);

    // Cleanup function to remove the arrow when the component unmounts
    return () => {
      scene.remove(arrowHelper);
    };
  }, [scene, width, height, depth]); // Recreate arrow if dimensions change

  return null; // This component doesn't render anything directly
};

const ContainerModel: React.FC<{ width: number; height: number; depth: number; items: Item[]; containerId: string }> = ({ width, height, depth, items, containerId }) => {
  const containerCenter = { x: width / 2, y: height / 2, z: depth / 2 };
  const maxDim = Math.max(width, height, depth);
  const textScale = maxDim * 0.05; // Scale text based on container size

  return (
    <>
      {/* Container Walls */}
      <Box args={[width, height, depth]} position={[containerCenter.x, containerCenter.y, containerCenter.z]}>
        <meshStandardMaterial 
          attach="material" 
          color="#6699CC" // A slightly desaturated blue/gray
          opacity={0.25}    // Slightly adjusted opacity
          transparent={true}
          side={THREE.DoubleSide} // Render both sides for better visibility when inside
        />
        {/* Add Edges for definition */}
        <Edges
          scale={1} // Match the box size
          threshold={15} // Default edge detection threshold
          color="#336699" // A darker, less transparent blue for edges
        />
      </Box>

      {/* Items */}
      {items.map((item) => {
        if (!item.position) return null; // Don't render items without position

        // Adjust position relative to the container's corner (0,0,0)
        const itemCenterX = item.position.x + item.width / 2;
        const itemCenterY = item.position.y + item.height / 2;
        const itemCenterZ = item.position.z + item.depth / 2;

        return (
          <Box
            key={item.id}
            args={[item.width, item.height, item.depth]}
            position={[itemCenterX, itemCenterY, itemCenterZ]}
          >
            <meshStandardMaterial 
              attach="material" 
              color="#ADD8E6" // Light blue, slightly less saturated
              metalness={0.1} // Slightly metallic feel
              roughness={0.5}
            />
            {/* Optional: Add Edges to items too? */}
            {/* <Edges color="#6A90B0" /> */}
          </Box>
        );
      })}

      {/* Origin Marker (0,0,0) */}
      <Sphere args={[maxDim * 0.02, 16, 16]} position={[0, 0, 0]}>
        <meshStandardMaterial color="red" />
      </Sphere>
      <Text
        position={[maxDim * 0.03, maxDim * 0.03, 0]} // Position slightly offset from sphere
        fontSize={textScale * 0.6}
        color="white"
        anchorX="left"
        anchorY="bottom"
      >
        Origin (0,0,0)
      </Text>

      {/* Open Face Arrow (+Z assumed) */}
      <OpenFaceArrow width={width} height={height} depth={depth} />
      <Text
         position={[width / 2, height / 2, depth + maxDim * 0.2]} // Position near the arrow head
         fontSize={textScale * 0.7}
         color="yellow"
         anchorX="center"
         anchorY="middle"
       >
         Open Face
       </Text>

      {/* Axes helpers */}
      <axesHelper args={[Math.max(width, height, depth) * 1.2]} />
    </>
  );
};

const Container3DView: React.FC<Container3DViewProps> = ({
  containerId,
  containerWidth,
  containerHeight,
  containerDepth,
  items,
  onClose
}) => {
  // Calculate a suitable camera position based on container size
  const maxDim = Math.max(containerWidth, containerHeight, containerDepth);
  const cameraPosition: [number, number, number] = [
    containerWidth / 2,
    containerHeight / 2,
    maxDim * 2 // Position camera further back based on largest dimension
  ];

  return (
    <div style={{
      position: 'fixed', // Use fixed to overlay
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.8)', // Semi-transparent background
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000, // Ensure it's on top
    }}>
      <div style={{
        position: 'relative', // Needed for close button positioning
        width: '80vw',
        height: '80vh',
        maxWidth: '1000px',
        maxHeight: '700px',
        backgroundColor: '#1a1a1a', // Dark background for the canvas container
        borderRadius: '8px',
        border: '1px solid #333',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            zIndex: 1001, // Above canvas
            background: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            fontSize: '16px',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            lineHeight: '1'
          }}
          title="Close 3D View"
        >
          &times;
        </button>
        <Canvas camera={{ position: cameraPosition, fov: 50 }}>
          <ambientLight intensity={0.6} />
          <pointLight position={[containerWidth * 1.5, containerHeight * 1.5, containerDepth * 1.5]} intensity={1} />
          <ContainerModel
            containerId={containerId}
            width={containerWidth}
            height={containerHeight}
            depth={containerDepth}
            items={items}
          />
          <OrbitControls
            target={[containerWidth / 2, containerHeight / 2, containerDepth / 2]} // Target the center of the container
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
          />
          {/* Add a floor plane for context */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[containerWidth / 2, 0, containerDepth / 2]}>
            <planeGeometry args={[maxDim * 2, maxDim * 2]} />
            <meshStandardMaterial color="#333" side={THREE.DoubleSide} />
          </mesh>
        </Canvas>
      </div>
    </div>
  );
};

export default Container3DView; 