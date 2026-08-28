cmake_minimum_required(VERSION 3.22)
project(LyricistEngine VERSION 4.2.0 LANGUAGES CXX)

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
juce_add_console_app(LyricistEngine
  PRODUCT_NAME "Lyricist Engine"
  COMPANY_NAME "Funk Audio Flow OpSec"
)

target_sources(LyricistEngine PRIVATE
  src/Main.cpp
  src/AsioDriver.cpp
  src/Vst3Scanner.cpp
  src/IpcBridge.cpp
)

target_compile_definitions(LyricistEngine PRIVATE
  JUCE_USE_CURL=0
  JUCE_WEB_BROWSER=0
  JUCE_PLUGINHOST_VST3=1
  JUCE_ASIO=1
)

target_link_libraries(LyricistEngine PRIVATE
  juce::juce_audio_basics
  juce::juce_audio_devices
  juce::juce_audio_formats
  juce::juce_audio_processors
  juce::juce_audio_utils
  juce::juce_core
  juce::juce_events
)
