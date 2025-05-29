/*
    Based on Neil Kolban example for IDF: https://github.com/nkolban/esp32-snippets/blob/master/cpp_utils/tests/BLE%20Tests/SampleWrite.cpp
    Ported to Arduino ESP32 by Evandro Copercini
*/

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

// See the following for generating UUIDs:
// https://www.uuidgenerator.net/

#define SERVICE_UUID        "73bfc77b-7e3f-4b41-8cd5-b719668f9d96"
#define CHARACTERISTIC_UUID "a16beeb4-bf06-4c17-9cec-fbc82db1a016"

const uint8_t PELTIER_PIN = 41;
const uint8_t FAN_PIN     = 42;
const uint8_t LED_PIN     = 17;

class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String inputString = pCharacteristic->getValue();

    if (inputString.length() > 0) {
      inputString.trim();
      inputString.toUpperCase();

      if (inputString == "ON") {
        digitalWrite(PELTIER_PIN, HIGH);
        digitalWrite(FAN_PIN, HIGH);
        Serial.println("System: ON");
      }
      else if (inputString == "PELTIER ON") {
        digitalWrite(PELTIER_PIN, HIGH);
        Serial.println("Peltier: ON");
      }
      else if (inputString == "PELTIER OFF") {
        digitalWrite(PELTIER_PIN, LOW);
        Serial.println("Peltier: OFF");
      }
      else if (inputString == "FAN ON") {
        digitalWrite(FAN_PIN, HIGH);
        Serial.println("Fan: ON");
      }
      else if (inputString == "FAN OFF") {
        digitalWrite(FAN_PIN, LOW);
        Serial.println("Fan: OFF");
      }
      else if (inputString == "OFF") {
        digitalWrite(PELTIER_PIN, LOW);
        digitalWrite(FAN_PIN, LOW);
        Serial.println("System: OFF");
      }
      else {
        Serial.print("Unknown command: ");
        Serial.println(inputString);
      }
    }
  }
};

void setup() {
  pinMode(PELTIER_PIN, OUTPUT);
  pinMode(FAN_PIN,     OUTPUT);
  pinMode(LED_PIN,     OUTPUT);
  digitalWrite(PELTIER_PIN, LOW);
  digitalWrite(FAN_PIN,     LOW);

  Serial.begin(115200);
  delay(100);
  Serial.println("READY on Dehumidify");

  BLEDevice::init("Dehumidify");
  BLEServer *pServer = BLEDevice::createServer();

  BLEService *pService = pServer->createService(SERVICE_UUID);

  BLECharacteristic *pCharacteristic =
    pService->createCharacteristic(CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE);

  pCharacteristic->setCallbacks(new MyCallbacks());

  pCharacteristic->setValue("Hello World");
  pService->start();

  BLEAdvertising *pAdvertising = pServer->getAdvertising();
  pAdvertising->start();
}

void loop() {
  // put your main code here, to run repeatedly:
  delay(2000);
}
