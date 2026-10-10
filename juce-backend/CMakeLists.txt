cmake_minimum_required(VERSION 3.22)
project(LyricistEngine VERSION 4.2.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ── JUCE ────────────────────────────────────────────────────────────────────
# Option A: System-installed JUCE (set JUCE_DIR to your JUCE install path)
# Option B: FetchContent from GitHub
option(LYRICIST_FETCH_JUCE "Download JUCE via FetchContent instead of find_package" ON)

if(LYRICIST_FETCH_JUCE)
  include(FetchContent)
  FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG        8.0.3
  )
  FetchContent_MakeAvailable(JUCE)
else()
  find_package(JUCE CONFIG REQUIRED)
endif()

# ── LyricistEngine executable ───────────────────────────────────────────────
juce_add_gui_app(LyricistEngine
  PRODUCT_NAME "Lyricist Engine"
  COMPANY_NAME "Funk Audio Flow OpSec"
)

# Main.cpp includes <JuceHeader.h>, which modern JUCE CMake does NOT generate by
# default - every other source here uses modular includes instead. This one line
# generates it; without it Main.cpp fails with C1083 'Cannot open include file'.
juce_generate_juce_header(LyricistEngine)

target_sources(LyricistEngine PRIVATE
  src/Main.cpp
  src/AsioDriver.cpp
  src/Vst3Scanner.cpp
  src/IpcBridge.cpp
  src/PluginHost.cpp
)

# ── ASIO ────────────────────────────────────────────────────────────────────
# JUCE_ASIO=1 makes juce_audio_devices include <iasiodrv.h>, which ships in the
# Steinberg ASIO SDK and is NOT vendored here. AsioDriver.cpp itself never
# includes the SDK — it asks the AudioDeviceManager for a device type named
# "ASIO" by string and falls back to enumerating all types — so building
# without it costs the ASIO backend and nothing else. Point ASIO_SDK_DIR at the
# SDK's common/ folder to switch it back on:
#   cmake -B build -DASIO_SDK_DIR="C:/SDKs/asiosdk/common"
set(ASIO_SDK_DIR "" CACHE PATH "Path to the Steinberg ASIO SDK 'common' folder")

if(ASIO_SDK_DIR AND EXISTS "${ASIO_SDK_DIR}/iasiodrv.h")
  message(STATUS "LyricistEngine: ASIO SDK found at ${ASIO_SDK_DIR} - ASIO enabled")
  target_include_directories(LyricistEngine PRIVATE "${ASIO_SDK_DIR}")
  set(LYRICIST_ASIO 1)
else()
  message(WARNING "LyricistEngine: no ASIO SDK (ASIO_SDK_DIR unset or missing iasiodrv.h) - building with WASAPI/DirectSound only")
  set(LYRICIST_ASIO 0)
endif()

target_compile_definitions(LyricistEngine PRIVATE
  JUCE_USE_CURL=0
  JUCE_WEB_BROWSER=0
  JUCE_PLUGINHOST_VST3=1
  JUCE_ASIO=${LYRICIST_ASIO}
  JUCE_PLUGINHOST_VST=0
  JUCE_PLUGINHOST_AU=0
)

target_link_libraries(LyricistEngine PRIVATE
  juce::juce_audio_basics
  juce::juce_audio_devices
  juce::juce_audio_formats
  juce::juce_audio_processors
  juce::juce_audio_utils
  juce::juce_core
  juce::juce_events
  juce::juce_gui_basics
  juce::juce_gui_extra
)

# ── Where main.js expects the engine ────────────────────────────────────────
# getJuceEnginePath() in main.js looks for exactly two paths:
#   juce-backend/build/LyricistEngine.exe
#   juce-backend/build/Release/LyricistEngine.exe
# JUCE puts the artefact in build/LyricistEngine_artefacts/<config>/ and names
# it after PRODUCT_NAME ("Lyricist Engine.exe" - with a space). Copy it to the
# second path after every build so the Electron side can actually spawn it.
add_custom_command(TARGET LyricistEngine POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory
          "${CMAKE_BINARY_DIR}/$<CONFIG>"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
          "$<TARGET_FILE:LyricistEngine>"
          "${CMAKE_BINARY_DIR}/$<CONFIG>/LyricistEngine.exe"
  COMMENT "Copying engine to build/$<CONFIG>/LyricistEngine.exe for main.js"
  VERBATIM
)
