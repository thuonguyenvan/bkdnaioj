// useWebSocket hook — connects to WS URL, calls onMessage on each event
// Auto-reconnects with exponential backoff (max 30s) on unexpected close
import { useEffect, useRef } from 'react'

const BASE_DELAY_MS = 1_000
const MAX_DELAY_MS = 30_000

export function useWebSocketWithAutoReconnect(
  url: string | null,
  onMessage: (data: unknown) => void,
) {
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!url) return

    let ws: WebSocket
    let attempt = 0
    let destroyed = false
    let retryTimer: ReturnType<typeof setTimeout>

    function connect() {
      ws = new WebSocket(url as string)

      ws.onmessage = (e) => {
        try {
          onMessageRef.current(JSON.parse(e.data as string))
        } catch {
          onMessageRef.current(e.data)
        }
      }

      ws.onerror = () => {
        // onclose will fire next and handle reconnect
      }

      ws.onclose = (e) => {
        if (destroyed) return
        // 1000 = normal close, don't reconnect
        if (e.code === 1000) return
        const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
        attempt++
        retryTimer = setTimeout(connect, delay)
      }

      ws.onopen = () => {
        attempt = 0
      }
    }

    connect()

    return () => {
      destroyed = true
      clearTimeout(retryTimer)
      ws?.close(1000)
    }
  }, [url])
}
