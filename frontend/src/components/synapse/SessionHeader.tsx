import { Circle, Users, Clock, Wifi } from "lucide-react";

interface SessionHeaderProps {
  name: string;
  students: number;
  duration: string;
  isRecording: boolean;
}

export const SessionHeader = ({ name, students, duration, isRecording }: SessionHeaderProps) => {
  return (
    <div className="h-14 flex items-center justify-between px-4 border-b border-border bg-card/50 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-medium text-foreground">{name}</h1>
        {isRecording && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-signal-live/10 border border-signal-live/20">
            <Circle className="w-2 h-2 fill-signal-live text-signal-live animate-pulse-live" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-signal-live">REC</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          <span className="text-xs font-mono tabular-nums">{students}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <span className="text-xs font-mono tabular-nums">{duration}</span>
        </div>
        <div className="flex items-center gap-1.5 text-signal-success">
          <Wifi className="w-3.5 h-3.5" />
          <span className="text-[10px] font-mono">0.4ms</span>
        </div>
      </div>
    </div>
  );
};
