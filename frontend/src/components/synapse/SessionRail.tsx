import { motion } from "framer-motion";
import { BookOpen, Radio, Archive, Settings, Plus, ChevronRight } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";

const navItems = [
  { icon: Radio, label: "Live Sessions", count: 3 },
  { icon: BookOpen, label: "My Classes", count: 5 },
  { icon: Archive, label: "Class Vault", count: 24 },
  { icon: Settings, label: "Settings" },
];

export const SessionRail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isInRoom = location.pathname.startsWith("/room/");

  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await fetch("https://your-backend.onrender.com/api/sessions", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      const data = await res.json();

      if (data?.success && data?.data?.sessions) {
        setSessions(data.data.sessions);
      } else {
        setSessions([]);
      }
    } catch (err) {
      console.error("Error fetching sessions:", err);
    }
  };

  // 🔥 CREATE SESSION WITH NAME
  const createSession = async () => {
    const sessionName = prompt("Enter session name:");

    if (!sessionName || !sessionName.trim()) {
      alert("Session name required");
      return;
    }

    try {
      const res = await fetch("https://your-backend.onrender.com/api/rooms/instant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          name: sessionName.trim(),
        }),
      });

      const data = await res.json();

      if (data.success) {
        const roomId = data.data.room.roomId;

        // 🔥 refresh sidebar sessions
        fetchSessions();

        // 🔥 go to room
        navigate(`/room/${roomId}`);
      }
    } catch (err) {
      console.error("Error creating session:", err);
    }
  };

  return (
    <div className="w-16 hover:w-64 group/rail transition-all duration-300 bg-sidebar border-r flex flex-col h-screen overflow-hidden shrink-0">
      
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-white font-bold text-sm">S</span>
        </div>
        <span className="ml-3 font-semibold opacity-0 group-hover/rail:opacity-100">
          Synapse
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.label}
            onClick={() => navigate("/")}
            className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-gray-800"
          >
            <item.icon className="w-5 h-5" />
            <span className="opacity-0 group-hover/rail:opacity-100 flex-1 text-left">
              {item.label}
            </span>
          </button>
        ))}

        {/* Live */}
        <div className="pt-4 opacity-0 group-hover/rail:opacity-100">
          <div className="px-2 mb-2 flex items-center justify-between">
            <span className="text-xs uppercase">Live Now</span>

            {/* 🔥 FIXED BUTTON */}
            <Plus
              className="w-4 h-4 cursor-pointer"
              onClick={createSession}
            />
          </div>

          {sessions
            .filter((s) => s.isLive)
            .map((session) => (
              <motion.button
                key={session._id}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(`/room/${session.roomId || session._id}`)}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded ${
                  isInRoom && location.pathname.includes(session._id)
                    ? "bg-gray-700"
                    : "hover:bg-gray-800"
                }`}
              >
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="truncate flex-1 text-left">
                  {session.name || "Untitled"}
                </span>
                <ChevronRight className="w-3 h-3" />
              </motion.button>
            ))}
        </div>
      </nav>
    </div>
  );
};
