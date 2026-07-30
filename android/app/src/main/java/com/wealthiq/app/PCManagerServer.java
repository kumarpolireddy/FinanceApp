package com.wealthiq.app;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class PCManagerServer {
    private final PCManagerPlugin plugin;
    private ServerSocket serverSocket;
    private ExecutorService threadPool;
    private boolean running = false;
    private int port;
    private String pairingCode;
    private String sessionToken = null;
    
    private final Map<String, RequestHolder> activeRequests = new ConcurrentHashMap<>();

    public PCManagerServer(PCManagerPlugin plugin) {
        this.plugin = plugin;
    }

    public synchronized void start(int port, String pairingCode) throws IOException {
        if (running) {
            stop();
        }
        this.port = port;
        this.pairingCode = pairingCode;
        this.sessionToken = null;
        this.threadPool = Executors.newCachedThreadPool();
        this.serverSocket = new ServerSocket(port);
        this.running = true;

        threadPool.execute(new Runnable() {
            @Override
            public void run() {
                while (running && !serverSocket.isClosed()) {
                    try {
                        final Socket clientSocket = serverSocket.accept();
                        threadPool.execute(new Runnable() {
                            @Override
                            public void run() {
                                handleClient(clientSocket);
                            }
                        });
                    } catch (IOException e) {
                        // socket closed or error
                    }
                }
            }
        });
    }

    public synchronized void stop() {
        this.running = false;
        this.sessionToken = null;
        if (serverSocket != null) {
            try {
                serverSocket.close();
            } catch (IOException e) {
                // ignore
            }
            serverSocket = null;
        }
        if (threadPool != null) {
            threadPool.shutdownNow();
            threadPool = null;
        }
        activeRequests.clear();
    }

    public boolean isRunning() {
        return running;
    }

    public RequestHolder getRequest(String requestId) {
        return activeRequests.get(requestId);
    }

    private void handleClient(Socket socket) {
        try (
            InputStream is = socket.getInputStream();
            OutputStream os = socket.getOutputStream()
        ) {
            // Read request line
            String reqLine = readLine(is);
            if (reqLine == null || reqLine.trim().isEmpty()) {
                return;
            }

            String[] parts = reqLine.split(" ");
            if (parts.length < 2) {
                sendErrorResponse(os, 400, "Bad Request", "Invalid request line");
                return;
            }

            String method = parts[0];
            String rawPath = parts[1];

            // Parse path and query
            String path = rawPath;
            String query = "";
            int qIdx = rawPath.indexOf('?');
            if (qIdx != -1) {
                path = rawPath.substring(0, qIdx);
                query = rawPath.substring(qIdx + 1);
            }

            // Parse headers
            Map<String, String> headers = new HashMap<>();
            int contentLength = 0;
            String authHeader = null;

            String line;
            while ((line = readLine(is)) != null && !line.isEmpty()) {
                int colonIdx = line.indexOf(':');
                if (colonIdx != -1) {
                    String key = line.substring(0, colonIdx).trim().toLowerCase();
                    String value = line.substring(colonIdx + 1).trim();
                    headers.put(key, value);

                    if (key.equals("content-length")) {
                        try {
                            contentLength = Integer.parseInt(value);
                        } catch (NumberFormatException e) {
                            // ignore
                        }
                    } else if (key.equals("authorization")) {
                        authHeader = value;
                    }
                }
            }

            // Enforce request body size limit (1MB max)
            if (contentLength > 1024 * 1024) {
                sendErrorResponse(os, 413, "Payload Too Large", "Payload limit exceeded (1MB)");
                return;
            }

            // Read body
            String body = "";
            if (contentLength > 0) {
                byte[] bodyBytes = new byte[contentLength];
                int totalRead = 0;
                while (totalRead < contentLength) {
                    int read = is.read(bodyBytes, totalRead, contentLength - totalRead);
                    if (read == -1) break;
                    totalRead += read;
                }
                body = new String(bodyBytes, 0, totalRead, "UTF-8");
            }

            // Route validation - strictly allowlisted routes to ensure security
            boolean isAllowedStatic = path.equals("/") || path.equals("/index.html") || path.equals("/app.js") || path.equals("/style.css");
            boolean isAllowedApi = path.equals("/api/status") || 
                                   path.equals("/api/auth/pair") || 
                                   path.equals("/api/accounts") || 
                                   path.equals("/api/categories") || 
                                   path.equals("/api/transactions") || 
                                   path.startsWith("/api/transactions/") || 
                                   path.equals("/api/dashboard") || 
                                   path.equals("/api/summary") ||
                                   path.equals("/api/export");

            if (!isAllowedStatic && !isAllowedApi) {
                sendErrorResponse(os, 404, "Not Found", "Resource not found");
                return;
            }

            // Directory traversal prevention
            if (path.contains("..") || path.contains("//")) {
                sendErrorResponse(os, 400, "Bad Request", "Invalid path format");
                return;
            }

            // Handle Static Files from Assets
            if (isAllowedStatic) {
                String assetPath = "public/pc" + path;
                if (path.equals("/") || path.equals("/index.html")) {
                    assetPath = "public/pc/index.html";
                }
                sendStaticFile(os, assetPath);
                return;
            }

            // API: Status (public)
            if (path.equals("/api/status")) {
                String statusJson = "{\"success\":true,\"data\":{\"running\":" + running + "}}";
                sendSuccessResponse(os, 200, statusJson, null);
                return;
            }

            // API: Pairing (public code validation)
            if (path.equals("/api/auth/pair")) {
                if (!method.equalsIgnoreCase("POST")) {
                    sendErrorResponse(os, 405, "Method Not Allowed", "POST required");
                    return;
                }

                // Extract code from json manual parse: e.g. {"code":"123456"}
                String code = "";
                int startIdx = body.indexOf("\"code\":\"");
                if (startIdx != -1) {
                    int endIdx = body.indexOf("\"", startIdx + 8);
                    if (endIdx != -1) {
                        code = body.substring(startIdx + 8, endIdx);
                    }
                } else {
                    startIdx = body.indexOf("\"code\":");
                    if (startIdx != -1) {
                        int endIdx = body.indexOf("}", startIdx + 7);
                        if (endIdx != -1) {
                            code = body.substring(startIdx + 7, endIdx).trim().replace("\"", "");
                        }
                    }
                }

                if (code.equals(pairingCode)) {
                    sessionToken = UUID.randomUUID().toString();
                    String resJson = "{\"success\":true,\"data\":{\"token\":\"" + sessionToken + "\"}}";
                    sendSuccessResponse(os, 200, resJson, null);
                    plugin.incrementClients();
                } else {
                    sendErrorResponse(os, 401, "Unauthorized", "Invalid pairing code");
                }
                return;
            }

            // API Security: Check session token for all other API endpoints
            if (sessionToken == null || authHeader == null || !authHeader.equals("Bearer " + sessionToken)) {
                sendErrorResponse(os, 401, "Unauthorized", "Authentication required");
                return;
            }

            // Relay Request to WebView (JS Layer)
            String requestId = UUID.randomUUID().toString();
            RequestHolder holder = new RequestHolder(requestId, method, path, query, body);
            activeRequests.put(requestId, holder);

            plugin.notifyRequest(holder);

            // Wait for JS response
            try {
                if (!holder.latch.await(15, TimeUnit.SECONDS)) {
                    activeRequests.remove(requestId);
                    sendErrorResponse(os, 504, "Gateway Timeout", "App WebView did not respond in time");
                    return;
                }
            } catch (InterruptedException e) {
                activeRequests.remove(requestId);
                sendErrorResponse(os, 500, "Internal Server Error", "Request interrupted");
                return;
            }

            activeRequests.remove(requestId);
            sendSuccessResponse(os, holder.responseStatus, holder.responseBody, holder.responseHeaders);

        } catch (IOException e) {
            // connection dropped
        } finally {
            try {
                socket.close();
            } catch (IOException e) {
                // ignore
            }
        }
    }

    private void sendStaticFile(OutputStream os, String assetPath) throws IOException {
        try {
            InputStream is = plugin.getContext().getAssets().open(assetPath);

            String contentType = "text/html; charset=utf-8";
            if (assetPath.endsWith(".js")) {
                contentType = "application/javascript; charset=utf-8";
            } else if (assetPath.endsWith(".css")) {
                contentType = "text/css; charset=utf-8";
            }

            os.write("HTTP/1.1 200 OK\r\n".getBytes());
            os.write(("Content-Type: " + contentType + "\r\n").getBytes());
            os.write("Connection: close\r\n\r\n".getBytes());

            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = is.read(buffer)) != -1) {
                os.write(buffer, 0, bytesRead);
            }
            is.close();
        } catch (FileNotFoundException e) {
            sendErrorResponse(os, 404, "Not Found", "File not found: " + assetPath);
        }
    }

    private void sendSuccessResponse(OutputStream os, int status, String body, Map<String, String> headers) throws IOException {
        os.write(("HTTP/1.1 " + status + " OK\r\n").getBytes());
        os.write("Content-Type: application/json; charset=utf-8\r\n".getBytes());
        if (headers != null) {
            for (Map.Entry<String, String> entry : headers.entrySet()) {
                os.write((entry.getKey() + ": " + entry.getValue() + "\r\n").getBytes());
            }
        }
        os.write("Connection: close\r\n\r\n".getBytes());
        if (body != null) {
            os.write(body.getBytes("UTF-8"));
        }
    }

    private void sendErrorResponse(OutputStream os, int status, String statusText, String message) throws IOException {
        String json = "{\"success\":false,\"error\":{\"message\":\"" + message.replace("\"", "\\\"") + "\"}}";
        os.write(("HTTP/1.1 " + status + " " + statusText + "\r\n").getBytes());
        os.write("Content-Type: application/json; charset=utf-8\r\n".getBytes());
        os.write("Connection: close\r\n\r\n".getBytes());
        os.write(json.getBytes("UTF-8"));
    }

    private String readLine(InputStream is) throws IOException {
        StringBuilder sb = new StringBuilder();
        int c;
        while ((c = is.read()) != -1) {
            if (c == '\r') {
                continue;
            }
            if (c == '\n') {
                break;
            }
            sb.append((char) c);
            if (sb.length() > 8192) {
                throw new IOException("Header line length limit exceeded");
            }
        }
        if (c == -1 && sb.length() == 0) return null;
        return sb.toString();
    }

    public static class RequestHolder {
        public final String requestId;
        public final String method;
        public final String path;
        public final String query;
        public final String body;
        public final CountDownLatch latch = new CountDownLatch(1);

        public int responseStatus = 500;
        public String responseBody = "";
        public Map<String, String> responseHeaders = null;

        public RequestHolder(String requestId, String method, String path, String query, String body) {
            this.requestId = requestId;
            this.method = method;
            this.path = path;
            this.query = query;
            this.body = body;
        }
    }
}
