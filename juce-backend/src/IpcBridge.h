#pragma once

#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>
#include "AsioDriver.h"
#include "Vst3Scanner.h"

/**
 * @class IpcBridge
 * @brief Bidirectional JSON-over-stdio IPC bridge for Lyricist Engine.
 *
 * Runs a dedicated background thread reading newline-delimited JSON-RPC requests
 * from standard input (stdin), dispatches commands to AsioDriver and Vst3Scanner,
 * and writes JSON responses to standard output (stdout).
 */
class IpcBridge : private juce::Thread
{
public:
    /**
     * @brief Constructs the IPC bridge with references to audio and plugin subsystems.
     * @param asio Reference to the active ASIO driver manager.
     * @param vst3 Reference to the active VST3 scanner.
     */
    IpcBridge(AsioDriver& asio, Vst3Scanner& vst3);

    /**
     * @brief Destructor stopping the worker thread before destruction.
     */
    ~IpcBridge() override;

    /**
     * @brief Begins reading commands from standard input on a background thread.
     */
    void start();

    /**
     * @brief Stops the background reader thread and terminates stdio processing.
     */
    void stop();

private:
    /**
     * @brief Thread execution entry point continuously reading stdin lines.
     */
    void run() override;

    /**
     * @brief Parses and dispatches a JSON command string.
     * @param line Raw JSON string read from standard input.
     */
    void processCommand(const juce::String& line);

    /**
     * @brief Formats and writes a JSON response to standard output in a thread-safe manner.
     * @param response JSON-serializable juce::var object.
     */
    void sendResponse(const juce::var& response);

    AsioDriver&            asioDriver;
    Vst3Scanner&           vst3Scanner;
    juce::CriticalSection  outputLock;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(IpcBridge)
};
