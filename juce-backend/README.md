# Lyricist Engine 4.2.0 Pro — JUCE Native Audio Backend

`LyricistEngine` is the high-performance native C++ audio backend for **Lyricist 4.2.0 Pro**. It runs as a lightweight, headless console process that bridges hardware-level ASIO low-latency drivers and VST3 plugin processing to the Electron/React desktop client via standard input/output (JSON-RPC over stdio).

---

## 1. Architecture Overview

```
+-------------------------------------------------------------+
|             Lyricist 4.2.0 Pro Frontend / Node.js           |
|            (React 18 + Surgical Gunmetal DAW UI)             |
+-------------------------------------------------------------+
                              |
               stdin / stdout (JSON-RPC stream)
                              |
+-----------------------------v-------------------------------+
|                      Lyricist Engine                        |
|                  (Headless JUCE C++ Host)                   |
|                                                             |
|  +------------------+  +----------------+  +-------------+  |
|  |    IpcBridge     |  |   AsioDriver   |  | Vst3Scanner |  |
|  | (Threaded Reader)|  | (Audio Devices)|  | (Host/Cache)|  |
|  +------------------+  +----------------+  +-------------+  |
+-------------------------------------------------------------+
           |                                  |
    Hardware Audio Out / In           VST3 Plugin Bundles
    (ASIO4ALL / Focusrite / etc)       (.vst3 on Disk)
```

- **Headless Execution**: Built via `juce_add_console_app` with zero GUI overhead.
- **ASIO Driver Management**: Direct hardware interface utilizing JUCE's low-latency `AudioDeviceManager`.
- **VST3 Plugin Hosting**: Subsystem scanning, caching metadata, and validating third-party VST3 instrument/effect binaries.
- **Non-blocking Stdio IPC**: Dedicated worker thread parses line-delimited JSON commands from `stdin` and writes JSON responses to `stdout`.

---

## 2. Prerequisites

- **CMake**: Version `3.22` or higher.
- **C++ Compiler**: C++17 compliant compiler (MSVC 2019/2022 on Windows, Clang 12+ on macOS, GCC 9+ on Linux).
- **Steinberg ASIO SDK**: Required for native ASIO support on Windows. (If installed in standard paths or provided via JUCE, CMake will locate it automatically).
- **Git**: For automated FetchContent retrieval of JUCE 8.0.3.

---

## 3. Build Instructions

### Quick Build (CMake CLI)

```bash
cd juce-backend
mkdir build
cd build
cmake ..
cmake --build . --config Release
```

### Build Options

- `-DLYRICIST_FETCH_JUCE=ON` (Default): Automatically fetches and configures JUCE 8.0.3 via CMake `FetchContent`.
- `-DLYRICIST_FETCH_JUCE=OFF`: Uses a local JUCE installation found via `find_package(JUCE CONFIG REQUIRED)` or `JUCE_DIR`.

```bash
# Using a local JUCE installation
cmake -B build -DLYRICIST_FETCH_JUCE=OFF -DJUCE_DIR="C:/JUCE"
cmake --build build --config Release
```

The resulting executable `LyricistEngine.exe` (Windows) or `LyricistEngine` (macOS/Linux) is placed in `build/LyricistEngine_artefacts/Release/`.

---

## 4. IPC Protocol Reference

Communication occurs over standard streams using **single-line newline-delimited JSON (NDJSON)**.

### Request Format

```json
{
  "id": "req-001",
  "method": "<method_name>",
  "params": { ... }
}
```

### Response Format

**Success:**
```json
{
  "id": "req-001",
  "result": { ... }
}
```

**Error:**
```json
{
  "id": "req-001",
  "error": {
    "code": -32601,
    "message": "Method not found: invalid.method"
  }
}
```

---

## 5. Supported IPC Methods

### `engine.ping`
Health check and version query.
- **Request:**
  ```json
  {"id": 1, "method": "engine.ping"}
  ```
- **Response:**
  ```json
  {"id": 1, "result": {"status": "ok", "version": "4.2.0"}}
  ```

---

### `asio.enumerate`
Scans and enumerates available ASIO / low-latency audio driver names.
- **Request:**
  ```json
  {"id": 2, "method": "asio.enumerate"}
  ```
