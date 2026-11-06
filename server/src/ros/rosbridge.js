// Minimal rosbridge v2 client over WebSocket.
// Handles: advertise, publish, subscribe, and automatic reconnect
// (re-advertising and re-subscribing everything after a drop).
import { EventEmitter } from "node:events";
import WebSocket from "ws";

export class RosBridge extends EventEmitter {
  constructor(url, { reconnectMs = 2000 } = {}) {
    super();
    this.url = url;
    this.reconnectMs = reconnectMs;
    this.ws = null;
    this.connected = false;
    this.advertised = new Map(); // topic -> type
    this.subscriptions = new Map(); // topic -> { type, handlers: Set }
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.on("open", () => {
      this.connected = true;
      for (const [topic, type] of this.advertised) this.#send({ op: "advertise", topic, type });
      for (const [topic, { type }] of this.subscriptions) this.#send({ op: "subscribe", topic, type });
      this.emit("connected");
    });

    this.ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.op === "publish") {
        const sub = this.subscriptions.get(msg.topic);
        if (sub) for (const fn of sub.handlers) fn(msg.msg);
      }
    });

    this.ws.on("close", () => {
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) this.emit("disconnected");
      setTimeout(() => this.connect(), this.reconnectMs);
    });

    // 'close' always follows 'error', so reconnect is handled there.
    this.ws.on("error", (err) => this.emit("error", err));
  }

  advertise(topic, type) {
    this.advertised.set(topic, type);
    if (this.connected) this.#send({ op: "advertise", topic, type });
  }

  publish(topic, msg) {
    if (!this.connected) return false;
    this.#send({ op: "publish", topic, msg });
    return true;
  }

  subscribe(topic, type, handler) {
    let sub = this.subscriptions.get(topic);
    if (!sub) {
      sub = { type, handlers: new Set() };
      this.subscriptions.set(topic, sub);
      if (this.connected) this.#send({ op: "subscribe", topic, type });
    }
    sub.handlers.add(handler);
  }

  #send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }
}
