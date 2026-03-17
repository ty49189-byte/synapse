import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Radio, Users, Clock, Circle, Plus, Search, ArrowRight, Archive, TrendingUp } from "lucide-react";
import { mockSessions } from "@/data/mockData";
import { SessionRail } from "@/components/synapse/SessionRail";

const Dashboard = () => {
  const navigate = useNavigate();

  const liveSessions = mockSessions.filter(s => s.isLive);
  const scheduledSessions = mockSessions.filter(s => !s.isLive);

  return (
    <div className="flex h-screen bg-background">
      <SessionRail />
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between px-8 h-14">
            <h1 className="text-lg font-medium text-foreground">Command Center</h1>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search sessions..."
                  className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-48"
                />
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
                <Plus className="w-4 h-4" />
                New Session
              </button>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-8">
          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Live Sessions", value: "3", icon: Radio, color: "text-signal-live" },
              { label: "Students Online", value: "129", icon: Users, color: "text-primary" },
              { label: "Avg. Latency", value: "0.4ms", icon: TrendingUp, color: "text-signal-success" },
              { label: "Archived", value: "247", icon: Archive, color: "text-muted-foreground" },
            ].map((stat) => (
              <div key={stat.label} className="surface-ceramic rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{stat.label}</span>
                </div>
                <p className="text-2xl font-medium tabular-nums text-foreground">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Live Sessions */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-signal-live animate-pulse-live" />
              <h2 className="text-sm font-medium uppercase tracking-wider text-foreground">Live Now</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {liveSessions.map((session, i) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, ease: [0.2, 0, 0, 1] }}
                  onClick={() => navigate(`/room/${session.id}`)}
                  className="surface-ceramic rounded-xl overflow-hidden cursor-pointer group hover:border-primary/30 transition-all"
                >
                  {/* Preview area */}
                  <div className="aspect-video bg-gradient-to-br from-secondary via-background to-muted relative flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-medium">
                      {session.teacher.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    {session.isRecording && (
                      <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-signal-live/20 border border-signal-live/30">
                        <Circle className="w-2 h-2 fill-signal-live text-signal-live animate-pulse-live" />
                        <span className="text-[9px] font-mono uppercase text-signal-live">REC</span>
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                      <Users className="w-3 h-3 text-foreground/70" />
                      <span className="text-[10px] font-mono text-foreground/70 tabular-nums">{session.students}/{session.maxStudents}</span>
                    </div>
                    <div className="absolute bottom-3 right-3">
                      <span className="text-[10px] font-mono text-foreground/70 tabular-nums">{session.duration}</span>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-medium text-foreground truncate">{session.name}</h3>
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-xs text-muted-foreground">{session.teacher}</p>
                    <div className="flex gap-1.5 mt-2">
                      {session.tags.map((tag) => (
                        <span key={tag} className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Scheduled Sessions */}
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">Upcoming</h2>
            <div className="space-y-2">
              {scheduledSessions.map((session, i) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1, ease: [0.2, 0, 0, 1] }}
                  className="surface-ceramic rounded-xl p-4 flex items-center gap-4 hover:border-primary/20 transition-all cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-foreground">{session.name}</h3>
                    <p className="text-xs text-muted-foreground">{session.teacher} · {session.startTime}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{session.maxStudents} seats</span>
                    <button className="px-3 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-surface-hover transition-colors">
                      Join
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
