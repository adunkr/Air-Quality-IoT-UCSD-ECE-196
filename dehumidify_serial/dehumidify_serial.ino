const uint8_t PELTIER_PIN = 41;
const uint8_t FAN_PIN     = 42;
const uint8_t LED_PIN     = 17;

String  inputString    = "";
bool    stringComplete = false;

void setup() {
  pinMode(PELTIER_PIN, OUTPUT);
  pinMode(FAN_PIN,     OUTPUT);
  pinMode(LED_PIN,     OUTPUT);
  digitalWrite(PELTIER_PIN, LOW);
  digitalWrite(FAN_PIN,     LOW);

  Serial.begin(115200);
  delay(100);
  Serial.println("READY");
}

void loop() {
  static unsigned long lastBlink = 0;
  if (millis() - lastBlink > 500) {
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    lastBlink = millis();
  }

  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      stringComplete = true;
    }
    else if (c != '\r') {
      inputString += c;
    }
  }

  if (stringComplete) {
    inputString.trim();
    inputString.toUpperCase();

    if (inputString == "PELTIER ON") {
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
    else {
      Serial.print("Unknown command: ");
      Serial.println(inputString);
    }

    inputString    = "";
    stringComplete = false;
  }
}
