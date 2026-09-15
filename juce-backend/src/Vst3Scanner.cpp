/**
 * @file Vst3Scanner.cpp
 * @brief Implementation of VST3 plugin scanning and validation for Lyricist Engine.
 */

#include "Vst3Scanner.h"

Vst3Scanner::Vst3Scanner()
{
    // Register default plugin formats (including VST3)
    formatManager.addDefaultFormats();
}

Vst3Scanner::~Vst3Scanner()
{
}

void Vst3Scanner::scanPaths(const juce::StringArray& directories)
{
    juce::FileSearchPath searchPath;

    for (const auto& dir : directories)
    {
        if (dir.isNotEmpty())
        {
            searchPath.add(juce::File(dir));
        }
    }

    // Default VST3 directories if none specified
    if (searchPath.getNumPaths() == 0)
    {
        #if JUCE_WINDOWS
        searchPath.add(juce::File("C:\\Program Files\\Common Files\\VST3"));
        searchPath.add(juce::File("C:\\Program Files (x86)\\Common Files\\VST3"));
        searchPath.add(juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
                           .getChildFile("Programs/Common/VST3"));
        #elif JUCE_MAC
        searchPath.add(juce::File("/Library/Audio/Plug-Ins/VST3"));
        searchPath.add(juce::File::getSpecialLocation(juce::File::userHomeDirectory)
                           .getChildFile("Library/Audio/Plug-Ins/VST3"));
        #elif JUCE_LINUX
        searchPath.add(juce::File("/usr/lib/vst3"));
        searchPath.add(juce::File("/usr/local/lib/vst3"));
        searchPath.add(juce::File::getSpecialLocation(juce::File::userHomeDirectory)
                           .getChildFile(".vst3"));
        #endif
    }

    for (int i = 0; i < formatManager.getNumFormats(); ++i)
    {
        auto* format = formatManager.getFormat(i);
        if (format != nullptr)
        {
            juce::PluginDirectoryScanner scanner(knownPluginList, *format, searchPath, true, juce::File());
            juce::String pluginBeingScanned;

            while (scanner.scanNextFile(true, pluginBeingScanned))
            {
                // Continue scanning until directory search is complete
            }
        }
    }
}

juce::var Vst3Scanner::getPluginList() const
{
    juce::Array<juce::var> pluginArray;

    for (const auto& desc : knownPluginList.getTypes())
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("name", desc.name);
        obj->setProperty("vendor", desc.manufacturerName);
        obj->setProperty("category", desc.category);
        obj->setProperty("version", desc.version);
        obj->setProperty("format", desc.pluginFormatName);
        obj->setProperty("uid", desc.createIdentifierString());
        obj->setProperty("fileOrIdentifier", desc.fileOrIdentifier);
        obj->setProperty("isInstrument", desc.isInstrument);
        obj->setProperty("numInputs", desc.numInputChannels);
        obj->setProperty("numOutputs", desc.numOutputChannels);

        pluginArray.add(juce::var(obj));
    }

    return juce::var(pluginArray);
}

bool Vst3Scanner::validatePlugin(const juce::String& uid)
{
    for (const auto& desc : knownPluginList.getTypes())
    {
        if (desc.createIdentifierString() == uid ||
            desc.fileOrIdentifier == uid ||
            desc.name.equalsIgnoreCase(uid))
        {
            juce::String errorMessage;
            std::unique_ptr<juce::AudioPluginInstance> instance =
                formatManager.createPluginInstance(desc, 44100.0, 512, errorMessage);

            if (instance != nullptr)
            {
                // Plugin instantiated successfully
                return true;
            }

            return false;
        }
    }

    return false;
}
