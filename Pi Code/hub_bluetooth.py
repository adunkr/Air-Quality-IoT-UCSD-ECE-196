from multiprocessing import Process
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import json
import asyncio
import threading
import time
from typing import List
from datetime import datetime

'''
import mysql.connector as mysql
import os
from dotenv import load_dotenv

load_dotenv("credentials.env")
db_host = os.environ['MYSQL_HOST']
db_user = os.environ['MYSQL_USER']
db_pass = os.environ['MYSQL_PASSWORD']
db_base = os.environ['MYSQL_DATABASE']
'''

SENSOR_NAME = "SensorDevice"
SENSOR_CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"
ACTUATOR_NAME = "Dehumidify"
ACTUATOR_CHAR_UUID = "a16beeb4-bf06-4c17-9cec-fbc82db1a016"

latest_data = {
    "temperature": 0,
    "humidity": 0,
    "pm_levels": 0,
    "voc_levels": 0,
    "timestamp": datetime.now().isoformat(),
    "history": []
}

control_status = {
    "dehumidifier_enabled": False,
    "auto_mode": True,
    "target_humidity": 100,
    "hysteresis": 3.0,
    "last_command": "NONE",
    "success": True,
    "auto_control_active": False
}

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                self.active_connections.remove(connection)

manager = ConnectionManager()

try:
    from bleak import BleakClient, BleakScanner

    async def ble_sensor_loop():
        print("Scanning for sensor...")
        device = await BleakScanner.find_device_by_filter(lambda d, _: d.name == SENSOR_NAME)

        async with BleakClient(device) as client:
            print(f"Connected to {SENSOR_NAME}")

            def notification_handler(_, data):
                try:
                    decoded = data.decode()
                    payload = json.loads(decoded)
                    print("Sensor data:", payload)
                    
                    temperature_f = (payload.get("T", 0) * 9/5) + 32  # Convert C to F
                    latest_data["temperature"] = temperature_f
                    latest_data["humidity"] = payload.get("H", latest_data["humidity"])
                    latest_data["pm_levels"] = payload.get("P", latest_data["pm_levels"])
                    latest_data["voc_levels"] = payload.get("V", latest_data["voc_levels"])
                    latest_data["timestamp"] = datetime.now().isoformat()
                    
                    history_entry = {
                        **payload,
                        "timestamp": latest_data["timestamp"]
                    }
                    latest_data["history"].append(history_entry)
                    if len(latest_data["history"]) > 100:
                        latest_data["history"].pop(0)
                    
                    asyncio.create_task(manager.broadcast(json.dumps({
                        "type": "sensor_data",
                        "data": latest_data
                    })))
                    
                    asyncio.create_task(handle_auto_control())
                    
                except Exception as e:
                    print("Error decoding sensor data:", e)

            await client.start_notify(SENSOR_CHAR_UUID, notification_handler)
            while True:
                await asyncio.sleep(5)

    async def send_command_to_actuator(command):
        device = await BleakScanner.find_device_by_filter(
            lambda d, _: d.name == ACTUATOR_NAME
        )
        if not device:
            print("Actuator not found.")
            return False
        
        try:
            async with BleakClient(device) as client:
                await client.write_gatt_char(ACTUATOR_CHAR_UUID, command.encode())
                print(f"Sent command '{command}' to actuator.")
                return True
        except Exception as e:
            print("Failed to send command:", e)
            return False

    async def handle_auto_control():
        """Handle automatic humidity control with hysteresis"""
        if not control_status["auto_mode"]:
            return
            
        current_humidity = latest_data["humidity"]
        target = control_status["target_humidity"]
        hysteresis = control_status["hysteresis"]

        should_run = False
        
        if current_humidity > target + hysteresis:
            should_run = True
            reason = f"Humidity {current_humidity:.1f}% > {target + hysteresis:.1f}%"
        elif current_humidity <= target:
            should_run = False
            reason = f"Humidity {current_humidity:.1f}% <= {target:.1f}%"
        else:
            should_run = control_status["dehumidifier_enabled"]
            reason = f"In hysteresis zone ({target:.1f}% - {target + hysteresis:.1f}%)"
        
        if should_run != control_status["dehumidifier_enabled"]:
            command = "on" if should_run else "off"
            print(f"Auto control: {command} - {reason}")
            
            success = await send_command_to_actuator(command)
            if success:
                control_status["dehumidifier_enabled"] = should_run
                control_status["last_command"] = command.upper()
                control_status["auto_control_active"] = True
                
                status_update = {
                    "type": "control_update",
                    "data": control_status,
                    "reason": reason
                }
                await manager.broadcast(json.dumps(status_update))

    def start_ble_thread():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(ble_sensor_loop())

