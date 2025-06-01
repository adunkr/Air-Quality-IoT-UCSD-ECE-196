#include <Wire.h>
#include <SensirionI2CSen5x.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <BLEAdvertising.h>


#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

#define GREEN_LED 42
#define YELLOW_LED 41
#define RED_LED 40
#define BUZZER 9

SensirionI2CSen5x sen5x;
BLECharacteristic* pCharacteristic;

unsigned long badStartTime = 0;
bool buzzerOn = false;

void setup() {
  Serial.begin(115200);

  pinMode(GREEN_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  digitalWrite(GREEN_LED, LOW);
  digitalWrite(YELLOW_LED, LOW);
  digitalWrite(RED_LED, LOW);
  digitalWrite(BUZZER, LOW);

  Wire.begin(8, 9);
  sen5x.begin(Wire);

  uint16_t error = sen5x.deviceReset();
  delay(1000);
  error |= sen5x.startMeasurement();

  if (error) {
    Serial.print("Sensor init error: ");
    Serial.println(error);
  } else {
    Serial.println("Sensor initialized successfully.");
  }

  BLEDevice::init("SensorDevice");
  BLEServer* pServer = BLEDevice::createServer();
  BLEService* pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ
  );

  pCharacteristic->addDescriptor(new BLE2902());
  pCharacteristic->setValue("Waiting...");
  pService->start();

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->setScanResponse(true);
  pAdvertising->addServiceUUID(SERVICE_UUID);

  BLEAdvertisementData adData;
  adData.setName("ESP32_SEN5x");
  pAdvertising->setAdvertisementData(adData);

  pAdvertising->start();
  Serial.println("BLE advertising started...");
}

void updateIndicators(float pm2_5, float humidity) {
  int activeLED = RED_LED;

  bool pm_good = pm2_5 <= 12.0;
  bool pm_ok = pm2_5 <= 35.4;
  bool hum_good = humidity >= 30 && humidity <= 60;
  bool hum_ok = humidity >= 25 && humidity <= 70;

  if (pm_good && hum_good) {
    activeLED = GREEN_LED;
  } else if (pm_ok && hum_ok) {
    activeLED = YELLOW_LED;
  } else {
    activeLED = RED_LED;
  }

  digitalWrite(GREEN_LED, activeLED == GREEN_LED ? HIGH : LOW);
  digitalWrite(YELLOW_LED, activeLED == YELLOW_LED ? HIGH : LOW);
  digitalWrite(RED_LED, activeLED == RED_LED ? HIGH : LOW);

  bool bad_air = !(pm_ok && hum_ok);
  if (bad_air) {
    if (badStartTime == 0) {
      badStartTime = millis();
    } else if (!buzzerOn && millis() - badStartTime >= 300000) {
      digitalWrite(BUZZER, HIGH);
      buzzerOn = true;
      Serial.println("Buzzer ON: Bad air quality for 5+ minutes");
    }
  } else {
    badStartTime = 0;
    buzzerOn = false;
    digitalWrite(BUZZER, LOW);
  }
}

void loop() {
  float pm1, pm2p5, pm4, pm10, hum, temp, voc, nox;
  uint16_t err = sen5x.readMeasuredValues(pm1, pm2p5, pm4, pm10, hum, temp, voc, nox);

  if (!err && !isnan(temp) && !isnan(hum) && !isnan(pm2p5)) {
    String msg = "{\"T\":" + String(temp, 1) +
                 ",\"H\":" + String(hum, 1) +
                 ",\"P\":" + String(pm2p5, 1) + "}";
    Serial.println("BLE: " + msg);
    pCharacteristic->setValue(msg.c_str());
    pCharacteristic->notify();
    updateIndicators(pm2p5, hum);
  } else {
    Serial.println("Sensor read error — fallback to RED");
    updateIndicators(999.0, 0.0);
  }

  delay(1000);
}