- **Response:**
  ```json
  {"id": 2, "result": {"drivers": ["Focusrite USB ASIO", "FL Studio ASIO", "ASIO4ALL v2"]}}
  ```

---

### `asio.open`
Initialises and activates the selected audio driver with target sample rate and buffer size.
- **Request:**
  ```json
  {
    "id": 3,
    "method": "asio.open",
    "params": {
      "name": "Focusrite USB ASIO",
      "sampleRate": 48000.0,
      "bufferSize": 256
    }
  }
  ```
- **Response:**
  ```json
  {
    "id": 3,
    "result": {
      "success": true,
      "status": {
        "active": true,
        "deviceName": "Focusrite USB ASIO",
        "deviceType": "ASIO",
        "sampleRate": 48000.0,
        "bufferSize": 256,
        "inputLatencySamples": 128,
        "outputLatencySamples": 184,
        "latencyMs": 6.5,
        "inputChannels": 2,
        "outputChannels": 2
      }
    }
  }
  ```

---

### `asio.status`
Queries current hardware driver state and latency telemetry.
- **Request:**
  ```json
  {"id": 4, "method": "asio.status"}
  ```
- **Response:**
  ```json
  {
    "id": 4,
    "result": {
      "active": true,
      "deviceName": "Focusrite USB ASIO",
      "deviceType": "ASIO",
      "sampleRate": 48000.0,
      "bufferSize": 256,
      "inputLatencySamples": 128,
      "outputLatencySamples": 184,
      "latencyMs": 6.5,
      "inputChannels": 2,
      "outputChannels": 2
    }
  }
  ```

---

### `asio.close`
Releases active audio hardware and closes driver handles.
- **Request:**
  ```json
  {"id": 5, "method": "asio.close"}
  ```
- **Response:**
  ```json
  {"id": 5, "result": {"success": true}}
  ```

---

### `vst3.scan`
Performs recursive filesystem scan for `.vst3` plugin bundles.
- **Request:**
  ```json
  {
    "id": 6,
    "method": "vst3.scan",
    "params": {
      "paths": [
        "C:\\Program Files\\Common Files\\VST3",
        "D:\\Plugins\\VST3"
      ]
    }
  }
  ```
- **Response:**
  ```json
  {"id": 6, "result": {"success": true, "count": 18}}
  ```

---

### `vst3.list`
Returns array of all discovered and cached VST3 plugins with metadata.
- **Request:**
  ```json
  {"id": 7, "method": "vst3.list"}
  ```
- **Response:**
  ```json
  {
    "id": 7,
    "result": {
      "plugins": [
        {
          "name": "Serum",
          "vendor": "Xfer Records",
          "category": "Synth",
          "version": "1.368",
          "format": "VST3",
          "uid": "VST3-Serum-XferRecords",
          "fileOrIdentifier": "C:\\Program Files\\Common Files\\VST3\\Serum.vst3",
          "isInstrument": true,
          "numInputs": 0,
          "numOutputs": 2
        },
        {
          "name": "FabFilter Pro-Q 3",
          "vendor": "FabFilter",
          "category": "EQ",
          "version": "3.24",
          "format": "VST3",
          "uid": "VST3-Pro-Q3-FabFilter",
          "fileOrIdentifier": "C:\\Program Files\\Common Files\\VST3\\FabFilter Pro-Q 3.vst3",
          "isInstrument": false,
          "numInputs": 2,
          "numOutputs": 2
        }
      ]
    }
  }
  ```

---

### `vst3.validate`
Tests instantiation of a specific plugin by UID without host failure.
- **Request:**
  ```json
  {
    "id": 8,
    "method": "vst3.validate",
    "params": {
      "uid": "VST3-Serum-XferRecords"
    }
  }
  ```
- **Response:**
  ```json
  {"id": 8, "result": {"valid": true, "uid": "VST3-Serum-XferRecords"}}
  ```

---

### `engine.quit`
Instructs the engine to cleanly shutdown all subsystems and exit.
- **Request:**
  ```json
  {"id": 9, "method": "engine.quit"}
  ```
- **Response:**
  ```json
  {"id": 9, "result": {"status": "quitting"}}
  ```
