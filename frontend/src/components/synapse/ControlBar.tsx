import { useState } from "react";
import { motion } from "framer-motion";
import {
  Mic, MicOff, Video, VideoOff, Monitor, Circle,
  PhoneOff, MessageSquare, FileText, Languages,
  Hand, MoreHorizontal, Captions, Users
} from "lucide-react";

interface ControlBarProps {
  onToggleChat: () => void;
  onToggleDocs: () => void;
  isChatOpen: boolean;
}

interface ControlButtonProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  variant?: "default" | "signal" | "destructive";
  onClick?: () => void;
  badge?: string;
}

const ControlButton = ({ icon: Icon, label, active, variant = "default", onClick, badge }: ControlButtonProps) => {
  const baseClasses = "relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors";
  const variantClasses = {
    default: active ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
    signal: "bg-signal-live/20 text-signal-live hover:bg-signal-live/30",
    destructive: "bg-destructive/20 text-destructive hover:bg-destructive/30",
  };

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={`${baseClasses} ${variantClasses[variant]}`}
      onClick={onClick}
      title={label}
    >
      <Icon className="w-5 h-5" />
      {badge && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-signal-live text-[9px] font-mono flex items-center justify-center text-foreground">
          {badge}
        </span>
      )}
    </motion.button>
  );
};

export const ControlBar = ({ onToggleChat, onToggleDocs, isChatOpen }: ControlBarProps) => {
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isCaptionsOn, setIsCaptionsOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  return (
    <motion.div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-2 bg-card/80 backdrop-blur-xl border border-border rounded-2xl shadow-2xl z-50"
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", damping: 20, delay: 0.2 }}
    >
      {/* Media controls */}
      <ControlButton
        icon={isMicOn ? Mic : MicOff}
        label={isMicOn ? "Mute" : "Unmute"}
        active={isMicOn}
        onClick={() => setIsMicOn(!isMicOn)}
      />
      <ControlButton
        icon={isCamOn ? Video : VideoOff}
        label={isCamOn ? "Camera Off" : "Camera On"}
        active={isCamOn}
        onClick={() => setIsCamOn(!isCamOn)}
      />

      <div className="w-px h-6 bg-border mx-1" />

      {/* Feature controls */}
      <ControlButton
        icon={Monitor}
        label="Screen Share"
        active={isScreenSharing}
        onClick={() => setIsScreenSharing(!isScreenSharing)}
      />
      <ControlButton
        icon={Circle}
        label={isRecording ? "Stop Recording" : "Record"}
        variant={isRecording ? "signal" : "default"}
        onClick={() => setIsRecording(!isRecording)}
      />
      <ControlButton
        icon={Captions}
        label="Live Captions"
        active={isCaptionsOn}
        onClick={() => setIsCaptionsOn(!isCaptionsOn)}
      />
      <ControlButton
        icon={Languages}
        label="Translation"
      />
      <ControlButton
        icon={Hand}
        label="Raise Hand"
      />

      <div className="w-px h-6 bg-border mx-1" />

      {/* Panel toggles */}
      <ControlButton
        icon={MessageSquare}
        label="Chat"
        active={isChatOpen}
        onClick={onToggleChat}
        badge="3"
      />
      <ControlButton
        icon={FileText}
        label="Documents"
        onClick={onToggleDocs}
      />
      <ControlButton
        icon={Users}
        label="Participants"
        badge="42"
      />
      <ControlButton
        icon={MoreHorizontal}
        label="More"
      />

      <div className="w-px h-6 bg-border mx-1" />

      <ControlButton
        icon={PhoneOff}
        label="Leave Session"
        variant="destructive"
      />
    </motion.div>
  );
};
