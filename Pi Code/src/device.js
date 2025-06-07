import React, { useState, useEffect } from 'react';
import { Thermometer, Droplets, Wind, Activity, Power, Settings, Zap, TrendingUp, Menu, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const Device = () => {
  const [sensorData, setSensorData] = useState({
    temperature: 78.0,
    humidity: 44.0,
    pm_levels: 0.5,
    voc_levels: 100.0,
    timestamp: new Date().toISOString()
  });

  const [controlStatus, setControlStatus] = useState({
    dehumidifier_enabled: false,
    auto_mode: true,
    target_humidity: 45.0,
    hysteresis: 3.0,
    auto_control_active: false,
    last_command: 'NONE'
  });

  const [history, setHistory] = useState([]);
  const [extendedHistory, setExtendedHistory] = useState([]);
  const [connected, setConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedChart, setSelectedChart] = useState('humidity');
  const [tempTarget, setTempTarget] = useState(45.0);
  const [tempHysteresis, setTempHysteresis] = useState(3.0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetchData();
    fetchControlStatus();
    fetchHistory();

    const ws = new WebSocket(`ws://${window.location.host}/ws`);
    
    ws.onopen = () => {
      setConnected(true);
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'sensor_data') {
        setSensorData(message.data);
        
        const newDataPoint = {
          time: new Date().toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          timestamp: message.data.timestamp,
          temperature: message.data.temperature || 0,
          humidity: message.data.humidity || 0,
          pm_levels: message.data.pm_levels || 0,
          voc_levels: message.data.voc_levels || 0,
          index: extendedHistory.length
        };
        
        setExtendedHistory(prev => {
          const updated = [...prev, newDataPoint];
          return updated.slice(-600);
        });
      } else if (message.type === 'control_update') {
        setControlStatus(message.data);
        console.log('Control update:', message.reason);
      } else if (message.type === 'initial_data') {
        setSensorData(message.sensor_data);
        setControlStatus(message.control_status);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('WebSocket disconnected');
    };

    return () => ws.close();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch('/api/data');
      const data = await response.json();
      setSensorData(data);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const fetchControlStatus = async () => {
    try {
      const response = await fetch('/api/control/status');
      const data = await response.json();
      setControlStatus(data);
      setTempTarget(data.target_humidity);
      setTempHysteresis(data.hysteresis);
    } catch (error) {
      console.error('Error fetching control status:', error);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/history?limit=600');
      const data = await response.json();
      const historyData = data.history || [];
      
      const processedData = historyData.map((entry, index) => ({
        time: new Date(entry.timestamp).toLocaleTimeString('en-US', { 
          hour12: false, 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        timestamp: entry.timestamp,
        temperature: entry.T || 0,
        humidity: entry.H || 0,
        pm_levels: entry.P || 0,
        voc_levels: entry.V || 0,
        index: index
      }));
      
      setHistory(historyData);
      setExtendedHistory(processedData);
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  };

  const toggleDehumidifier = async () => {
    try {
      const response = await fetch('/api/control/toggle', { method: 'POST' });
      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else {
        setControlStatus(data);
      }
    } catch (error) {
      console.error('Error toggling dehumidifier:', error);
    }
  };

  const toggleAutoMode = async () => {
    try {
      const response = await fetch('/api/control/auto', { method: 'POST' });
      const data = await response.json();
      setControlStatus(data);
    } catch (error) {
      console.error('Error toggling auto mode:', error);
    }
  };

  const updateTarget = async () => {
    console.log(JSON.stringify({
          target: tempTarget,
          hysteresis: tempHysteresis
        }))
    
    try {
      const response = await fetch('/api/control/target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: tempTarget,
          hysteresis: tempHysteresis
        })
      });
      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else {
        setControlStatus(data);
        setShowSettings(false);
      }
    } catch (error) {
      console.error('Error updating target:', error);
    }
  };

  const getHumidityStatus = () => {
    const current = sensorData.humidity;
    const target = controlStatus.target_humidity;
    const hysteresis = controlStatus.hysteresis;
    
    if (current > target + hysteresis) {
      return { status: 'high', color: 'text-red-500', message: 'Above target + hysteresis' };
    } else if (current <= target) {
      return { status: 'good', color: 'text-green-500', message: 'At or below target' };
    } else {
      return { status: 'zone', color: 'text-yellow-500', message: 'In hysteresis zone' };
    }
  };

  const humidityStatus = getHumidityStatus();

  const chartConfigs = {
    humidity: {
      title: 'Humidity Levels',
      dataKey: 'humidity',
      color: '#3B82F6',
      unit: '%',
      icon: Droplets,
      showTarget: true,
      targetValue: controlStatus.target_humidity,
      hysteresisValue: controlStatus.hysteresis
    },
    temperature: {
      title: 'Temperature',
      dataKey: 'temperature',
      color: '#F97316',
      unit: '°F',
      icon: Thermometer,
      showTarget: false
    },
    pm_levels: {
      title: 'PM Levels',
      dataKey: 'pm_levels',
      color: '#8B5CF6',
      unit: ' μg/m\u00B3',
      icon: Wind,
      showTarget: false
    },
    voc_levels: {
      title: 'VOC Levels',
      dataKey: 'voc_levels',
      color: '#06B6D4',
      unit: '',
      icon: Activity,
      showTarget: false
    }
  };

  const currentChart = chartConfigs[selectedChart];

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-800 border border-white/20 rounded-lg p-3 shadow-xl">
          <p className="text-gray-300 text-sm mb-2">{`Time: ${label}`}</p>
          <p className="text-white font-semibold">
            {`${currentChart.title}: ${payload[0].value.toFixed(2)}${currentChart.unit}`}
          </p>
          {currentChart.showTarget && (
            <div className="mt-2 pt-2 border-t border-white/10 text-xs text-gray-400">
              <p>Target: {currentChart.targetValue}%</p>
              <p>Range: {currentChart.targetValue - currentChart.hysteresisValue}% - {currentChart.targetValue + currentChart.hysteresisValue}%</p>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            IoT Hub Dashboard
          </h1>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="hidden sm:inline">{connected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Current Readings */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <Thermometer className="text-orange-400" size={24} />
              <h3 className="text-lg font-semibold">Temperature</h3>
            </div>
            <p className="text-3xl font-bold text-orange-400">{sensorData.temperature.toFixed(1)}°F</p>
            <p className="text-sm text-gray-400 mt-1">Real-time reading</p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <Droplets className={`${humidityStatus.color}`} size={24} />
              <h3 className="text-lg font-semibold">Humidity</h3>
            </div>
            <p className={`text-3xl font-bold ${humidityStatus.color}`}>{sensorData.humidity.toFixed(1)}%</p>
            <p className={`text-sm mt-1 ${humidityStatus.color}`}>{humidityStatus.message}</p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <Wind className="text-purple-400" size={24} />
              <h3 className="text-lg font-semibold">PM Levels</h3>
            </div>
            <p className="text-3xl font-bold text-purple-400">{sensorData.pm_levels.toFixed(2)} μg/m<sup>3</sup></p>
            <p className="text-sm text-gray-400 mt-1">Particulate matter</p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <Activity className="text-cyan-400" size={24} />
              <h3 className="text-lg font-semibold">VOC Index</h3>
            </div>
            <p className="text-3xl font-bold text-cyan-400">{sensorData.voc_levels.toFixed(0)}</p>
            <p className="text-sm text-gray-400 mt-1">Compared to a Baseline (100)</p>
          </div>
        </div>

        {/* Control Panel */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20">
          <div className="flex items-center gap-3 mb-6">
            <Power className="text-blue-400" size={28} />
            <h2 className="text-2xl font-bold">Dehumidifier Control</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Status Display */}
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl">
                <span className="text-gray-300">Device Status</span>
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                  controlStatus.dehumidifier_enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${
                    controlStatus.dehumidifier_enabled ? 'bg-green-400' : 'bg-gray-400'
                  }`} />
                  {controlStatus.dehumidifier_enabled ? 'ON' : 'OFF'}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl">
                <span className="text-gray-300">Control Mode</span>
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                  controlStatus.auto_mode ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                }`}>
                  <Zap size={16} />
                  {controlStatus.auto_mode ? 'AUTO' : 'MANUAL'}
                </div>
              </div>

              {controlStatus.auto_mode && (
                <div className="p-4 bg-black/20 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-300">Target Humidity</span>
                    <span className="text-lg font-bold text-blue-400">{controlStatus.target_humidity}%</span>
                  </div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-gray-300">Hysteresis</span>
                    <span className="text-sm text-gray-400">±{controlStatus.hysteresis}%</span>
                  </div>
                  <div className="bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div className="relative h-full bg-gradient-to-r from-green-500 to-blue-500 rounded-full transition-all duration-500"
                         style={{width: `${Math.min(100, (sensorData.humidity / 80) * 100)}%`}}>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-2">
                    <span>0%</span>
                    <span className="text-blue-400">Target: {controlStatus.target_humidity}%</span>
                    <span>80%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="space-y-4">
              <button
                onClick={toggleAutoMode}
                className={`w-full p-4 rounded-xl font-semibold transition-all transform hover:scale-[1.02] ${
                  controlStatus.auto_mode 
                    ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
                    : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                }`}
              >
                {controlStatus.auto_mode ? 'Disable Auto Mode' : 'Enable Auto Mode'}
              </button>

              <button
                onClick={toggleDehumidifier}
                disabled={controlStatus.auto_mode}
                className={`w-full p-4 rounded-xl font-semibold transition-all transform hover:scale-[1.02] ${
                  controlStatus.auto_mode 
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                    : controlStatus.dehumidifier_enabled
                      ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25'
                      : 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/25'
                }`}
              >
                {controlStatus.auto_mode 
                  ? 'Manual Control Disabled' 
                  : controlStatus.dehumidifier_enabled 
                    ? 'Turn OFF' 
                    : 'Turn ON'
                }
              </button>

              {controlStatus.auto_control_active && (
                <div className="p-3 bg-blue-500/20 border border-blue-500/30 rounded-xl">
                  <p className="text-sm text-blue-300 flex items-center gap-2">
                    <Zap size={16} />
                    Auto control is actively managing humidity
                  </p>
                </div>
              )}

              <div className="text-xs text-gray-400 p-3 bg-black/10 rounded-xl">
                <p>Last updated: {new Date(sensorData.timestamp).toLocaleTimeString()}</p>
                <p>Last command: {controlStatus.last_command}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="text-green-400" size={28} />
              <h2 className="text-2xl font-bold">Historical Trends</h2>
            </div>
            
            {/* Chart Selector */}
            <div className="flex bg-black/20 rounded-xl p-1 overflow-x-auto w-full sm:w-auto">
              {Object.entries(chartConfigs).map(([key, config]) => {
                const IconComponent = config.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedChart(key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
                      selectedChart === key 
                        ? 'bg-white/20 text-white' 
                        : 'text-gray-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <IconComponent size={16} />
                    <span className="text-sm">{config.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chart Display */}
          <div className="h-80 w-full">
            {extendedHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={extendedHistory} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                  <XAxis 
                    dataKey="time" 
                    stroke="#9CA3AF"
                    fontSize={12}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    stroke="#9CA3AF"
                    fontSize={12}
                    domain={['dataMin - 5', 'dataMax + 5']}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  
                  {/* Reference lines for humidity chart */}
                  {currentChart.showTarget && (
                    <>
                      <ReferenceLine 
                        y={currentChart.targetValue} 
                        stroke="#10B981" 
                        strokeDasharray="5 5"
                        strokeWidth={2}
                        label={{ value: `Target: ${currentChart.targetValue}%`, position: "topRight" }}
                      />
                      <ReferenceLine 
                        y={currentChart.targetValue + currentChart.hysteresisValue} 
                        stroke="#F59E0B" 
                        strokeDasharray="3 3"
                        strokeWidth={1}
                        label={{ value: `On: ${currentChart.targetValue + currentChart.hysteresisValue}%`, position: "topRight" }}
                      />
                      <ReferenceLine 
                        y={currentChart.targetValue - currentChart.hysteresisValue} 
                        stroke="#F59E0B" 
                        strokeDasharray="3 3"
                        strokeWidth={1}
                        label={{ value: `Off: ${currentChart.targetValue - currentChart.hysteresisValue}%`, position: "topRight" }}
                      />
                    </>
                  )}
                  
                  <Line 
                    type="monotone" 
                    dataKey={currentChart.dataKey} 
                    stroke={currentChart.color}
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6, fill: currentChart.color }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <TrendingUp size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No historical data available yet</p>
                  <p className="text-sm">Data will appear as sensors collect readings</p>
                </div>
              </div>
            )}
          </div>

          {/* Chart Stats */}
          {extendedHistory.length > 0 && (
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              {(() => {
                const values = extendedHistory.map(d => d[currentChart.dataKey]).filter(v => v != null);
                const min = Math.min(...values);
                const max = Math.max(...values);
                const avg = values.reduce((a, b) => a + b, 0) / values.length;
                const latest = values[values.length - 1];

                return [
                  { label: 'Current', value: latest, color: 'text-blue-400' },
                  { label: 'Average', value: avg, color: 'text-green-400' },
                  { label: 'Minimum', value: min, color: 'text-cyan-400' },
                  { label: 'Maximum', value: max, color: 'text-orange-400' }
                ].map((stat, index) => (
                  <div key={index} className="bg-black/20 rounded-xl p-4 hover:bg-black/30 transition-colors">
                    <p className="text-gray-400 text-sm">{stat.label}</p>
                    <p className={`text-lg font-bold ${stat.color}`}>
                      {stat.value.toFixed(1)}{currentChart.unit}
                    </p>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-2xl p-8 w-full max-w-md border border-white/20">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Humidity Control Settings</h3>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Target Humidity (%)</label>
                  <input
                    type="number"
                    min="20"
                    max="80"
                    value={tempTarget}
                    onChange={(e) => setTempTarget(parseFloat(e.target.value) || 45)}
                    className="w-full p-3 bg-black/20 border border-white/20 rounded-xl text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Hysteresis (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    value={tempHysteresis}
                    onChange={(e) => setTempHysteresis(parseFloat(e.target.value) || 3)}
                    className="w-full p-3 bg-black/20 border border-white/20 rounded-xl text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Dehumidifier turns ON at {tempTarget + tempHysteresis}%, OFF at {tempTarget}%
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={updateTarget}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-xl font-semibold transition-colors"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white p-3 rounded-xl font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Device;