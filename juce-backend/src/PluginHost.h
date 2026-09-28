#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_core/juce_core.h>

#include "Vst3Scanner.h"

/**
 * @class PluginEditorWindow
 * @brief A real OS window hosting a plugin's own editor UI.
 *
 * This is the window Diva or Zebra actually draws itself into. The previous
 * build faked this with hand-written HTML in an Electron window, which looked
 * like a plugin but was not connected to any audio.
 */
class PluginEditorWindow : public juce::DocumentWindow
{
public:
    /**
     * @brief Wraps a plugin's editor in a resizable desktop window.
     * @param title Window caption, normally the plugin name.
     * @param editor The plugin-created editor component. Takes ownership.
     * @param onClose Invoked when the user closes the window.
     */
    PluginEditorWindow(const juce::String& title,
                       juce::AudioProcessorEditor* editor,
                       std::function<void()> onClose);

    ~PluginEditorWindow() override;

    /** Routes the title-bar close button back to the host so it can drop the window. */
    void closeButtonPressed() override;

private:
    std::function<void()> onCloseCallback;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginEditorWindow)
};

/**
 * @class PluginHost
 * @brief Loads VST3 plugins, runs them through a live audio device, and shows
 *        their editors.
 *
 * This is the layer that did not exist. Vst3Scanner could find plugins and
 * confirm they instantiate, but nothing ever kept an instance alive, gave it
 * audio, or fed it MIDI, so no plugin could make a sound.
 *
 * The signal path is a JUCE AudioProcessorGraph:
 *
 *     MIDI input ─┐
 *                 ├─> plugin ─> audio output
 *     (host keys) ┘
 *
 * Instruments receive MIDI and are heard; effects sit between the input and the
 * output. Every loaded plugin gets a string id the UI uses to address it.
 */
class PluginHost
{
public:
    /**
     * @brief Builds the host graph. Does not open an audio device yet.
     * @param scanner Supplies the plugin format manager and the known-plugin list.
     * @param devices The ONE device manager, owned by AsioDriver. Plugins play
     *        through whatever asio.open selected (FlexASIO, the Yamaha, ...).
     *        Each class used to own its own manager, so asio.open opened a
     *        device nobody played through and plugins went to the Windows default.
     */
    PluginHost(Vst3Scanner& scanner, juce::AudioDeviceManager& devices);

    ~PluginHost();

    /**
     * @brief Opens the audio device and starts the graph running.
     *
     * Safe to call more than once; later calls are ignored while running.
     *
     * @param inputChannels Input channel count to request, usually 0.
     * @param outputChannels Output channel count to request, usually 2.
     * @return Empty string on success, otherwise the device error message.
     */
    juce::String startAudio(int inputChannels = 0, int outputChannels = 2);

    /** Stops the audio device and detaches the graph. */
    void stopAudio();

    /** @return true while the audio device is open and running. */
    bool isAudioRunning() const { return audioRunning; }

    /**
     * @brief Loads a plugin from a .vst3 path and connects it into the graph.
     * @param filePath Absolute path to the .vst3 bundle.
     * @param errorOut Receives a human-readable reason when loading fails.
     * @return The new instance id, or an empty string on failure.
     */
    juce::String loadPlugin(const juce::String& filePath, const juce::String& wantedName, juce::String& errorOut);

    /**
     * @brief Removes a plugin, closing its editor first.
     * @param instanceId Id returned by loadPlugin.
     * @return true if that instance existed.
     */
    bool unloadPlugin(const juce::String& instanceId);

    /**
     * @brief Opens the plugin's own editor in a desktop window.
     * @param instanceId Id returned by loadPlugin.
     * @param errorOut Receives a reason when the editor cannot be shown.
     * @return true if a window is now on screen.
     */
    bool showEditor(const juce::String& instanceId, juce::String& errorOut);

    /**
     * @brief Closes a plugin's editor window, leaving the plugin loaded and audible.
     * @param instanceId Id returned by loadPlugin.
     */
    void hideEditor(const juce::String& instanceId);

    /**
     * @brief Sends a note-on to a loaded instrument, for on-screen keyboards.
     * @param instanceId Target instance.
     * @param midiNote 0-127.
     * @param velocity 0-127.
     */
    void noteOn(const juce::String& instanceId, int midiNote, int velocity);

    /**
     * @brief Sends a note-off to a loaded instrument.
     * @param instanceId Target instance.
     * @param midiNote 0-127.
     */
    void noteOff(const juce::String& instanceId, int midiNote);

    /**
     * @brief Lists a plugin's automatable parameters.
     * @param instanceId Target instance.
     * @return Array of objects with index, name, value (0-1) and text.
     */
    juce::var getParameters(const juce::String& instanceId) const;

    /**
     * @brief Sets one parameter by index.
     * @param instanceId Target instance.
     * @param paramIndex Parameter index.
     * @param value Normalised 0-1.
     * @return true if the parameter existed.
     */
    bool setParameter(const juce::String& instanceId, int paramIndex, float value);

    /**
     * @brief Describes every currently loaded plugin.
     * @return Array of objects with id, name, format, isInstrument and editorOpen.
     */
    juce::var getLoadedPlugins() const;

    /**
     * @brief Names the audio devices available for output.
     * @return Object with the current device plus the available names.
     */
    juce::var getAudioStatus() const;

private:
    /** One loaded plugin: its graph node and its editor window, if open. */
    struct Instance
    {
        juce::AudioProcessorGraph::Node::Ptr        node;
        std::unique_ptr<PluginEditorWindow>         window;
        juce::String                                name;
        bool                                        isInstrument = false;
    };

    /** Wires a node between the MIDI input and the audio output. */
    void connectNode(juce::AudioProcessorGraph::Node::Ptr node, bool wantsMidi);

    /** Queues a MIDI message for delivery on the next audio block. */
    void postMidi(const juce::MidiMessage& message);

    Vst3Scanner&                                    scanner;
    juce::AudioDeviceManager&                       deviceManager;   // AsioDriver's
    juce::AudioProcessorGraph                       graph;
    juce::AudioProcessorPlayer                      player;

    juce::AudioProcessorGraph::Node::Ptr            midiInputNode;
    juce::AudioProcessorGraph::Node::Ptr            audioOutputNode;

    std::map<juce::String, std::unique_ptr<Instance>> instances;
    int                                             nextInstanceId = 1;
    bool                                            audioRunning = false;
    bool                                            openedDevice = false; // we opened it, so we close it

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginHost)
};