except ImportError:
    print("BLE functionality disabled. Using simulated data.")

app = FastAPI(title="IoT Hub Dashboard", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="build/static"), name="static")

@app.get("/api/data")
async def get_current_data():
    """Get current sensor readings"""
    return {
        "temperature": round(latest_data["temperature"], 1),
        "humidity": round(latest_data["humidity"], 1),
        "pm_levels": round(latest_data["pm_levels"], 2),
        "voc_levels": round(latest_data["voc_levels"], 0),
        "timestamp": latest_data["timestamp"]
    }

@app.get("/api/history")
async def get_history_data(limit: int = 20):
    """Get historical sensor data"""
    recent_history = latest_data["history"][-limit:]
    return {
        "history": recent_history,
        "count": len(recent_history)
    }

@app.get("/api/control/status")
async def get_control_status():
    """Get dehumidifier control status"""
    return control_status

@app.post("/api/control/toggle")
async def toggle_dehumidifier():
    """Toggle dehumidifier on/off (manual override)"""
    if control_status["auto_mode"]:
        return {"error": "Cannot manually control while in auto mode", "success": False}
    
    command = "off" if control_status["dehumidifier_enabled"] else "on"
    
    success = await send_command_to_actuator(command)
        
    if success:
        control_status["dehumidifier_enabled"] = not control_status["dehumidifier_enabled"]
        control_status["last_command"] = command.upper()
        control_status["success"] = True
        control_status["auto_control_active"] = False
    else:
        control_status["success"] = False
    
    return control_status

@app.post("/api/control/auto")
async def toggle_auto_mode():
    """Toggle automatic humidity control"""
    control_status["auto_mode"] = not control_status["auto_mode"]
    
    if control_status["auto_mode"]:
        await handle_auto_control()
    else:
        success = await send_command_to_actuator("off")
        if success:
            control_status["dehumidifier_enabled"] = False
            control_status["last_command"] = "OFF"
            control_status["auto_control_active"] = False
        
    return control_status

@app.post("/api/control/target")
async def set_target_humidity(target: float, hysteresis: float = None):
    """Set target humidity and optional hysteresis"""
    if not 20 <= target <= 80:
        return {"error": "Target humidity must be between 20% and 80%", "success": False}
    
    control_status["target_humidity"] = target
    if hysteresis is not None:
        if not 1 <= hysteresis <= 10:
            return {"error": "Hysteresis must be between 1% and 10%", "success": False}
        control_status["hysteresis"] = hysteresis
    
    if control_status["auto_mode"]:
        await handle_auto_control()
    
    return control_status

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send initial data
        await websocket.send_text(json.dumps({
            "type": "initial_data",
            "sensor_data": latest_data,
            "control_status": control_status
        }))
        
        while True:
            # Keep connection alive by waiting for messages or timeout
            try:
                # Wait for a message with timeout
                await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                # Send a keep-alive message instead of ping
                await websocket.send_text(json.dumps({"type": "keepalive"}))
            except:
                # Connection closed
                break
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)

@app.get("/", response_class=HTMLResponse)
async def serve_react_app():
    return FileResponse('build/index.html')

@app.get("/{path:path}")
async def serve_react_routes(path: str):
    return FileResponse('build/index.html')

@app.on_event("startup")
async def startup_event():
    print("Starting IoT Hub Dashboard...")
    
    try:
        if 'start_ble_thread' in globals():
            ble_thread = threading.Thread(target=start_ble_thread)
            ble_thread.daemon = True
            ble_thread.start()
            print("BLE sensor thread started")
    except:
        print("Simulation thread started")

if __name__ == "__main__":
    print("IoT Hub Dashboard Server")
    print("Access dashboard at: http://localhost:8000")
    uvicorn.run(
        app, 
        host='0.0.0.0', 
        port=8000,
        reload=False
    )