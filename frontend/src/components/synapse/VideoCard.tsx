import { motion } from "framer-motion";
import { Mic, MicOff, Crown, GraduationCap } from "lucide-react";
import { Participant } from "@/data/mockData";

interface VideoCardProps {
  participant: Participant;
  isLarge?: boolean;
}

export const VideoCard = ({ participant, isLarge }: VideoCardProps) => {
  const roleIcon = participant.role === "teacher" ? Crown : participant.role === "ta" ? GraduationCap : null;
  const RoleIcon = roleIcon;

  return (
    <motion.div
      layout
      className={`relative surface-ceramic rounded-xl overflow-hidden ${
        participant.isSpeaking ? "speaking-border" : ""
      } ${isLarge ? "col-span-2 row-span-2" : ""}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
    >
      {/* Video area */}
      <div className={`w-full ${isLarge ? "aspect-video" : "aspect-video"} bg-gradient-to-br from-secondary to-background flex items-center justify-center`}>
        {participant.isCameraOn ? (
          <div className="w-full h-full bg-gradient-to-br from-secondary via-background to-muted flex items-center justify-center">
            <div className={`${isLarge ? "w-24 h-24 text-3xl" : "w-14 h-14 text-lg"} rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-medium text-primary`}>
              {participant.avatar}
            </div>
          </div>
        ) : (
          <div className={`${isLarge ? "w-24 h-24 text-3xl" : "w-14 h-14 text-lg"} rounded-full bg-muted flex items-center justify-center font-medium text-muted-foreground`}>
            {participant.avatar}
          </div>
        )}
      </div>

      {/* Name overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/90 to-transparent px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {RoleIcon && <RoleIcon className="w-3 h-3 text-signal-recording" />}
          <span className="font-mono text-xs text-foreground/90 truncate">{participant.name}</span>
        </div>
        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${participant.isMuted ? "bg-destructive/20" : "bg-signal-success/20"}`}>
          {participant.isMuted ? (
            <MicOff className="w-3 h-3 text-destructive" />
          ) : (
            <Mic className="w-3 h-3 text-signal-success" />
          )}
        </div>
      </div>
    </motion.div>
  );
};
