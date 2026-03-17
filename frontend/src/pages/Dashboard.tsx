import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Radio,
  Users,
  Plus,
  Search,
  Archive,
  TrendingUp,
} from "lucide-react";

import { SessionRail } from "@/components/synapse/SessionRail";

const Dashboard = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) navigate("/login");
  }, [token, navigate]);

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/sessions", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await res.json();
        setSessions(data?.data?.sessions || []);
      } catch (err) {
        console.error("Error fetching sessions:", err);
      } finally {
        setLoading(false);
      }
    };

    if (token) fetchSessions();
  }, [token]);

  const liveSessions = sessions.filter((s) => s.isLive);
  const scheduledSessions = sessions.filter((s) => !s.isLive);

  return (
    <div className="flex h-screen bg-background">
      <SessionRail />

      <main className="flex-1 overflow-y-auto">
        {/* Logout */}
        <button
          onClick={() => {
            localStorage.removeItem("token");
            window.location.href = "/login";
          }}
          className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm"
        >
          Logout
        </button>

        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b">
          <div className="flex items-center justify-between px-8 h-14">
            <h1 className="text-lg font-medium">Command Center</h1>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                <Search className="w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search sessions..."
                  className="bg-transparent text-sm outline-none w-48"
                />
              </div>

              <button
                onClick={async () => {
  try {
    const res = await fetch("http://localhost:5000/api/rooms/instant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({
        name: "Instant Session",
      }),
    });

    const data = await res.json();

    if (data.success) {
      const roomId = data.data.room.roomId;
      navigate(`/room/${roomId}`);
    }
  } catch (err) {
    console.error("Error creating session:", err);
  }
}}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm"
              >
                <Plus className="w-4 h-4" />
                New Session
              </button>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-8">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Live Sessions", value: liveSessions.length, icon: Radio },
              {
                label: "Students Online",
                value: sessions.reduce((acc, s) => acc + (s.students || 0), 0),
                icon: Users,
              },
              { label: "Avg. Latency", value: "0.4ms", icon: TrendingUp },
              { label: "Archived", value: sessions.length, icon: Archive },
            ].map((stat) => (
              <div key={stat.label} className="p-4 border rounded-xl">
                <stat.icon className="w-4 h-4 mb-2" />
                <p className="text-sm">{stat.label}</p>
                <p className="text-xl font-semibold">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Loading */}
          {loading && <p>Loading sessions...</p>}

          {/* Live */}
          {!loading && (
            <div>
              <h2 className="mb-4">Live Now</h2>
              <div className="grid gap-4">
                {liveSessions.map((s) => (
                  <div
                    key={s._id}
                    onClick={() => navigate(`/room/${s.roomId || s._id}`)}
                    className="p-4 border rounded cursor-pointer"
                  >
                    <h3>{s.name}</h3>
                    <p>{s.teacher}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming */}
          {!loading && (
            <div>
              <h2 className="mt-6 mb-4">Upcoming</h2>
              {scheduledSessions.map((s) => (
                <div key={s._id} className="p-4 border rounded mb-2">
                  <h3>{s.name}</h3>
                  <p>{s.teacher}</p>
                  <button
                    onClick={() => navigate(`/room/${s.roomId || s._id}`)}
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;