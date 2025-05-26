const uint8_t PELTIER_PIN = 41;
const uint8_t FAN_PIN     = 42;
const uint8_t PELTIER_LED = 17;
const uint8_t FAN_LED = 18;
const uint8_t PELTIER_BUTTON = 12;
const uint8_t FAN_BUTTON = 13;

class DebounceToggleButton {
public:
  DebounceToggleButton(uint8_t pin, unsigned long debounceMs = 50)
    : _pin(pin), _debounceDelay(debounceMs), _lastDebounceTime(0), _toggleState(false)
  {}

  void begin() {
    pinMode(_pin, INPUT);
    int init = digitalRead(_pin);
    _lastReading = init;
    _stableState = init;
  }

  bool update() {
    int reading = digitalRead(_pin);
    if (reading != _lastReading) {
      _lastDebounceTime = millis();
      _lastReading      = reading;
    }
    if (millis() - _lastDebounceTime > _debounceDelay) {
      if (reading != _stableState) {
        _stableState = reading;
        if (_stableState == HIGH) {
          _toggleState = !_toggleState;
          return true;
        }
      }
    }
    return false;
  }

  bool state() const { return _toggleState; }

private:
  uint8_t       _pin;
  unsigned long _debounceDelay;
  int           _lastReading;
  int           _stableState;
  unsigned long _lastDebounceTime;
  bool          _toggleState;
};

DebounceToggleButton peltier(PELTIER_BUTTON, 50);
DebounceToggleButton fan(FAN_BUTTON, 50);

void setup() {
  peltier.begin();
  fan.begin();

  pinMode(PELTIER_PIN,    OUTPUT);
  pinMode(FAN_PIN,        OUTPUT);
  pinMode(PELTIER_LED,    OUTPUT);
  pinMode(FAN_LED,        OUTPUT);
  pinMode(PELTIER_BUTTON, INPUT);
  pinMode(FAN_BUTTON,     INPUT);

  digitalWrite(PELTIER_PIN, LOW);
  digitalWrite(FAN_PIN,     LOW);
  digitalWrite(PELTIER_LED, LOW);
  digitalWrite(FAN_LED,     LOW);
}

void loop() {
  if (peltier.update() || fan.update()) {
    digitalWrite(PELTIER_PIN, peltier.state() ? HIGH : LOW);
    digitalWrite(FAN_PIN, fan.state() ? HIGH : LOW);

    digitalWrite(PELTIER_LED, peltier.state() ? HIGH : LOW);
    digitalWrite(FAN_LED, fan.state() ? HIGH : LOW);
  }
}