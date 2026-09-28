#include "PluginHost.h"

using namespace juce;

//==============================================================================
// PluginEditorWindow

PluginEditorWindow::PluginEditorWindow(const String& title,
                                       AudioProcessorEditor* editor,
                                       std::function<void()> onClose)
    : DocumentWindow(title,
                     Colours::black,
                     DocumentWindow::closeButton | DocumentWindow::minimiseButton),
      onCloseCallback(std::move(onClose))
{
    setUsingNativeTitleBar(true);

    // The editor owns its own size. Some plugins are resizable and some are
    // fixed, so mirror whatever the editor reports rather than forcing a size.
    setContentOwned(editor, true);
    setResizable(editor != nullptr && editor->isResizable(), false);

    centreWithSize(getWidth(), getHeight());
    setVisible(true);
    toFront(true);
}

PluginEditorWindow::~PluginEditorWindow()
{
    // Drop the editor before the window dies: the plugin must tear its own UI
    // down while its processor is still alive, or it can crash on exit.
    clearContentComponent();
}

void PluginEditorWindow::closeButtonPressed()
{
    if (onCloseCallback)
        onCloseCallback();
}

//==============================================================================
// PluginHost

PluginHost::PluginHost(Vst3Scanner& scannerToUse, AudioDeviceManager& devices)
    : scanner(scannerToUse), deviceManager(devices)
{
    // Endpoints are permanent members of the graph; plugins are inserted
    // between them as they load.
    using IOProcessor = AudioProcessorGraph::AudioGraphIOProcessor;

    midiInputNode = graph.addNode(
        std::make_unique<IOProcessor>(IOProcessor::midiInputNode));

    audioOutputNode = graph.addNode(
        std::make_unique<IOProcessor>(IOProcessor::audioOutputNode));
}

PluginHost::~PluginHost()
{
    // Editors must close before their processors are destroyed.
    for (auto& pair : instances)
        pair.second->window.reset();

    instances.clear();
    stopAudio();
    graph.clear();
}

String PluginHost::startAudio(int inputChannels, int outputChannels)
{
    if (audioRunning)
        return {};

    // If asio.open already chose a device, play through it. Only fall back to
    // the system default when nothing is open yet.
    openedDevice = false;
    if (deviceManager.getCurrentAudioDevice() == nullptr)
    {
        const String error = deviceManager.initialise(inputChannels, outputChannels,
                                                      nullptr, true);
        if (error.isNotEmpty())
            return error;
        openedDevice = true;
    }

    // Prepare the graph to match the device before any audio flows.
    if (auto* device = deviceManager.getCurrentAudioDevice())
    {
        graph.setPlayConfigDetails(inputChannels,
                                   outputChannels,
                                   device->getCurrentSampleRate(),
                                   device->getCurrentBufferSizeSamples());
    }

    player.setProcessor(&graph);
    deviceManager.addAudioCallback(&player);

    // Open every MIDI input we can see and route it into the player, so a
    // controller plugged in before launch just works.
    for (const auto& input : MidiInput::getAvailableDevices())
    {
        deviceManager.setMidiInputDeviceEnabled(input.identifier, true);
        deviceManager.addMidiInputDeviceCallback(input.identifier, &player);
    }

    audioRunning = true;
    return {};
}

void PluginHost::stopAudio()
{
    if (! audioRunning)
        return;

    for (const auto& input : MidiInput::getAvailableDevices())
        deviceManager.removeMidiInputDeviceCallback(input.identifier, &player);

    deviceManager.removeAudioCallback(&player);
    player.setProcessor(nullptr);
    // A device asio.open chose stays open for the next audio.start.
    if (openedDevice)
        deviceManager.closeAudioDevice();
    openedDevice = false;

    audioRunning = false;
}

void PluginHost::connectNode(AudioProcessorGraph::Node::Ptr node, bool wantsMidi)
{
    if (node == nullptr)
        return;

    // Audio out: mono plugins feed both speakers, otherwise channel for channel.
    const int nodeOutputs = node->getProcessor()->getTotalNumOutputChannels();

    for (int channel = 0; channel < 2; ++channel)
    {
        const int source = nodeOutputs > 1 ? channel : 0;
        if (source < nodeOutputs)
        {
            graph.addConnection({ { node->nodeID, source },
                                  { audioOutputNode->nodeID, channel } });
        }
    }

    if (wantsMidi)
    {
        graph.addConnection({ { midiInputNode->nodeID, AudioProcessorGraph::midiChannelIndex },
                              { node->nodeID,          AudioProcessorGraph::midiChannelIndex } });
    }
}

