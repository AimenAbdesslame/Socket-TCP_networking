"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { Send, X, Wifi, WifiOff, Trash2, Copy, CheckCircle, AlertCircle, Server, TestTube } from "lucide-react"

interface Message {
  id: string
  type: "sent" | "received" | "system"
  content: string
  timestamp: Date
}

export default function SocketClient() {
  const [message, setMessage] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState("Disconnected")
  const [serverUrl, setServerUrl] = useState("ws://localhost:8765")
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [useMockServer, setUseMockServer] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [maxRetries] = useState(3)
  const wsRef = useRef<WebSocket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const addMessage = useCallback((type: "sent" | "received" | "system", content: string) => {
    const newMessage: Message = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      type,
      content,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, newMessage])
  }, [])

  // Mock server for testing when Python server is not available
  const mockServerResponse = useCallback((message: string): string => {
    if (!message) return "Empty message received"

    // Simulate the Python server's behavior: capitalize first letter
    if (message.length === 1) {
      return message.toUpperCase()
    } else {
      return message[0].toUpperCase() + message.slice(1)
    }
  }, [])

  const connectToServer = useCallback(async () => {
    if (isConnecting) return

    setIsConnecting(true)
    setError(null)

    // Clear any existing retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }

    try {
      // Close existing connection if any
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }

      if (useMockServer) {
        // Simulate connection to mock server
        setIsConnected(true)
        setConnectionStatus("Connected (Mock Server)")
        setIsConnecting(false)
        setError(null)
        setRetryCount(0)
        addMessage("system", "🟢 Connected to Mock Server (Python server not required)")
        return
      }

      // Try to connect to real WebSocket server
      const ws = new WebSocket(serverUrl)
      wsRef.current = ws

      // Set up event handlers
      ws.onopen = () => {
        setIsConnected(true)
        setConnectionStatus("Connected")
        setIsConnecting(false)
        setError(null)
        setRetryCount(0)
        addMessage("system", "🟢 Connected to Python WebSocket server")
      }

      ws.onmessage = (event) => {
        const processedMessage = event.data
        addMessage("received", processedMessage)
      }

      ws.onclose = (event) => {
        setIsConnected(false)
        setIsConnecting(false)
        wsRef.current = null

        if (event.wasClean) {
          setConnectionStatus("Disconnected")
          addMessage("system", "🔴 Connection closed")
        } else {
          setConnectionStatus("Connection Lost")
          addMessage("system", "⚠️ Connection lost unexpectedly")

          // Auto-retry connection if not manually closed
          if (retryCount < maxRetries) {
            const nextRetry = retryCount + 1
            setRetryCount(nextRetry)
            setError(`Connection lost. Retrying... (${nextRetry}/${maxRetries})`)

            retryTimeoutRef.current = setTimeout(() => {
              connectToServer()
            }, 2000 * nextRetry) // Exponential backoff
          } else {
            setError(
              "Failed to connect after multiple attempts. Try using Mock Server or check if Python server is running.",
            )
          }
        }
      }

      ws.onerror = (event) => {
        console.error("WebSocket error:", event)
        setConnectionStatus("Connection Error")
        setIsConnecting(false)

        const errorMessage = "Failed to connect to Python server. Make sure the server is running on " + serverUrl
        setError(errorMessage)
        addMessage("system", "❌ " + errorMessage)
      }

      // Set a connection timeout
      setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close()
          setIsConnecting(false)
          setError("Connection timeout. Server may not be running.")
        }
      }, 5000)
    } catch (error) {
      console.error("Failed to create WebSocket:", error)
      setConnectionStatus("Connection Failed")
      setIsConnecting(false)
      setError("Failed to establish connection: " + (error as Error).message)
      addMessage("system", "❌ Failed to establish connection")
    }
  }, [serverUrl, useMockServer, retryCount, maxRetries, addMessage, isConnecting])

  const sendMessage = useCallback(() => {
    if (!message.trim()) return

    if (useMockServer) {
      // Handle mock server
      addMessage("sent", message)
      const response = mockServerResponse(message)
      setTimeout(() => {
        addMessage("received", response)
      }, 100) // Simulate network delay
      setMessage("")
      return
    }

    // Handle real WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(message)
      addMessage("sent", message)
      setMessage("")
    } else {
      setError("Not connected to server. Please connect first.")
    }
  }, [message, useMockServer, mockServerResponse, addMessage])

  const closeConnection = useCallback(() => {
    // Clear retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }

    if (useMockServer) {
      setIsConnected(false)
      setConnectionStatus("Disconnected")
      setError(null)
      addMessage("system", "🔴 Disconnected from Mock Server")
      return
    }

    if (wsRef.current) {
      wsRef.current.close(1000, "User closed connection")
      wsRef.current = null
    }
    setIsConnected(false)
    setConnectionStatus("Disconnected")
    setError(null)
    setRetryCount(0)
  }, [useMockServer, addMessage])

  const clearMessages = () => {
    setMessages([])
  }

  const copyMessage = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error("Failed to copy message:", err)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  const toggleMockServer = (enabled: boolean) => {
    setUseMockServer(enabled)
    if (isConnected) {
      closeConnection()
    }
    setError(null)
    setRetryCount(0)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Socket Communication Demo</h1>
          <p className="text-gray-600">Real-time communication with Python WebSocket server</p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              {retryCount < maxRetries && !isConnecting && (
                <Button size="sm" variant="outline" onClick={connectToServer}>
                  Retry Now
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Connection Panel */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  {isConnected ? (
                    <Wifi className="h-5 w-5 text-green-500" />
                  ) : (
                    <WifiOff className="h-5 w-5 text-red-500" />
                  )}
                  Connection
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Mock Server Toggle */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    {useMockServer ? (
                      <TestTube className="h-4 w-4 text-blue-500" />
                    ) : (
                      <Server className="h-4 w-4 text-gray-500" />
                    )}
                    <span className="text-sm font-medium">{useMockServer ? "Mock Server" : "Real Server"}</span>
                  </div>
                  <Switch checked={useMockServer} onCheckedChange={toggleMockServer} disabled={isConnected} />
                </div>

                {!useMockServer && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Server URL</label>
                    <Input
                      type="text"
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      disabled={isConnected || isConnecting}
                      placeholder="ws://localhost:8765"
                      className="text-sm"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <Badge
                    variant={isConnected ? "default" : isConnecting ? "secondary" : "destructive"}
                    className="text-sm"
                  >
                    {isConnecting ? "Connecting..." : connectionStatus}
                  </Badge>
                  {retryCount > 0 && !isConnected && (
                    <Badge variant="outline" className="text-xs">
                      Retry {retryCount}/{maxRetries}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {!isConnected && !isConnecting && (
                    <Button onClick={connectToServer} className="w-full">
                      {useMockServer ? "Start Mock Server" : "Connect to Server"}
                    </Button>
                  )}
                  {isConnected && (
                    <Button onClick={closeConnection} variant="destructive" className="w-full flex items-center gap-1">
                      <X className="h-4 w-4" />
                      Disconnect
                    </Button>
                  )}
                </div>

                {useMockServer && (
                  <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                    <strong>Mock Mode:</strong> No Python server required. Messages are processed locally for testing.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Statistics */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total Messages:</span>
                  <span className="font-medium">{messages.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 flex items-center gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    Client Messages:
                  </span>
                  <span className="font-medium text-blue-600">{messages.filter((m) => m.type === "sent").length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    Server Responses:
                  </span>
                  <span className="font-medium text-green-600">
                    {messages.filter((m) => m.type === "received").length}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 flex items-center gap-1">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    System Messages:
                  </span>
                  <span className="font-medium text-yellow-600">
                    {messages.filter((m) => m.type === "system").length}
                  </span>
                </div>
                <Separator className="my-2" />
                <Button
                  onClick={clearMessages}
                  variant="outline"
                  size="sm"
                  className="w-full flex items-center gap-1"
                  disabled={messages.length === 0}
                >
                  <Trash2 className="h-4 w-4" />
                  Clear History
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Chat Panel */}
          <div className="lg:col-span-2 space-y-4">
            {/* Message History */}
            <Card className="h-96">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <span>Message History</span>
                  <Badge variant="outline" className="text-xs">
                    {messages.length} messages
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-80 px-4">
                  {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      <div className="text-center">
                        <p className="mb-2">No messages yet.</p>
                        <p className="text-sm">
                          {useMockServer
                            ? "Click 'Start Mock Server' and send a message to test."
                            : "Connect to the Python server and send a message to start."}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 pb-4">
                      {messages.map((msg) => (
                        <div key={msg.id} className="w-full">
                          {msg.type === "system" ? (
                            // System messages (centered)
                            <div className="flex justify-center">
                              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-2 rounded-lg text-sm max-w-md text-center">
                                <p className="break-words">{msg.content}</p>
                                <span className="text-xs text-yellow-600 mt-1 block">{formatTime(msg.timestamp)}</span>
                              </div>
                            </div>
                          ) : (
                            // Client and Server messages
                            <div className={`flex ${msg.type === "sent" ? "justify-end" : "justify-start"}`}>
                              <div className="max-w-xs lg:max-w-md">
                                {/* Message Label */}
                                <div
                                  className={`flex items-center gap-2 mb-1 ${msg.type === "sent" ? "justify-end" : "justify-start"}`}
                                >
                                  {msg.type === "sent" ? (
                                    <>
                                      <span className="text-xs font-medium text-blue-600">You (Client)</span>
                                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                      <span className="text-xs font-medium text-green-600">
                                        {useMockServer ? "Mock Server" : "Python Server"}
                                      </span>
                                    </>
                                  )}
                                </div>

                                {/* Message Bubble */}
                                <div
                                  className={`px-4 py-3 rounded-lg group relative shadow-sm ${
                                    msg.type === "sent"
                                      ? "bg-blue-500 text-white rounded-br-sm"
                                      : "bg-white border border-gray-200 text-gray-900 rounded-bl-sm"
                                  }`}
                                >
                                  <p className="text-sm break-words leading-relaxed">{msg.content}</p>

                                  {/* Message Footer */}
                                  <div className="flex items-center justify-between mt-2 pt-1">
                                    <span
                                      className={`text-xs ${msg.type === "sent" ? "text-blue-100" : "text-gray-500"}`}
                                    >
                                      {formatTime(msg.timestamp)}
                                    </span>

                                    {/* Copy Button */}
                                    <button
                                      onClick={() => copyMessage(msg.content, msg.id)}
                                      className={`opacity-0 group-hover:opacity-100 transition-opacity ml-2 p-1 rounded ${
                                        msg.type === "sent"
                                          ? "text-blue-100 hover:text-white hover:bg-blue-600"
                                          : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                                      }`}
                                      title="Copy message"
                                    >
                                      {copiedId === msg.id ? (
                                        <CheckCircle className="h-3 w-3" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </button>
                                  </div>

                                  {/* Message Type Indicator */}
                                  <div
                                    className={`absolute -bottom-1 ${
                                      msg.type === "sent" ? "-right-1" : "-left-1"
                                    } w-3 h-3 transform rotate-45 ${
                                      msg.type === "sent" ? "bg-blue-500" : "bg-white border-r border-b border-gray-200"
                                    }`}
                                  ></div>
                                </div>

                                {/* Processing Indicator for Server Messages */}
                                {msg.type === "received" && (
                                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                                    <div className="w-1 h-1 bg-green-400 rounded-full"></div>
                                    <span>Processed & returned by server</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Message Input */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Send Message</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Type your message here..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={!isConnected}
                    className="flex-1"
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!isConnected || !message.trim()}
                    className="flex items-center gap-1"
                  >
                    <Send className="h-4 w-4" />
                    Send
                  </Button>
                </div>
                {!isConnected && (
                  <p className="text-sm text-gray-500">
                    {useMockServer ? "Start mock server" : "Connect to server"} to send messages
                  </p>
                )}
                <p className="text-xs text-gray-400">
                  Press Enter to send • Server will capitalize the first letter of your message
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Communication Flow Diagram */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-green-500 rounded-full animate-pulse"></div>
              Real-time Communication Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {/* Connection Flow */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {/* Client Side */}
                <div className="text-center">
                  <div className="relative">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl mx-auto mb-4 flex items-center justify-center shadow-lg">
                      <div className="text-white text-2xl">💻</div>
                    </div>
                    <div
                      className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        isConnected ? "bg-green-500 text-white" : "bg-gray-400 text-white"
                      }`}
                    >
                      {isConnected ? "✓" : "○"}
                    </div>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">React Client</h3>
                  <p className="text-sm text-gray-600">Web Browser</p>
                  <Badge variant={isConnected ? "default" : "secondary"} className="mt-2">
                    {isConnected ? "Connected" : "Disconnected"}
                  </Badge>
                </div>

                {/* Connection Arrows */}
                <div className="flex flex-col items-center justify-center space-y-4">
                  {/* Three-way handshake visualization */}
                  <div className="w-full space-y-2">
                    {/* Step 1: SYN */}
                    <div
                      className={`flex items-center transition-all duration-500 ${
                        isConnected || isConnecting ? "opacity-100" : "opacity-30"
                      }`}
                    >
                      <div className="flex-1 h-0.5 bg-gradient-to-r from-blue-500 to-transparent relative">
                        <div
                          className={`absolute right-0 top-1/2 transform -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full ${
                            isConnecting ? "animate-pulse" : ""
                          }`}
                        ></div>
                      </div>
                      <span className="text-xs text-blue-600 mx-2 font-mono">SYN</span>
                    </div>

                    {/* Step 2: SYN-ACK */}
                    <div
                      className={`flex items-center transition-all duration-500 ${
                        isConnected ? "opacity-100" : "opacity-30"
                      }`}
                    >
                      <span className="text-xs text-green-600 mx-2 font-mono">SYN-ACK</span>
                      <div className="flex-1 h-0.5 bg-gradient-to-l from-green-500 to-transparent relative">
                        <div
                          className={`absolute left-0 top-1/2 transform -translate-y-1/2 w-2 h-2 bg-green-500 rounded-full ${
                            isConnected ? "animate-pulse" : ""
                          }`}
                        ></div>
                      </div>
                    </div>

                    {/* Step 3: ACK */}
                    <div
                      className={`flex items-center transition-all duration-500 ${
                        isConnected ? "opacity-100" : "opacity-30"
                      }`}
                    >
                      <div className="flex-1 h-0.5 bg-gradient-to-r from-blue-500 to-transparent relative">
                        <div
                          className={`absolute right-0 top-1/2 transform -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full ${
                            isConnected ? "animate-pulse" : ""
                          }`}
                        ></div>
                      </div>
                      <span className="text-xs text-blue-600 mx-2 font-mono">ACK</span>
                    </div>
                  </div>

                  {/* Connection Status */}
                  <div className="text-center">
                    <div
                      className={`text-xs font-medium px-3 py-1 rounded-full ${
                        isConnected
                          ? "bg-green-100 text-green-700"
                          : isConnecting
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {isConnected ? "🔗 Established" : isConnecting ? "🔄 Handshaking" : "❌ No Connection"}
                    </div>
                  </div>

                  {/* Data Flow */}
                  {isConnected && (
                    <div className="w-full space-y-3 pt-4 border-t border-gray-200">
                      <div className="text-xs text-center text-gray-500 mb-3">Live Data Exchange</div>

                      {/* Show last sent message */}
                      {messages.filter((m) => m.type === "sent").length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center">
                            <div className="flex-1 relative">
                              <div className="h-8 bg-gradient-to-r from-blue-100 to-blue-50 rounded-lg border border-blue-200 flex items-center px-3 relative overflow-hidden">
                                <span className="text-xs text-blue-700 font-medium truncate">
                                  📤 "{messages.filter((m) => m.type === "sent").slice(-1)[0]?.content}"
                                </span>
                                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-blue-300/30 to-transparent animate-pulse"></div>
                              </div>
                            </div>
                            <div className="ml-2 text-xs text-blue-600 font-mono bg-blue-100 px-2 py-1 rounded">
                              CLIENT → SERVER
                            </div>
                          </div>

                          {/* Processing indicator */}
                          <div className="flex justify-center">
                            <div className="flex items-center space-x-1 text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                              <div className="w-1 h-1 bg-purple-400 rounded-full animate-bounce"></div>
                              <div
                                className="w-1 h-1 bg-purple-400 rounded-full animate-bounce"
                                style={{ animationDelay: "0.1s" }}
                              ></div>
                              <div
                                className="w-1 h-1 bg-purple-400 rounded-full animate-bounce"
                                style={{ animationDelay: "0.2s" }}
                              ></div>
                              <span className="ml-2">Processing...</span>
                            </div>
                          </div>

                          {/* Show last received message */}
                          {messages.filter((m) => m.type === "received").length > 0 && (
                            <div className="flex items-center">
                              <div className="mr-2 text-xs text-green-600 font-mono bg-green-100 px-2 py-1 rounded">
                                SERVER → CLIENT
                              </div>
                              <div className="flex-1 relative">
                                <div className="h-8 bg-gradient-to-l from-green-100 to-green-50 rounded-lg border border-green-200 flex items-center px-3 relative overflow-hidden">
                                  <span className="text-xs text-green-700 font-medium truncate">
                                    📥 "{messages.filter((m) => m.type === "received").slice(-1)[0]?.content}"
                                  </span>
                                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-l from-transparent via-green-300/30 to-transparent animate-pulse"></div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Default state when no messages */}
                      {messages.filter((m) => m.type === "sent").length === 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center opacity-50">
                            <div className="flex-1 h-6 bg-gray-100 rounded-lg border border-gray-200 flex items-center px-3">
                              <span className="text-xs text-gray-500">📤 Waiting for message...</span>
                            </div>
                            <div className="ml-2 text-xs text-gray-400 font-mono bg-gray-100 px-2 py-1 rounded">
                              CLIENT → SERVER
                            </div>
                          </div>

                          <div className="flex justify-center">
                            <div className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                              Ready to process
                            </div>
                          </div>

                          <div className="flex items-center opacity-50">
                            <div className="mr-2 text-xs text-gray-400 font-mono bg-gray-100 px-2 py-1 rounded">
                              SERVER → CLIENT
                            </div>
                            <div className="flex-1 h-6 bg-gray-100 rounded-lg border border-gray-200 flex items-center px-3">
                              <span className="text-xs text-gray-500">📥 Response will appear here...</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Real-time stats */}
                      <div className="flex justify-center pt-2">
                        <div className="flex items-center space-x-4 text-xs">
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                            <span className="text-blue-600">
                              {messages.filter((m) => m.type === "sent").length} sent
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                            <span className="text-green-600">
                              {messages.filter((m) => m.type === "received").length} received
                            </span>
                          </div>
                          {messages.length > 0 && (
                            <div className="flex items-center space-x-1">
                              <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                              <span className="text-purple-600">
                                {(
                                  (messages.filter((m) => m.type === "received").length /
                                    Math.max(messages.filter((m) => m.type === "sent").length, 1)) *
                                  100
                                ).toFixed(0)}
                                % success rate
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Server Side */}
                <div className="text-center">
                  <div className="relative">
                    <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-xl mx-auto mb-4 flex items-center justify-center shadow-lg">
                      <div className="text-white text-2xl">{useMockServer ? "🧪" : "🐍"}</div>
                    </div>
                    <div
                      className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        isConnected ? "bg-green-500 text-white" : "bg-gray-400 text-white"
                      }`}
                    >
                      {isConnected ? "✓" : "○"}
                    </div>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    {useMockServer ? "Mock Server" : "Python Server"}
                  </h3>
                  <p className="text-sm text-gray-600">{useMockServer ? "Browser Simulation" : "WebSocket Server"}</p>
                  <Badge variant={isConnected ? "default" : "secondary"} className="mt-2">
                    {isConnected ? "Listening" : "Offline"}
                  </Badge>
                </div>
              </div>

              {/* Protocol Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-gray-200">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl mb-2">🤝</div>
                  <h4 className="font-semibold text-blue-900 mb-1">Handshake</h4>
                  <p className="text-xs text-blue-700">
                    Three-way handshake establishes reliable connection between client and server
                  </p>
                </div>

                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl mb-2">🔄</div>
                  <h4 className="font-semibold text-purple-900 mb-1">Processing</h4>
                  <p className="text-xs text-purple-700">
                    Server receives message, capitalizes first letter, and sends response back
                  </p>
                </div>

                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl mb-2">⚡</div>
                  <h4 className="font-semibold text-green-900 mb-1">Real-time</h4>
                  <p className="text-xs text-green-700">
                    Bidirectional communication with instant message delivery and responses
                  </p>
                </div>
              </div>

              {/* Live Statistics */}
              <div className="mt-6 p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-lg font-bold text-gray-900">
                      {messages.filter((m) => m.type === "sent").length}
                    </div>
                    <div className="text-xs text-gray-600">Messages Sent</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-900">
                      {messages.filter((m) => m.type === "received").length}
                    </div>
                    <div className="text-xs text-gray-600">Responses Received</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-900">{connectionStatus}</div>
                    <div className="text-xs text-gray-600">Connection Status</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-900">{useMockServer ? "Mock" : "WebSocket"}</div>
                    <div className="text-xs text-gray-600">Protocol Type</div>
                  </div>
                </div>
              </div>

              {/* Quick Start */}
              <div className="mt-6 p-4 bg-gradient-to-r from-blue-500 to-green-500 rounded-lg text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold mb-1">Quick Start</h4>
                    <p className="text-sm opacity-90">
                      {useMockServer
                        ? "Mock server is ready! Send a message to see the interaction."
                        : isConnected
                          ? "Connected! Send a message to see real-time processing."
                          : "Enable Mock Server or run Python server to start testing."}
                    </p>
                  </div>
                  <div className="text-3xl">{isConnected ? "🚀" : "⚙️"}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
