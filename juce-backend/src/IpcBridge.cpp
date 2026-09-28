/**
 * @file IpcBridge.cpp
 * @brief Implementation of the stdio JSON IPC bridge for Lyricist Engine.
 */

#include "IpcBridge.h"
#include <iostream>
#include <string>

IpcBridge::IpcBridge(AsioDriver& asio, Vst3Scanner& vst3, PluginHost& host)
    : juce::Thread("LyricistIpcBridgeThread"),
      asioDriver(asio),
      vst3Scanner(vst3),
      pluginHost(host)
{
}

IpcBridge::~IpcBridge()
{
    stop();
}

void IpcBridge::start()
{
    startThread(juce::Thread::Priority::normal);
}

void IpcBridge::stop()
{
    signalThreadShouldExit();
    stopThread(2000);
}

void IpcBridge::run()
{
    std::string line;
    while (!threadShouldExit())
    {
        if (std::getline(std::cin, line))
        {
            juce::String trimmed = juce::String::fromUTF8(line.data(), static_cast<int>(line.size())).trim();
            if (trimmed.isNotEmpty())
            {
                processCommand(trimmed);
            }
        }
        else
        {
            // End-of-file reached on stdin (e.g. host process disconnected)
            if (!threadShouldExit())
            {
                juce::MessageManager::callAsync([]() {
                    juce::JUCEApplicationBase::quit();
                });
            }
            break;
        }
    }
}

