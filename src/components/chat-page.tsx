"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Send, MessageCircle, ImagePlus, CheckCheck } from "lucide-react";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api-client";
import type { ChatRoom, Message, Product } from "@/lib/types";
import { date, money } from "@/lib/utils";
import { Button } from "./ui/button";
import { Empty, Failure, Loading, useToast } from "./feedback";
import { useProfile } from "./shell";
import { Upload } from "./entity-form";
import { ListPicker } from "./product-card";
export function ChatPage({ initialRoom = "" }: { initialRoom?: string }) {
  const rooms = useQuery<ChatRoom[]>("chat"),
    profile = useProfile();
  const [room, setRoom] = useState(initialRoom),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [image, setImage] = useState(false),
    [page, setPage] = useState(0),
    [live, setLive] = useState(false),
    [saveProduct, setSaveProduct] = useState<Product | null>(null);
  const selected = room || rooms.data?.[0]?.id || "";
  const messages = useQuery<Message[]>(
    selected ? `chat/${selected}/messages?page=${page}` : null,
  );
  const notify = useToast(),
    end = useRef<HTMLDivElement>(null);
  const refreshMessages = messages.refresh,
    refreshRooms = rooms.refresh;
  const handleRead = useCallback(() => {
    if (selected)
      void api("chat/" + selected + "/read", {})
        .then(rooms.refresh)
        .catch(() => {});
  }, [selected, rooms.refresh]);
  useEffect(() => {
    if (!selected) return;
    setLive(true);
    handleRead();
    // Poll for new messages every 3 seconds
    const poll = setInterval(() => {
      refreshMessages();
      refreshRooms();
    }, 3000);
    return () => {
      clearInterval(poll);
    };
  }, [selected, refreshMessages, refreshRooms, handleRead]);
  useEffect(() => {
    if (page === 0)
      end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.data, page]);
  async function send(kind = "TEXT", imagePath?: string) {
    setBusy(true);
    try {
      await api("chat/" + selected + "/messages", {
        message_type: kind,
        message: kind === "TEXT" ? text : "",
        image_path: imagePath,
      });
      setText("");
      setImage(false);
      setPage(0);
      messages.refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const chosen = rooms.data?.find((r) => r.id === selected);
  return (
    <div className="page chat-page">
      <div className="page-heading">
        <p className="eyebrow">A CONVERSATION AWAY</p>
        <h1>Your neighbourhood chats</h1>
        <p>Ask a question, share a product, or send your shopping list.</p>
      </div>
      <div className="chat-layout">
        <aside className="chat-rooms">
          {rooms.loading ? (
            <Loading />
          ) : rooms.error ? (
            <Failure message={rooms.error} retry={rooms.refresh} />
          ) : rooms.data?.length ? (
            rooms.data.map((r) => (
              <button
                className={"chat-room " + (selected === r.id ? "selected" : "")}
                key={r.id}
                onClick={() => {
                  setRoom(r.id);
                  setPage(0);
                }}
              >
                <span className="list-icon">
                  <MessageCircle size={19} />
                </span>
                <span>
                  <strong>
                    {profile?.role === "SHOPKEEPER"
                      ? r.customer_name
                      : r.shop_name}
                  </strong>
                  <small>{date(r.updated_at)}</small>
                </span>
                {r.unread > 0 && <em>{r.unread}</em>}
              </button>
            ))
          ) : (
            <Empty text="Open a shop and start a conversation." />
          )}
        </aside>
        <section className="chat-conversation">
          {!selected ? (
            <Empty
              title="Say hello to your local shop"
              text="Start a chat from a shop or product page."
            />
          ) : (
            <>
              <div className="chat-heading">
                <strong>
                  {profile?.role === "SHOPKEEPER"
                    ? chosen?.customer_name
                    : chosen?.shop_name}
                </strong>
                <span className="muted">
                  {live ? "Connected" : "Connecting…"}
                </span>
              </div>
              <div className="chat-messages">
                {page > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPage((x) => x - 1)}
                  >
                    Newer messages
                  </Button>
                )}
                {messages.data?.length === 50 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPage((x) => x + 1)}
                  >
                    Earlier messages
                  </Button>
                )}
                {messages.error && (
                  <Failure message={messages.error} retry={messages.refresh} />
                )}
                <p className="chat-hint">
                  Only you and this shop can see this conversation.
                </p>
                {[...(messages.data || [])].reverse().map((m) => (
                  <div
                    key={m.id}
                    className={
                      "message " + (m.sender_id === profile?.id ? "mine" : "")
                    }
                  >
                    <div className="message-content">
                      {m.message_type === "PRODUCT" && (
                        <div className="shared-card">
                          <small>SHARED PRODUCT</small>
                          <Link href={"/products/" + m.payload.id}>
                            <b>{m.payload.name}</b>
                          </Link>
                          <span>
                            {m.payload.unit} · {money(Number(m.payload.price))}
                          </span>
                          <small>{m.payload.stock_quantity} in stock</small>
                          {profile?.role === "CUSTOMER" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setSaveProduct({
                                  id: m.payload.id!,
                                  shop_id: chosen!.shop_id,
                                  category_id: "",
                                  name: m.payload.name!,
                                  description: "",
                                  brand: "",
                                  unit: m.payload.unit!,
                                  price: Number(m.payload.price),
                                  stock_quantity: Number(
                                    m.payload.stock_quantity,
                                  ),
                                  image_url: null,
                                })
                              }
                            >
                              Add to list
                            </Button>
                          )}
                        </div>
                      )}
                      {m.message_type === "PRODUCT_LIST" && (
                        <div className="shared-card">
                          <small>SHOPPING LIST</small>
                          <b>{m.payload.name}</b>
                          {m.payload.items?.map((x, i) => (
                            <span key={i}>
                              {x.name}{" "}
                              <strong>
                                × {x.quantity} {x.unit}
                              </strong>
                            </span>
                          ))}
                        </div>
                      )}
                      {m.message_type === "ORDER" && (
                        <div className="shared-card">
                          <small>SHARED ORDER</small>
                          <Link href={"/orders/" + m.payload.id}>
                            <b>{m.payload.order_number}</b>
                          </Link>
                          <span>
                            {m.payload.status} ·{" "}
                            {money(Number(m.payload.total_amount))}
                          </span>
                        </div>
                      )}
                      {m.message_type === "IMAGE" && m.payload.path && (
                        <ChatImage path={m.payload.path} />
                      )}
                      <p>{m.message}</p>
                      <div className="message-time">
                        {new Date(m.created_at).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {m.sender_id === profile?.id && (
                          <CheckCheck
                            size={12}
                            className={m.is_read ? "read" : ""}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={end} />
              </div>
              {image && (
                <div className="chat-upload">
                  <Upload
                    bucket="chat-images"
                    room={selected}
                    onUploaded={(_, path) => send("IMAGE", path)}
                  />
                </div>
              )}
              <form
                className="chat-compose"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) void send();
                }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Share image"
                  onClick={() => setImage(!image)}
                >
                  <ImagePlus size={19} />
                </Button>
                <input
                  aria-label="Message"
                  value={text}
                  maxLength={4000}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Message your shopkeeper…"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={busy || !text.trim()}
                  aria-label="Send message"
                >
                  <Send size={17} />
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
      {saveProduct && (
        <ListPicker
          product={saveProduct}
          open
          onClose={() => setSaveProduct(null)}
        />
      )}
    </div>
  );
}
function ChatImage({ path }: { path: string }) {
  const url = `/uploads/chat-images/${path}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <Image
        unoptimized
        width={320}
        height={240}
        className="chat-image"
        src={url}
        alt="Shared by a chat participant"
      />
    </a>
  );
}
