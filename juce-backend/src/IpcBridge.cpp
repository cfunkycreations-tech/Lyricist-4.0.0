/**
 * @file IpcBridge.cpp
 * @brief Implementation of the stdio JSON IPC bridge for Lyricist Engine.
 */

#include "IpcBridge.h"
#include <iostream>
#include <string>

IpcBridge::IpcBridge(AsioDriver& asio, Vst3Scanner& vst3)
    : juce::Thread("LyricistIpcBridgeThread"),
      asioDriver(asio),
      vst3Scanner(vst3)
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
