/**
 * @file AsioDriver.cpp
 * @brief Implementation of the ASIO driver manager for Lyricist Engine.
 */

#include "AsioDriver.h"

AsioDriver::AsioDriver()
{
    // Register available audio device types (ASIO, DirectSound, WASAPI, etc.)
    deviceManager.createAudioDeviceTypesIfNeeded();
}

AsioDriver::~AsioDriver()
{
    closeDriver();
}

juce::StringArray AsioDriver::enumerateDrivers() const
{
    juce::StringArray drivers;

    // Scan through available device types
    const auto& types = deviceManager.getAvailableDeviceTypes();
    for (auto* type : types)
    {
        if (type != nullptr)
        {
            type->scanForDevices();
            const auto names = type->getDeviceNames();

            // If ASIO device type is found, list its devices
            if (type->getTypeName().equalsIgnoreCase("ASIO"))
            {
                for (const auto& name : names)
                {
                    if (!drivers.contains(name))
                        drivers.add(name);
                }
            }
        }
    }

    // Fallback: If no ASIO devices found, enumerate devices across all registered types
    if (drivers.isEmpty())
    {
        for (auto* type : types)
        {
            if (type != nullptr)
            {
                const auto names = type->getDeviceNames();
                for (const auto& name : names)
                {
                    if (!drivers.contains(name))
                        drivers.add(name);
                }
            }
        }
    }

    return drivers;
}

bool AsioDriver::openDriver(const juce::String& name, double sampleRate, int bufferSize)
{
    // Prefer ASIO audio device type if present
    for (auto* type : deviceManager.getAvailableDeviceTypes())
    {
        if (type != nullptr && type->getTypeName().equalsIgnoreCase("ASIO"))
        {
            deviceManager.setCurrentAudioDeviceType("ASIO", true);
            break;
        }
    }

    juce::AudioDeviceManager::AudioDeviceSetup setup;
    deviceManager.getAudioDeviceSetup(setup);

    if (name.isNotEmpty())
    {
        setup.outputDeviceName = name;
        setup.inputDeviceName = name;
    }

    if (sampleRate > 0.0)
    {
        setup.sampleRate = sampleRate;
    }

    if (bufferSize > 0)
    {
        setup.bufferSize = bufferSize;
    }

    setup.useDefaultInputChannels = true;
    setup.useDefaultOutputChannels = true;

    // If no specific device is specified or setup is empty, fallback to initialiseWithDefaultDevices
    if (name.isEmpty() && setup.outputDeviceName.isEmpty())
    {
        auto result = deviceManager.initialiseWithDefaultDevices(2, 2);
        return result.isEmpty();
    }

    auto error = deviceManager.setAudioDeviceSetup(setup, true);
    return error.isEmpty();
}

void AsioDriver::closeDriver()
{
    deviceManager.closeAudioDevice();
}

juce::var AsioDriver::getStatus() const
{
    auto* obj = new juce::DynamicObject();

    auto* currentDevice = deviceManager.getCurrentAudioDevice();
    if (currentDevice != nullptr && currentDevice->isOpen())
    {
        const double sr = currentDevice->getCurrentSampleRate();
        const int inputLatency = currentDevice->getInputLatencyInSamples();
        const int outputLatency = currentDevice->getOutputLatencyInSamples();
        const int bufferSize = currentDevice->getCurrentBufferSizeSamples();

        double totalLatencyMs = 0.0;
        if (sr > 0.0)
        {
            totalLatencyMs = ((static_cast<double>(inputLatency + outputLatency)) / sr) * 1000.0;
        }

        obj->setProperty("active", true);
        obj->setProperty("deviceName", currentDevice->getName());
        obj->setProperty("deviceType", currentDevice->getTypeName());
        obj->setProperty("sampleRate", sr);
        obj->setProperty("bufferSize", bufferSize);
        obj->setProperty("inputLatencySamples", inputLatency);
        obj->setProperty("outputLatencySamples", outputLatency);
        obj->setProperty("latencyMs", totalLatencyMs);
        obj->setProperty("inputChannels", currentDevice->getActiveInputChannels().countNumberOfSetBits());
        obj->setProperty("outputChannels", currentDevice->getActiveOutputChannels().countNumberOfSetBits());
    }
    else
    {
        obj->setProperty("active", false);
        obj->setProperty("deviceName", "");
        obj->setProperty("deviceType", "");
        obj->setProperty("sampleRate", 0.0);
        obj->setProperty("bufferSize", 0);
        obj->setProperty("inputLatencySamples", 0);
        obj->setProperty("outputLatencySamples", 0);
        obj->setProperty("latencyMs", 0.0);
        obj->setProperty("inputChannels", 0);
        obj->setProperty("outputChannels", 0);
    }

    return juce::var(obj);
}
