import { motion } from "framer-motion";
import { BookOpen, Radio, Archive, Settings, Plus, ChevronRight } from "lucide-react";
import { mockSessions } from "@/data/mockData";
import { useNavigate, useLocation } from "react-router-dom";

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

  return (
    <div className="w-16 hover:w-64 group/rail transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] bg-sidebar border-r border-sidebar-border flex flex-col h-screen overflow-hidden shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <span className="text-primary-foreground font-bold text-sm">S</span>
        </div>
        <span className="ml-3 font-semibold text-foreground opacity-0 group-hover/rail:opacity-100 transition-opacity whitespace-nowrap">
          Synapse
        </span>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => (
          <button
            key={item.label}
            onClick={() => navigate("/")}
            className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors group/item"
          >
            <item.icon className="w-5 h-5 shrink-0" />
            <span className="text-sm whitespace-nowrap opacity-0 group-hover/rail:opacity-100 transition-opacity flex-1 text-left">
              {item.label}
            </span>
            {item.count && (
              <span className="text-[10px] font-mono tabular-nums bg-muted px-1.5 py-0.5 rounded opacity-0 group-hover/rail:opacity-100 transition-opacity">
                {item.count}
              </span>
            )}
          </button>
        ))}

        {/* Live Sessions Quick Access */}
        <div className="pt-4 opacity-0 group-hover/rail:opacity-100 transition-opacity">
          <div className="px-2 mb-2 flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Live Now</span>
            <Plus className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
          </div>
          {mockSessions.filter(s => s.isLive).map((session) => (
            <motion.button
              key={session.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/room/${session.id}`)}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors ${
                isInRoom && location.pathname.includes(session.id)
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
              }`}
            >
              <div className="w-2 h-2 rounded-full bg-signal-live animate-pulse-live shrink-0" />
              <span className="truncate text-left flex-1">{session.name.split(":")[0]}</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover/item:opacity-100" />
            </motion.button>
          ))}
        </div>
      </nav>
    </div>
  );
};