String PluginHost::loadPlugin(const String& filePath, String& errorOut)
{
    const File file(filePath);
    if (! file.exists())
    {
        errorOut = "That plugin file is not on disk: " + filePath;
        return {};
    }

    auto& formatManager = scanner.getFormatManager();

    // Ask every registered format to describe what is in this bundle. A single
    // .vst3 can hold more than one plugin, so take the first entry.
    OwnedArray<PluginDescription> found;
    for (int i = 0; i < formatManager.getNumFormats(); ++i)
    {
        auto* format = formatManager.getFormat(i);
        if (format->fileMightContainThisPluginType(filePath))
            format->findAllTypesForFile(found, filePath);

        if (! found.isEmpty())
            break;
    }

    if (found.isEmpty())
    {
        errorOut = "No VST3 plugin could be read from " + file.getFileName()
                 + ". It may be 32-bit, or a different format.";
        return {};
    }

    const double sampleRate = audioRunning && deviceManager.getCurrentAudioDevice() != nullptr
                            ? deviceManager.getCurrentAudioDevice()->getCurrentSampleRate()
                            : 44100.0;
    const int blockSize = audioRunning && deviceManager.getCurrentAudioDevice() != nullptr
                        ? deviceManager.getCurrentAudioDevice()->getCurrentBufferSizeSamples()
                        : 512;

    String createError;
    std::unique_ptr<AudioPluginInstance> plugin(
        formatManager.createPluginInstance(*found[0], sampleRate, blockSize, createError));

    if (plugin == nullptr)
    {
        errorOut = createError.isNotEmpty() ? createError
                                            : "The plugin refused to load.";
        return {};
    }

    const bool isInstrument = plugin->acceptsMidi() || found[0]->isInstrument;
    const String pluginName = plugin->getName();

    plugin->enableAllBuses();
    plugin->prepareToPlay(sampleRate, blockSize);

    auto node = graph.addNode(std::move(plugin));
    if (node == nullptr)
    {
        errorOut = "The graph would not accept that plugin.";
        return {};
    }

    connectNode(node, isInstrument);

    auto instance = std::make_unique<Instance>();
    instance->node = node;
    instance->name = pluginName;
    instance->isInstrument = isInstrument;

    const String instanceId = "plugin-" + String(nextInstanceId++);
    instances[instanceId] = std::move(instance);

    return instanceId;
}

bool PluginHost::unloadPlugin(const String& instanceId)
{
    auto it = instances.find(instanceId);
    if (it == instances.end())
        return false;

    // Window first, then the node: the editor must not outlive its processor.
    it->second->window.reset();

    if (it->second->node != nullptr)
        graph.removeNode(it->second->node->nodeID);

    instances.erase(it);
    return true;
}

bool PluginHost::showEditor(const String& instanceId, String& errorOut)
{
    auto it = instances.find(instanceId);
    if (it == instances.end())
    {
        errorOut = "No plugin is loaded under id " + instanceId + ".";
        return false;
    }

    auto& instance = *it->second;

    if (instance.window != nullptr)
    {
        instance.window->toFront(true);
        return true;
    }

    auto* processor = instance.node->getProcessor();
    if (processor == nullptr || ! processor->hasEditor())
    {
        errorOut = instance.name + " does not provide its own interface.";
        return false;
    }

    auto* editor = processor->createEditorIfNeeded();
    if (editor == nullptr)
    {
        errorOut = instance.name + " failed to open its interface.";
        return false;
    }

    // Capture the id by value: the callback outlives this scope.
    const String idCopy = instanceId;
    instance.window = std::make_unique<PluginEditorWindow>(
        instance.name,
        editor,
        [this, idCopy] { hideEditor(idCopy); });

    return true;
}

void PluginHost::hideEditor(const String& instanceId)
{
    auto it = instances.find(instanceId);
    if (it != instances.end())
        it->second->window.reset();
}

void PluginHost::postMidi(const MidiMessage& message)
{
    // The player owns the keyboard state that merges host-generated notes into
    // the same stream as the hardware MIDI input.
    player.getMidiMessageCollector().addMessageToQueue(message);
}

void PluginHost::noteOn(const String& instanceId, int midiNote, int velocity)
{
    if (instances.find(instanceId) == instances.end())
        return;

    postMidi(MidiMessage::noteOn(1, midiNote, (uint8) jlimit(0, 127, velocity)));
}

void PluginHost::noteOff(const String& instanceId, int midiNote)
{
    if (instances.find(instanceId) == instances.end())
        return;

    postMidi(MidiMessage::noteOff(1, midiNote));
}

var PluginHost::getParameters(const String& instanceId) const
{
    Array<var> list;

    auto it = instances.find(instanceId);
    if (it == instances.end())
        return list;

    auto* processor = it->second->node->getProcessor();
    if (processor == nullptr)
        return list;

    const auto& parameters = processor->getParameters();
    for (int i = 0; i < parameters.size(); ++i)
    {
        auto* parameter = parameters[i];
        auto* entry = new DynamicObject();
        entry->setProperty("index", i);
        entry->setProperty("name", parameter->getName(64));
        entry->setProperty("value", parameter->getValue());
        entry->setProperty("text", parameter->getCurrentValueAsText());
        list.add(var(entry));
    }

    return list;
}

bool PluginHost::setParameter(const String& instanceId, int paramIndex, float value)
{
    auto it = instances.find(instanceId);
    if (it == instances.end())
        return false;

    auto* processor = it->second->node->getProcessor();
    if (processor == nullptr)
        return false;

    const auto& parameters = processor->getParameters();
    if (! isPositiveAndBelow(paramIndex, parameters.size()))
        return false;

    parameters[paramIndex]->setValueNotifyingHost(jlimit(0.0f, 1.0f, value));
    return true;
}

var PluginHost::getLoadedPlugins() const
{
    Array<var> list;

    for (const auto& pair : instances)
    {
        auto* entry = new DynamicObject();
        entry->setProperty("id", pair.first);
        entry->setProperty("name", pair.second->name);
        entry->setProperty("isInstrument", pair.second->isInstrument);
        entry->setProperty("editorOpen", pair.second->window != nullptr);
        list.add(var(entry));
    }

    return list;
}

var PluginHost::getAudioStatus() const
{
    auto* status = new DynamicObject();
    status->setProperty("running", audioRunning);

    if (auto* device = deviceManager.getCurrentAudioDevice())
    {
        status->setProperty("device", device->getName());
        status->setProperty("sampleRate", device->getCurrentSampleRate());
        status->setProperty("bufferSize", device->getCurrentBufferSizeSamples());
    }

    Array<var> midiInputs;
    for (const auto& input : MidiInput::getAvailableDevices())
        midiInputs.add(input.name);
    status->setProperty("midiInputs", midiInputs);

    return var(status);
}
