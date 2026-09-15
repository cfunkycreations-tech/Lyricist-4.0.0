/**
 * @file Main.cpp
 * @brief JUCE console application entry point for Lyricist Engine 4.2.0 Pro.
 *
 * Initialises JUCEApplicationBase, creates the IPC bridge, ASIO driver manager,
 * and VST3 scanner. Runs the JUCE message loop while the IPC bridge processes
 * JSON-RPC commands received via standard input.
 */

#include <JuceHeader.h>
#include "IpcBridge.h"
#include "AsioDriver.h"
#include "Vst3Scanner.h"
#include "PluginHost.h"

/**
 * @class LyricistEngineApp
 * @brief Headless application instance managing the lifecycle of Lyricist Engine subsystems.
 */
class LyricistEngineApp : public juce::JUCEApplicationBase
{
public:
    LyricistEngineApp() = default;
    ~LyricistEngineApp() override = default;

    const juce::String getApplicationName() override    { return "LyricistEngine"; }
    const juce::String getApplicationVersion() override { return "4.2.0"; }
    bool moreThanOneInstanceAllowed() override          { return false; }

    void initialise(const juce::String& /*cmdLine*/) override
    {
        // Initialise core subsystems
        asioDriver = std::make_unique<AsioDriver>();
        vst3Scanner = std::make_unique<Vst3Scanner>();
        pluginHost = std::make_unique<PluginHost>(*vst3Scanner);
        ipcBridge = std::make_unique<IpcBridge>(*asioDriver, *vst3Scanner, *pluginHost);

        // Start listening for JSON-RPC commands on stdin
        ipcBridge->start();
    }

    void shutdown() override
    {
        // Teardown subsystems in reverse dependency order
        ipcBridge.reset();
        pluginHost.reset();
        vst3Scanner.reset();
        asioDriver.reset();
    }

    void anotherInstanceStarted(const juce::String& /*cmdLine*/) override {}

    void systemRequestedQuit() override
    {
        quit();
    }

    // Pure virtual on JUCEApplicationBase (JUCEApplication supplies defaults, this
    // class does not derive from it). Without both, LyricistEngineApp stays abstract
    // and START_JUCE_APPLICATION fails with C2259. The engine is a background audio
    // host with no app-lifecycle work to do on suspend/resume, so these are no-ops.
    void suspended() override {}
    void resumed() override {}

    void unhandledException(const std::exception* /*e*/,
                            const juce::String& /*sourceFilename*/,
                            int /*lineNumber*/) override
    {
        // Fail-safe handler for unhandled exceptions in the engine loop
    }

private:
    std::unique_ptr<AsioDriver>  asioDriver;
    std::unique_ptr<Vst3Scanner> vst3Scanner;
    std::unique_ptr<PluginHost>  pluginHost;
    std::unique_ptr<IpcBridge>   ipcBridge;
};

START_JUCE_APPLICATION(LyricistEngineApp)