void IpcBridge::processCommand(const juce::String& line)
{
    auto json = juce::JSON::parse(line);

    if (!json.isObject())
    {
        auto* errObj = new juce::DynamicObject();
        errObj->setProperty("code", -32700);
        errObj->setProperty("message", "Parse error: invalid JSON payload");

        auto* resp = new juce::DynamicObject();
        resp->setProperty("id", juce::var());
        resp->setProperty("error", juce::var(errObj));
        sendResponse(juce::var(resp));
        return;
    }

    auto* root = json.getDynamicObject();
    if (root == nullptr)
        return;

    const juce::var reqId = root->getProperty("id");
    const juce::String method = root->getProperty("method").toString();
    const juce::var params = root->getProperty("params");

    if (method == "asio.enumerate")
    {
        const auto drivers = asioDriver.enumerateDrivers();
        juce::Array<juce::var> driverList;
        for (const auto& d : drivers)
        {
            driverList.add(d);
        }

        auto* res = new juce::DynamicObject();
        res->setProperty("drivers", juce::var(driverList));

        auto* resp = new juce::DynamicObject();
        resp->setProperty("id", reqId);
        resp->setProperty("result", juce::var(res));
        sendResponse(juce::var(resp));
    }
    else if (method == "asio.open")
    {
        juce::String name;
        double sampleRate = 0.0;
        int bufferSize = 0;

        if (params.isObject())
        {
            auto* pObj = params.getDynamicObject();
            name = pObj->getProperty("name").toString();
            sampleRate = static_cast<double>(pObj->getProperty("sampleRate"));
            bufferSize = static_cast<int>(pObj->getProperty("bufferSize"));
        }

        bool success = asioDriver.openDriver(name, sampleRate, bufferSize);

        auto* res = new juce::DynamicObject();
        res->setProperty("success", success);
        res->setProperty("status", asioDriver.getStatus());

        auto* resp = new juce::DynamicObject();
        resp->setProperty("id", reqId);
        resp->setProperty("result", juce::var(res));
        sendResponse(juce::var(resp));
    }
    else if (method == "asio.close")
    {
        // Plugins play through this same device now, so stop them cleanly
        // before it goes away rather than leave the player on a dead device.
        pluginHost.stopAudio();
        asioDriver.closeDriver();

        auto* res = new juce::DynamicObject();
        res->setProperty("success", true);

        auto* resp = new juce::DynamicObject();
        resp->setProperty("id", reqId);
        resp->setProperty("result", juce::var(res));
        sendResponse(juce::var(resp));
    }
    else if (method == "asio.status")
    {
        auto status = asioDriver.getStatus();

        auto* resp = new juce::DynamicObject();
        resp->setProperty("id", reqId);
        resp->setProperty("result", status);
        sendResponse(juce::var(resp));
    }
    else if (method == "vst3.scan")
    {
        juce::StringArray paths;

        if (params.isObject())
        {
            auto* pObj = params.getDynamicObject();
            auto pathsVar = pObj->getProperty("paths");
            if (pathsVar.isArray())
            {
                for (const auto& p : *pathsVar.getArray())
                {
                    paths.add(p.toString());
                }
            }
            else if (pObj->hasProperty("path"))
            {
                paths.add(pObj->getProperty("path").toString());
            }
        }
        else if (params.isArray())
        {
            for (const auto& p : *params.getArray())
            {
                paths.add(p.toString());
            }
        }

        vst3Scanner.scanPaths(paths);

        auto* res = new juce::DynamicObject();
        res->setProperty("success", true);
        res->setProperty("count", vst3Scanner.getKnownPluginList().getNumTypes());

        auto* resp = new juce::DynamicObject();
        resp->setProperty("id", reqId);
        resp->setProperty("result", juce::var(res));
        sendResponse(juce::var(resp));
    }
    else if (method == "vst3.list")
    {
        auto plugins = vst3Scanner.getPluginList();

        auto* res = new juce::DynamicObject();
        res->setProperty("plugins", plugins);

        auto* resp = new juce::DynamicObject();
        resp->setProperty("id", reqId);
        resp->setProperty("result", juce::var(res));
        sendResponse(juce::var(resp));
    }
    else if (method == "vst3.validate")
    {
        juce::String uid;

        if (params.isObject())
        {
            auto* pObj = params.getDynamicObject();
            uid = pObj->getProperty("uid").toString();
            if (uid.isEmpty())
            {
                uid = pObj->getProperty("fileOrIdentifier").toString();
            }
        }
        else if (params.isString())
        {
            uid = params.toString();
        }

        bool valid = vst3Scanner.validatePlugin(uid);

        auto* res = new juce::DynamicObject();
        res->setProperty("valid", valid);
        res->setProperty("uid", uid);

        auto* resp = new juce::DynamicObject();
        resp->setProperty("id", reqId);
        resp->setProperty("result", juce::var(res));
        sendResponse(juce::var(resp));
    }
    else if (method.startsWith("plugin.") || method.startsWith("audio."))
    {
        // Plugin work touches editors and the graph, so it must happen on the
        // message thread. The IPC reader runs on its own thread, so hop across
        // and wait for the result before replying.
        juce::var resultVar;
        juce::String errorText;

        auto* pObj = params.isObject() ? params.getDynamicObject() : nullptr;
        const juce::String instanceId = pObj != nullptr ? pObj->getProperty("id").toString() : juce::String();

        {
            const juce::MessageManagerLock lock;
            if (lock.lockWasGained())
            {
                if (method == "plugin.load")
                {
                    const juce::String path = pObj != nullptr ? pObj->getProperty("path").toString() : juce::String();
                    const juce::String newId = pluginHost.loadPlugin(path, errorText);
                    if (newId.isNotEmpty())
                    {
                        auto* res = new juce::DynamicObject();
                        res->setProperty("id", newId);
                        res->setProperty("loaded", pluginHost.getLoadedPlugins());
                        resultVar = juce::var(res);
                    }
                }
                else if (method == "plugin.unload")
                {
                    auto* res = new juce::DynamicObject();
                    res->setProperty("removed", pluginHost.unloadPlugin(instanceId));
                    resultVar = juce::var(res);
                }
                else if (method == "plugin.showEditor")
                {
                    const bool shown = pluginHost.showEditor(instanceId, errorText);
                    if (shown)
                    {
                        auto* res = new juce::DynamicObject();
                        res->setProperty("shown", true);
                        resultVar = juce::var(res);
                    }
                }
                else if (method == "plugin.hideEditor")
                {
                    pluginHost.hideEditor(instanceId);
                    auto* res = new juce::DynamicObject();
                    res->setProperty("hidden", true);
                    resultVar = juce::var(res);
                }
                else if (method == "plugin.list")
                {
                    auto* res = new juce::DynamicObject();
                    res->setProperty("plugins", pluginHost.getLoadedPlugins());
                    resultVar = juce::var(res);
                }
                else if (method == "plugin.noteOn")
                {
                    pluginHost.noteOn(instanceId,
                                      (int) pObj->getProperty("note"),
                                      pObj->hasProperty("velocity") ? (int) pObj->getProperty("velocity") : 100);
                    auto* res = new juce::DynamicObject();
                    res->setProperty("ok", true);
                    resultVar = juce::var(res);
                }
                else if (method == "plugin.noteOff")
                {
                    pluginHost.noteOff(instanceId, (int) pObj->getProperty("note"));
                    auto* res = new juce::DynamicObject();
                    res->setProperty("ok", true);
                    resultVar = juce::var(res);
                }
                else if (method == "plugin.getParams")
                {
                    auto* res = new juce::DynamicObject();
                    res->setProperty("params", pluginHost.getParameters(instanceId));
                    resultVar = juce::var(res);
                }
                else if (method == "plugin.setParam")
                {
                    auto* res = new juce::DynamicObject();
                    res->setProperty("ok", pluginHost.setParameter(instanceId,
                                                                   (int) pObj->getProperty("index"),
                                                                   (float) (double) pObj->getProperty("value")));
                    resultVar = juce::var(res);
                }
                else if (method == "audio.start")
                {
                    errorText = pluginHost.startAudio();
                    if (errorText.isEmpty())
                        resultVar = pluginHost.getAudioStatus();
                }
                else if (method == "audio.stop")
                {
                    pluginHost.stopAudio();
                    resultVar = pluginHost.getAudioStatus();
                }
                else if (method == "audio.status")
                {
                    resultVar = pluginHost.getAudioStatus();
                }
                else
                {
                    errorText = "Unknown method: " + method;
                }
            }
            else
            {
                errorText = "Could not reach the message thread.";
            }
        }

        auto* resp = new juce::DynamicObject();
        resp->setProperty("id", reqId);
        if (resultVar.isVoid())
        {
            auto* err = new juce::DynamicObject();
            err->setProperty("message", errorText.isNotEmpty() ? errorText : juce::String("The command failed."));
            resp->setProperty("error", juce::var(err));
        }
        else
        {
            resp->setProperty("result", resultVar);
        }
        sendResponse(juce::var(resp));
    }
    else if (method == "engine.ping")
    {
        auto* res = new juce::DynamicObject();
        res->setProperty("status", "ok");
        res->setProperty("version", "4.2.0");

        auto* resp = new juce::DynamicObject();
        resp->setProperty("id", reqId);
        resp->setProperty("result", juce::var(res));
        sendResponse(juce::var(resp));
    }
    else if (method == "engine.quit")
    {
        auto* res = new juce::DynamicObject();
        res->setProperty("status", "quitting");

        auto* resp = new juce::DynamicObject();
        resp->setProperty("id", reqId);
        resp->setProperty("result", juce::var(res));
        sendResponse(juce::var(resp));

        juce::MessageManager::callAsync([]() {
            juce::JUCEApplicationBase::quit();
        });
    }
    else
    {
        auto* errObj = new juce::DynamicObject();
        errObj->setProperty("code", -32601);
        errObj->setProperty("message", "Method not found: " + method);

        auto* resp = new juce::DynamicObject();
        resp->setProperty("id", reqId);
        resp->setProperty("error", juce::var(errObj));
        sendResponse(juce::var(resp));
    }
}

void IpcBridge::sendResponse(const juce::var& response)
{
    const juce::ScopedLock sl(outputLock);
    // Use singleLine=true to guarantee newline-delimited JSON
    juce::String jsonString = juce::JSON::toString(response, true);
    std::cout << jsonString.toRawUTF8() << "\n";
    std::cout.flush();
}
