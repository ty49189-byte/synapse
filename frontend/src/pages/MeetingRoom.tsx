import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";

import { SessionRail } from "@/components/synapse/SessionRail";
import { SessionHeader } from "@/components/synapse/SessionHeader";
import { ControlBar } from "@/components/synapse/ControlBar";
import { LiveCaptionBar } from "@/components/synapse/LiveCaptionBar";

const MeetingRoom = () => {
  const { sessionId } = useParams();

  const socketRef = useRef<Socket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const peersRef = useRef<any>({});

  const [session, setSession] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);

  // 🎥 CAMERA FIX
  useEffect(() => {
    const initMedia = async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        setStream(media);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = media;

          // 🔥 IMPORTANT FIX
          localVideoRef.current.onloadedmetadata = () => {
            localVideoRef.current?.play();
          };
        }
      } catch (err) {
        console.error("Media error:", err);
      }
    };

    initMedia();
  }, []);

  // 📦 FETCH ROOM
  useEffect(() => {
    const fetchSession = async () => {
      const res = await fetch(`https://your-backend.onrender.com/api/rooms/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      const data = await res.json();
      if (data.success) setSession(data.data.room);
    };

    if (sessionId) fetchSession();
  }, [sessionId]);

  // 🔌 SOCKET + WEBRTC FIXED
  useEffect(() => {
    if (!sessionId || !stream) return;

    const socket = io("https://your-backend.onrender.com", {
  transports: ["websocket"], // 🔥 FIX
});
    socketRef.current = socket;

    socket.emit("join-room", {
      roomId: sessionId,
      user: {
        id: socket.id,
        name: "User",
        role: "student",
      },
    });

    socket.on("participants", setParticipants);

    socket.on("receive-message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    // 🔥 NEW USER JOINED
    socket.on("user-joined", async (id) => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      peersRef.current[id] = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (e) => {
        const video = document.getElementById(id) as HTMLVideoElement;
        if (video) {
          video.srcObject = e.streams[0];
          video.play();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("offer", { offer, to: id });
    });

    // 🔥 RECEIVE OFFER
    socket.on("offer", async ({ offer, from }) => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      peersRef.current[from] = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (e) => {
        const video = document.getElementById(from) as HTMLVideoElement;
        if (video) {
          video.srcObject = e.streams[0];
          video.play();
        }
      };

      await pc.setRemoteDescription(offer);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("answer", { answer, to: from });
    });

    // 🔥 RECEIVE ANSWER
    socket.on("answer", async ({ answer, from }) => {
      const pc = peersRef.current[from];
      if (pc) {
        await pc.setRemoteDescription(answer);
      }
    });

    return () => socket.disconnect();
  }, [sessionId, stream]);

  // 💬 CHAT
  const sendMessage = () => {
    if (!input.trim()) return;

    const msg = { text: input, sender: "You" };

    socketRef.current?.emit("send-message", {
      roomId: sessionId,
      message: msg,
    });

    setMessages((prev) => [...prev, msg]);
    setInput("");
  };

  // 🎤 CONTROLS
  const toggleMic = () => {
    stream?.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
  };

  const toggleCamera = () => {
    stream?.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
  };

  if (!session) return <div className="p-6 text-white">Loading...</div>;

  return (
    <div className="flex h-screen bg-black text-white">
      <SessionRail />

      <div className="flex-1 flex flex-col">
        <SessionHeader
          name={session.name}
          students={participants.length}
          duration="LIVE"
          isRecording={true}
        />

        {/* VIDEO */}
        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4 p-4">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-48 bg-black rounded"
          />

          {participants.map((p) => (
            <video
              key={p.socketId || p.id}
              id={p.socketId || p.id}
              autoPlay
              playsInline
              className="w-full h-48 bg-black rounded"
            />
          ))}
        </div>

        {/* CHAT */}
        <div className="h-40 border-t p-2 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i}>
              <b>{m.sender}:</b> {m.text}
            </div>
          ))}
        </div>

        <div className="flex gap-2 p-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 p-2 text-black"
            placeholder="message"
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />
          <button onClick={sendMessage}>Send</button>
        </div>

        {/* CONTROLS */}
        <div className="flex gap-4 p-4">
          <button onClick={toggleMic}>🎤 Mic</button>
          <button onClick={toggleCamera}>🎥 Camera</button>
        </div>
      </div>

      <LiveCaptionBar />
    </div>
  );
};

export default MeetingRoom;
