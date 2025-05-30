from multiprocessing import Process
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import json
import requests
import time

'''
import mysql.connector as mysql
import os
from dotenv import load_dotenv


# Read Database connection variables
load_dotenv("credentials.env")

db_host = os.environ['MYSQL_HOST']
db_user = os.environ['MYSQL_USER']
db_pass = os.environ['MYSQL_PASSWORD']
db_base = os.environ['MYSQL_DATABASE']
'''

SENSOR_NAME = "ESP32_SEN5x"
SENSOR_CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"
ACTUATOR_NAME = "ESP32_Dehumidifier"
ACTUATOR_CHAR_UUID = "a16beeb4-bf06-4c17-9cec-fbc82db1a016"

latest_data = {"T": 0.0, "H": 0.0, "P": 0.0, "history": []}
control_status = {"command": "NONE", "success": False}

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

    ble_thread = threading.Thread(target=start_ble_thread)
    ble_thread.daemon = True
    ble_thread.start()
except ImportError:
    print("BLE functionality disabled or not available. Dashboard running without BLE support.")


app = FastAPI()
app.mount("/public", StaticFiles(directory="public"), name="public")

@app.get("/", response_class=HTMLResponse)
def get_html() -> HTMLResponse:
    with open("index.html") as html:
        return HTMLResponse(content=html.read())

@app.get("/data")
def get_html():
  db = mysql.connect(user=db_user, password=db_pass, host=db_host, database=db_base)
  cursor = db.cursor()
  cursor.execute("SELECT * FROM (SELECT * FROM WeatherData ORDER BY id DESC LIMIT 20) AS sub ORDER BY id ASC")
  
  rawdata = cursor.fetchall()

  db.commit()
  db.close()

  time = []
  light = []
  temp = []
  humidity = []

  for i in rawdata:
    time.append(str(i[4])[11:19])
    light.append(i[1])
    temp.append(int(i[2]))
    humidity.append(int(i[3]))

  return {'time': time, 'light': light, 'temp': temp, 'humidity': humidity}



if __name__ == "__main__":
  p = Process(target=collect_data)
  p.start()
  uvicorn.run(app, host='0.0.0.0', port=8000)