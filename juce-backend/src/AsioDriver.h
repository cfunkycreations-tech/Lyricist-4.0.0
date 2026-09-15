#pragma once

#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_core/juce_core.h>

/**
 * @class AsioDriver
 * @brief Manages ASIO and low-latency audio hardware device lifecycle and status.
 *
 * Wraps JUCE's AudioDeviceManager to provide device enumeration, configuration,
 * sample rate / buffer size control, and runtime telemetry for Lyricist Engine.
 */
class AsioDriver
{
public:
    /**
     * @brief Constructs the ASIO driver manager and registers audio device types.
     */
    AsioDriver();

    /**
     * @brief Destructor ensuring active audio hardware is cleanly shut down.
     */
    ~AsioDriver();

    /**
     * @brief Enumerates available audio drivers (filtering for ASIO devices when available).
     *
     * NOT const: this calls scanForDevices() on each device type, which mutates the
     * driver list, and getAvailableDeviceTypes() is itself non-const in JUCE 8.
     *
     * @return juce::StringArray list of driver/device names.
     */
    juce::StringArray enumerateDrivers();

    /**
     * @brief Opens and initialises the specified audio driver with target sample rate and buffer size.
     * @param name Name of the device driver to open.
     * @param sampleRate Preferred sample rate in Hz (e.g. 44100.0, 48000.0, 96000.0).
     * @param bufferSize Preferred buffer size in samples (e.g. 64, 128, 256, 512).
     * @return true if successfully opened and running, false on configuration failure.
     */
    bool openDriver(const juce::String& name, double sampleRate, int bufferSize);

    /**
     * @brief Closes the currently active audio device and releases hardware resources.
     */
    void closeDriver();

    /**
     * @brief Retrieves current status and latency telemetry formatted for JSON serialization.
     * @return juce::var DynamicObject containing active, deviceName, deviceType, sampleRate,
     *         bufferSize, inputLatencySamples, outputLatencySamples, latencyMs, inputChannels, outputChannels.
     */
    juce::var getStatus() const;

    /**
     * @brief Provides reference to the internal JUCE AudioDeviceManager.
     * @return Reference to juce::AudioDeviceManager.
     */
    juce::AudioDeviceManager& getDeviceManager() { return deviceManager; }

    /**
     * @brief Provides const reference to the internal JUCE AudioDeviceManager.
     * @return Const reference to juce::AudioDeviceManager.
     */
    const juce::AudioDeviceManager& getDeviceManager() const { return deviceManager; }

private:
    juce::AudioDeviceManager deviceManager;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(AsioDriver)
};
