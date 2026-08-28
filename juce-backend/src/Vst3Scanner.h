#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_core/juce_core.h>

/**
 * @class Vst3Scanner
 * @brief Manages VST3 plugin discovery, cache indexing, and instantiation validation.
 *
 * Utilises JUCE AudioPluginFormatManager and KnownPluginList to scan directories
 * for .vst3 bundles, index metadata (name, vendor, category, UID), and validate
 * that plugins load safely without crashing.
 */
class Vst3Scanner
{
public:
    /**
     * @brief Constructs the VST3 scanner and registers standard plugin formats.
     */
    Vst3Scanner();

    /**
     * @brief Destructor.
     */
    ~Vst3Scanner();

    /**
     * @brief Scans directories for .vst3 plugin bundles and indexes discovered plugins.
     * @param directories Array of filesystem directory paths to scan. If empty, default system paths are used.
     */
    void scanPaths(const juce::StringArray& directories);

    /**
     * @brief Returns a JSON-serializable list of all discovered and cached plugins.
     * @return juce::var Array of DynamicObjects containing name, vendor, category, uid, version, etc.
     */
    juce::var getPluginList() const;

    /**
     * @brief Validates that a plugin with the given UID or identifier can be instantiated without crashing.
     * @param uid The unique identifier or file path of the plugin to validate.
     * @return true if the plugin loads and instantiates successfully, false otherwise.
     */
    bool validatePlugin(const juce::String& uid);

    /**
     * @brief Provides reference to the underlying KnownPluginList.
     * @return Reference to juce::KnownPluginList.
     */
    juce::KnownPluginList& getKnownPluginList() { return knownPluginList; }

    /**
     * @brief Provides const reference to the underlying KnownPluginList.
     * @return Const reference to juce::KnownPluginList.
     */
    const juce::KnownPluginList& getKnownPluginList() const { return knownPluginList; }

    /**
     * @brief Provides reference to the underlying AudioPluginFormatManager.
     * @return Reference to juce::AudioPluginFormatManager.
     */
    juce::AudioPluginFormatManager& getFormatManager() { return formatManager; }

    /**
     * @brief Provides const reference to the underlying AudioPluginFormatManager.
     * @return Const reference to juce::AudioPluginFormatManager.
     */
    const juce::AudioPluginFormatManager& getFormatManager() const { return formatManager; }

private:
    juce::AudioPluginFormatManager formatManager;
    juce::KnownPluginList          knownPluginList;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(Vst3Scanner)
};
