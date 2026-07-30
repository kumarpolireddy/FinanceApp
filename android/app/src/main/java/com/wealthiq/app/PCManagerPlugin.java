package com.wealthiq.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.util.Random;

@CapacitorPlugin(name = "PCManager")
public class PCManagerPlugin extends Plugin {
    private PCManagerServer server;
    private int clientsCount = 0;
    private String activeIp = "";
    private int activePort = 8787;
    private String activePairingCode = "";

    @Override
    public void load() {
        server = new PCManagerServer(this);
    }

    @PluginMethod
    public void startServer(PluginCall call) {
        if (server.isRunning()) {
            JSObject ret = new JSObject();
            ret.put("ip", activeIp);
            ret.put("port", activePort);
            ret.put("pairingCode", activePairingCode);
            call.resolve(ret);
            return;
        }

        // Find local IP address
        activeIp = getLocalIpAddress();
        if (activeIp == null) {
            call.reject("Could not detect local Wi-Fi IP address. Please check your Wi-Fi connection.");
            return;
        }

        // Generate pairing code (6 digit random)
        Random random = new Random();
        activePairingCode = String.format("%06d", random.nextInt(1000000));
        activePort = 8787;
        clientsCount = 0;

        try {
            server.start(activePort, activePairingCode);
            JSObject ret = new JSObject();
            ret.put("ip", activeIp);
            ret.put("port", activePort);
            ret.put("pairingCode", activePairingCode);
            call.resolve(ret);
        } catch (IOException e) {
            call.reject("Failed to start server: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        if (server != null) {
            server.stop();
        }
        clientsCount = 0;
        activeIp = "";
        activePairingCode = "";
        call.resolve();
    }

    @PluginMethod
    public void getServerStatus(PluginCall call) {
        JSObject ret = new JSObject();
        boolean running = server != null && server.isRunning();
        ret.put("running", running);
        ret.put("ip", activeIp);
        ret.put("port", activePort);
        ret.put("pairingCode", activePairingCode);
        ret.put("clients", clientsCount);
        call.resolve(ret);
    }

    @PluginMethod
    public void submitResponse(PluginCall call) {
        String requestId = call.getString("requestId");
        Integer status = call.getInt("status");
        String body = call.getString("body");

        if (requestId == null || status == null || body == null) {
            call.reject("Missing required parameters: requestId, status, or body");
            return;
        }

        if (server == null) {
            call.reject("Server is not running");
            return;
        }

        PCManagerServer.RequestHolder holder = server.getRequest(requestId);
        if (holder != null) {
            holder.responseStatus = status;
            holder.responseBody = body;
            holder.latch.countDown();
            call.resolve();
        } else {
            call.reject("Request ID not found or already timed out: " + requestId);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (server != null) {
            server.stop();
        }
        super.handleOnDestroy();
    }

    public void notifyRequest(PCManagerServer.RequestHolder holder) {
        JSObject event = new JSObject();
        event.put("requestId", holder.requestId);
        event.put("method", holder.method);
        event.put("path", holder.path);
        event.put("query", holder.query);
        event.put("body", holder.body);
        notifyListeners("onRequest", event);
    }

    public void incrementClients() {
        clientsCount++;
    }

    private String getLocalIpAddress() {
        try {
            // Check WiFi interface first
            java.util.List<java.net.NetworkInterface> interfaces = java.util.Collections.list(java.net.NetworkInterface.getNetworkInterfaces());

            // Prioritize wlan0 or similar Wi-Fi interfaces
            for (java.net.NetworkInterface intf : interfaces) {
                if (intf.getName().toLowerCase().contains("wlan") || intf.getName().toLowerCase().contains("eth")) {
                    for (java.net.InetAddress addr : java.util.Collections.list(intf.getInetAddresses())) {
                        if (!addr.isLoopbackAddress() && addr instanceof java.net.Inet4Address) {
                            return addr.getHostAddress();
                        }
                    }
                }
            }

            // Fallback to any non-loopback IPv4 address
            for (java.net.NetworkInterface intf : interfaces) {
                for (java.net.InetAddress addr : java.util.Collections.list(intf.getInetAddresses())) {
                    if (!addr.isLoopbackAddress() && addr instanceof java.net.Inet4Address) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception e) {
            // ignore
        }
        return null;
    }
}
