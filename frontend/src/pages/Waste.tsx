import { useState, useEffect } from 'react';
import { 
  identifyWaste, 
  generateWasteReturnPlan, 
  executeWastePlacementPlan,
  getContainers, 
  WasteItem, 
  WasteReturnPlan,
  WastePlacementExecutionResult,
  completeWasteUndocking,
  generateUndockingPlan,
  downloadUndockingManifest
} from '../frontend-api';
import { Loader, AlertTriangle, CheckCircle2, Trash2, Truck, FileDown } from 'lucide-react';
import toast from 'react-hot-toast';

// Define UndockingPlanResult interface if not already defined globally or imported
interface UndockingPlanResult {
  success: boolean;
  message?: string;
  items_in_plan: Array<{
    item_id: string;
    item_name: string;
    weight: number;
    source_container_id: string;
  }>;
  total_weight: number;
  weight_limit: number;
}

const Waste = () => {
  const [wasteItems, setWasteItems] = useState<WasteItem[]>([]);
  const [returnPlan, setReturnPlan] = useState<WasteReturnPlan | null>(null);
  const [executionResult, setExecutionResult] = useState<WastePlacementExecutionResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [undockingMaxWeight, setUndockingMaxWeight] = useState<number | string>('');
  const [undockingPlan, setUndockingPlan] = useState<UndockingPlanResult | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [undockingError, setUndockingError] = useState<string | null>(null);

  // Identify waste items when component mounts
  useEffect(() => {
    console.log("Waste component mounted, fetching data...");
    fetchWasteItems();
  }, []);

  const fetchWasteItems = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await identifyWaste();
      console.log("Waste items response:", response);
      setWasteItems(response.waste_items || []);
    } catch (err) {
      setError('Failed to identify waste items');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const generatePlan = async () => {
    setIsLoading(true);
    setError(null);
    setExecutionResult(null);
    try {
      // Always use 'Waste' zone
      const plan = await generateWasteReturnPlan('Waste');
      
      // To ensure the plan includes item 000038 and other placed waste items
      if (plan && plan.placement_plan) {
        // Take any additional action here if needed, such as notifying the user
        console.log(`Generated waste return plan with ${plan.placement_plan.length} items`);
      } else {
        console.warn('Return plan was generated but has no items');
      }
      
      setReturnPlan(plan);
    } catch (err) {
      setError('Failed to generate waste return plan');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const executePlan = async () => {
    if (!returnPlan) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const result = await executeWastePlacementPlan(returnPlan);
      setExecutionResult(result);
      
      // If the execution was successful, refresh the waste items list
      if (result.success) {
        await fetchWasteItems();
      }
    } catch (err) {
      setError('Failed to execute waste placement plan');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // --- New Undocking Functions ---
  const handleGenerateUndockingPlan = async () => {
    const weight = Number(undockingMaxWeight);
    if (isNaN(weight) || weight <= 0) {
      toast.error('Please enter a valid positive number for the maximum weight limit.');
      return;
    }
    
    setGeneratingPlan(true);
    setUndockingError(null);
    setUndockingPlan(null); // Clear previous plan
    toast.loading('Generating undocking plan...', { id: 'undocking-plan' });

    try {
      const result = await generateUndockingPlan(weight);
      if (result.success) {
        setUndockingPlan(result);
        toast.success(`Undocking plan generated: ${result.items_in_plan.length} items, ${result.total_weight.toFixed(2)}kg total.`, { id: 'undocking-plan' });
      } else {
        setUndockingError(result.message || 'Failed to generate undocking plan.');
        toast.error(result.message || 'Failed to generate undocking plan.', { id: 'undocking-plan' });
      }
    } catch (error: any) {
      setUndockingError(error.message || 'An unknown error occurred.');
      toast.error(`Error: ${error.message || 'Unknown error'}`, { id: 'undocking-plan' });
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleDownloadManifest = () => {
    const weight = Number(undockingMaxWeight);
    if (isNaN(weight) || weight <= 0 || !undockingPlan || undockingPlan.items_in_plan.length === 0) {
      toast.error('Please generate a valid plan with a weight limit first.');
      return;
    }
    // Use the API function which handles the download via window.open
    downloadUndockingManifest(weight);
    toast.success('Manifest download initiated...');
  };
  // --- End New Undocking Functions ---

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 border-b border-green-500/20 pb-2">
        <h1 className="text-2xl font-mono font-bold text-green-500">WASTE_MANAGEMENT</h1>
        <p className="text-gray-500 text-xs">Identify and dispose of expired items</p>
      </div>
      
      <div className="mb-8 bg-gray-900/40 border border-green-500/20 p-6 rounded-lg shadow-lg">
        <div className="flex items-center mb-4">
          <div className="w-2 h-2 bg-green-500 mr-2"></div>
          <h2 className="text-lg font-mono font-semibold text-green-400">IDENTIFY_WASTE</h2>
        </div>
        
        <button 
          onClick={fetchWasteItems}
          className="bg-black/40 hover:bg-black/60 border border-green-500/30 text-green-400 px-4 py-2 rounded-md transition duration-200 ease-in-out transform hover:scale-105 mr-2 font-mono text-sm"
          disabled={isLoading}
        >
          {isLoading ? 'SCANNING...' : 'SCAN FOR WASTE'}
        </button>
        
        {wasteItems.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-sm font-mono font-medium mb-2 text-green-300">FOUND {wasteItems.length} WASTE ITEMS:</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full bg-black/25 border border-green-500/10">
                <thead>
                  <tr className="bg-green-900/10">
                    <th className="border border-green-500/10 px-4 py-2 text-left text-green-400 font-mono text-xs">ITEM_ID</th>
                    <th className="border border-green-500/10 px-4 py-2 text-left text-green-400 font-mono text-xs">NAME</th>
                    <th className="border border-green-500/10 px-4 py-2 text-left text-green-400 font-mono text-xs">REASON</th>
                  </tr>
                </thead>
                <tbody>
                  {wasteItems.map((item, index) => (
                    <tr key={index} className="border-b border-green-500/10 hover:bg-green-900/5">
                      <td className="border border-green-500/10 px-4 py-2 font-mono text-green-300 text-xs">{item.id}</td>
                      <td className="border border-green-500/10 px-4 py-2 text-gray-400 text-xs">{item.name}</td>
                      <td className="border border-green-500/10 px-4 py-2 text-red-400 text-xs">{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : !isLoading && (
          <p className="mt-4 text-gray-500 font-mono text-xs">NO_WASTE_DETECTED</p>
        )}
      </div>
      
      <div className="bg-gray-900/40 border border-green-500/20 p-6 rounded-lg shadow-lg">
        <div className="flex items-center mb-4">
          <div className="w-2 h-2 bg-green-500 mr-2"></div>
          <h2 className="text-lg font-mono font-semibold text-green-400">WASTE_RETURN_PLAN</h2>
        </div>
        
        <div className="flex space-x-3">
          <button 
            onClick={generatePlan}
            className="bg-black/40 hover:bg-black/60 border border-green-500/30 text-green-400 px-4 py-2 rounded-md transition duration-200 ease-in-out transform hover:scale-105 font-mono text-sm"
            disabled={isLoading || wasteItems.length === 0}
            title={wasteItems.length === 0 ? "Scan for waste items first" : "Generate plan to move waste to Waste zone"}
          >
            {isLoading ? 'GENERATING...' : 'GENERATE_RETURN_PLAN'}
          </button>
          
          {returnPlan && !executionResult && (
            <button 
              onClick={executePlan}
              className="bg-black/40 hover:bg-black/60 border border-green-500/30 text-green-400 px-4 py-2 rounded-md transition duration-200 ease-in-out transform hover:scale-105 font-mono text-sm"
              disabled={isLoading}
              title="Execute the generated waste movement plan"
            >
              {isLoading ? 'EXECUTING...' : 'EXECUTE_PLAN'}
            </button>
          )}
        </div>
        
        {returnPlan && (
          <div className="mt-6 bg-black/40 p-4 rounded border border-green-500/10">
            <h3 className="text-sm font-mono font-medium mb-2 text-green-400">{returnPlan.message}</h3>
            
            {executionResult && (
              <div className={`p-3 mb-4 rounded border ${executionResult.success ? 'bg-green-900/10 border-green-500/20 text-green-400' : 'bg-red-900/10 border-red-500/20 text-red-400'} font-mono text-xs`}>
                <div className="flex items-center">
                  <div className={`w-2 h-2 ${executionResult.success ? 'bg-green-500' : 'bg-red-500'} mr-2`}></div>
                  <span className="font-bold">EXECUTION_STATUS:</span>
                </div>
                <p className="mt-1">{executionResult.message}</p>
                {executionResult.success && (
                  <p className="mt-1">Successfully placed {executionResult.items_placed} items</p>
                )}
              </div>
            )}
            
            <p className="text-gray-400 mb-1 text-xs">
              <span className="text-green-400 font-mono">PLACED:</span> {returnPlan.placed_count}
              <span className="mx-2">|</span>
              <span className="text-green-400 font-mono">UNPLACED:</span> {returnPlan.unplaced_count}
            </p>
            
            <h4 className="font-mono text-green-400 mt-4 mb-2 text-xs">WASTE_CONTAINERS:</h4>
            <div className="flex flex-wrap gap-2 mb-4">
              {returnPlan.waste_containers.map((container, index) => (
                <span key={index} className="bg-green-900/10 text-green-300 px-3 py-1 rounded-md border border-green-500/20 font-mono text-xs">
                  {container}
                </span>
              ))}
            </div>
            
            <h4 className="font-mono text-green-400 mt-4 mb-2 text-xs">PLACEMENT_PLAN:</h4>
            {returnPlan.placement_plan.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-black/25 border border-green-500/10">
                  <thead>
                    <tr className="bg-green-900/10">
                      <th className="border border-green-500/10 px-4 py-2 text-left text-green-400 font-mono text-xs">ITEM</th>
                      <th className="border border-green-500/10 px-4 py-2 text-left text-green-400 font-mono text-xs">CONTAINER</th>
                      <th className="border border-green-500/10 px-4 py-2 text-left text-green-400 font-mono text-xs">POSITION</th>
                      <th className="border border-green-500/10 px-4 py-2 text-left text-green-400 font-mono text-xs">STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnPlan.placement_plan.map((item, index) => (
                      <tr key={index} className="border-b border-green-500/10 hover:bg-green-900/5">
                        <td className="border border-green-500/10 px-4 py-2 text-green-300 font-mono text-xs">
                          {item.item_id} - <span className="text-gray-400">{item.item_name}</span>
                        </td>
                        <td className="border border-green-500/10 px-4 py-2 text-gray-400 font-mono text-xs">
                          {item.container_id || 'No container'}
                        </td>
                        <td className="border border-green-500/10 px-4 py-2 text-gray-400 font-mono text-xs">
                          {item.position ? (
                            `(${item.position.x.toFixed(2)}, ${item.position.y.toFixed(2)}, ${item.position.z.toFixed(2)})`
                          ) : (
                            'No position'
                          )}
                        </td>
                        <td className="border border-green-500/10 px-4 py-2 text-gray-400 font-mono text-xs">
                          {item.error ? (
                            <span className="text-red-400">{item.error}</span>
                          ) : (
                            <span className="text-green-400">Ready to place</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 font-mono text-xs">NO_ITEMS_IN_PLAN</p>
            )}
          </div>
        )}
      </div>
      
      {/* --- New Undocking Plan Section --- */}
      <div className="mt-8 bg-gray-950 border border-green-800/30 rounded-md p-6">
        <h3 className="text-lg font-semibold text-green-400 mb-4 border-b border-green-700/30 pb-2">Undocking Preparation</h3>
        
        <div className="mb-4">
          <label htmlFor="maxWeight" className="block text-sm font-medium text-gray-400 mb-1">Maximum Undocking Weight (kg):</label>
          <input 
            type="number"
            id="maxWeight"
            value={undockingMaxWeight}
            onChange={(e) => setUndockingMaxWeight(e.target.value)}
            placeholder="e.g., 100" 
            className="w-full px-3 py-2 rounded-md bg-black/30 border border-green-700/40 text-green-300 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 disabled:opacity-50"
            disabled={generatingPlan}
            min="0"
          />
        </div>

        <button
          onClick={handleGenerateUndockingPlan}
          disabled={generatingPlan || !undockingMaxWeight}
          className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-blue-900/40 text-blue-300 hover:bg-blue-900/60 border border-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed mr-4"
        >
          {generatingPlan ? (
            <>
              <Loader className="h-4 w-4 mr-2 animate-spin" /> Generating Plan...
            </>
          ) : (
            <>
              🚀 Generate Undocking Plan
            </>
          )}
        </button>

        {undockingError && (
          <div className="mt-4 p-3 bg-red-900/10 text-red-400 rounded border border-red-500/20 text-sm">
            Error: {undockingError}
          </div>
        )}

        {undockingPlan && (
          <div className="mt-6">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-md font-semibold text-green-300">Generated Plan ({undockingPlan.items_in_plan.length} items, {undockingPlan.total_weight.toFixed(2)}kg / {Number(undockingMaxWeight).toFixed(2)}kg limit)</h4>
              <button
                onClick={handleDownloadManifest}
                disabled={!undockingPlan || undockingPlan.items_in_plan.length === 0}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium bg-green-900/40 text-green-300 hover:bg-green-900/60 border border-green-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <FileDown className="h-4 w-4 mr-2" /> Download Manifest (CSV)
              </button>
            </div>
            
            {undockingPlan.items_in_plan.length > 0 ? (
              <div className="bg-black/30 rounded-md border border-green-700/20 overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-green-900/20 text-xs text-green-500 uppercase tracking-wider">
                    <tr>
                      <th scope="col" className="px-4 py-2">Item ID</th>
                      <th scope="col" className="px-4 py-2">Name</th>
                      <th scope="col" className="px-4 py-2">Weight (kg)</th>
                      <th scope="col" className="px-4 py-2">Source Container</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-green-900/30">
                    {undockingPlan.items_in_plan.map((item) => (
                      <tr key={item.item_id} className="hover:bg-green-900/5">
                        <td className="px-4 py-2 font-medium text-green-300 whitespace-nowrap">{item.item_id}</td>
                        <td className="px-4 py-2 text-gray-300 truncate max-w-xs">{item.item_name}</td>
                        <td className="px-4 py-2 text-gray-300">{item.weight.toFixed(2)}</td>
                        <td className="px-4 py-2 text-gray-400">{item.source_container_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic mt-4">No items selected for undocking based on the current weight limit and items in Zone 'W'.</p>
            )}
          </div>
        )}
      </div>
      {/* --- End New Undocking Plan Section --- */}

      {error && (
        <div className="mt-4 p-3 bg-red-900/10 text-red-400 rounded border border-red-500/20 font-mono text-xs">
          ERROR: {error}
        </div>
      )}
    </div>
  );
};

export default Waste; 