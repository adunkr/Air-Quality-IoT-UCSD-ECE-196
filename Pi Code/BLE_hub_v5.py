import asyncio
import threading
from flask import Flask, render_template_string, request
import json
import os
import signal

# === CONFIGURATION ===
SENSOR_NAME = "ESP32_SEN5x"
SENSOR_CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"
ACTUATOR_NAME = "ESP32_Dehumidifier"
ACTUATOR_CHAR_UUID = "a16beeb4-bf06-4c17-9cec-fbc82db1a016"

target_humidity = 35  # HYSTERESIS VALUE
dehumidifier_on = False

latest_data = {"T": 0.0, "H": 0.0, "P": 0.0, "history": []}
control_status = {"command": "NONE", "success": False}

app = Flask(__name__)

try:
    from bleak import BleakClient, BleakScanner

    async def ble_sensor_loop():
        print("Scanning for sensor...")
        device = await BleakScanner.find_device_by_filter(lambda d, _: d.name == SENSOR_NAME)
        if not device:
            print("Sensor not found.")
            return

        async with BleakClient(device) as client:
            print(f"Connected to {SENSOR_NAME}")

            def notification_handler(_, data):
                try:
                    decoded = data.decode()
                    payload = json.loads(decoded)
                    print("Data:", payload)
                    latest_data["T"] = payload.get("T", 0.0)
                    latest_data["H"] = payload.get("H", 0.0)
                    latest_data["P"] = payload.get("P", 0.0)
                    latest_data["history"].append(payload)
                    if len(latest_data["history"]) > 100:
                        latest_data["history"].pop(0)
                except Exception as e:
                    print("Error decoding data:", e)

            await client.start_notify(SENSOR_CHAR_UUID, notification_handler)
            while True:
                await asyncio.sleep(5)

    async def send_command_to_actuator(command):
        device = await BleakScanner.find_device_by_filter(lambda d, _: d.name == ACTUATOR_NAME)
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

    def start_ble_thread():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(ble_sensor_loop())
    
    #HYSTERESIS
    def hysteresis():
        global dehumidifier_on, target_humidity
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        async def control_logic():
            global dehumidifier_on
            while True:
                humidity = latest_data.get("H", 0.0)
                if humidity > target_humidity + 3 and not dehumidifier_on:
                    success = await send_command_to_actuator("ON")
                    if success:
                        dehumidifier_on = True
                elif humidity < target_humidity - 3 and dehumidifier_on:
                    success = await send_command_to_actuator("OFF")
                    if success:
                        dehumidifier_on = False
                await asyncio.sleep(5)

        loop.run_until_complete(control_logic())

    

    ble_thread = threading.Thread(target=start_ble_thread)
    ble_thread.daemon = True
    ble_thread.start()

    control_thread = threading.Thread(target=hysteresis)
    control_thread.daemon = True
    control_thread.start()
    
except ImportError:
    print("BLE functionality disabled or not available. Dashboard running without BLE support.")

@app.route("/")
def dashboard():
    return render_template_string("""
    <html><head><title>Air Quality Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <meta http-equiv="refresh" content="2">
    </head>
    <body>
    <h2>Real-Time Sensor Data</h2>
    <p><b>Temperature:</b> {{ T }} °C</p>
    <p><b>Humidity:</b> {{ H }} %</p>
    <p><b>PM2.5:</b> {{ P }} µg/m³</p>

    <h3>Temperature (°C)</h3>
    <canvas id="tempChart" width="800" height="250"></canvas>

    <h3>Humidity (%)</h3>
    <canvas id="humChart" width="800" height="250"></canvas>

    <h3>PM2.5 (µg/m³)</h3>
    <canvas id="pmChart" width="800" height="250"></canvas>

    <form action="/control" method="post">
        <button name="command" value="ON">Turn Dehumidifier ON</button>
        <button name="command" value="OFF">Turn Dehumidifier OFF</button>
    </form>
    <form action="/shutdown" method="post">
        <button type="submit">Shutdown Server</button>
    </form>
    <p><i>Last command:</i> {{ command }} | <i>Success:</i> {{ success }}</p>

    <script>
        const labels = [...Array({{ history|length }}).keys()];
        const tempData = {{ history | map(attribute='T') | list }};
        const humData = {{ history | map(attribute='H') | list }};
        const pmData = {{ history | map(attribute='P') | list }};

        new Chart(document.getElementById('tempChart'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Temperature (°C)',
                    data: tempData,
                    borderColor: 'green',
                    fill: false
                }]
            },
            options: { animation: false, responsive: true }
        });

        new Chart(document.getElementById('humChart'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Humidity (%)',
                    data: humData,
                    borderColor: 'blue',
                    fill: false
                }]
            },
            options: { animation: false, responsive: true }
        });

        new Chart(document.getElementById('pmChart'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'PM2.5 (µg/m³)',
                    data: pmData,
                    borderColor: 'red',
                    fill: false
                }]
            },
            options: { animation: false, responsive: true }
        });
    </script>
    </body></html>
    """, T=latest_data["T"], H=latest_data["H"], P=latest_data["P"],
         history=latest_data["history"], command=control_status["command"], success=control_status["success"])

@app.route("/control", methods=["POST"])
def control():
    cmd = request.form.get("command")
    control_status["command"] = cmd
    control_status["success"] = True
    return dashboard()

@app.route("/shutdown", methods=["POST"])
def shutdown():
    func = request.environ.get('werkzeug.server.shutdown')
    if func is None:
        raise RuntimeError('Not running with the Werkzeug Server')
    func()
    return "Server shutting down..."

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
