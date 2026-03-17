import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { SessionRail } from "@/components/synapse/SessionRail";
import { SessionHeader } from "@/components/synapse/SessionHeader";
import { VideoCard } from "@/components/synapse/VideoCard";
import { ControlBar } from "@/components/synapse/ControlBar";
import { UtilityPanel } from "@/components/synapse/UtilityPanel";
import { LiveCaptionBar } from "@/components/synapse/LiveCaptionBar";
import { mockSessions, mockParticipants } from "@/data/mockData";

const MeetingRoom = () => {
  const { sessionId } = useParams();
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<"chat" | "transcript" | "docs">("chat");

  const session = useMemo(
    () => mockSessions.find(s => s.id === sessionId) || mockSessions[0],
    [sessionId]
  );

  const teacher = mockParticipants.find(p => p.role === "teacher");
  const others = mockParticipants.filter(p => p.role !== "teacher");

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <SessionRail />

      <div className="flex-1 flex flex-col min-w-0">
        <SessionHeader
          name={session.name}
          students={session.students}
          duration={session.duration}
          isRecording={session.isRecording}
        />

        <div className="flex-1 flex overflow-hidden">
          {/* Main Stage */}
          <div className="flex-1 p-4 pb-24 overflow-y-auto">
            {/* Teacher / Main Speaker */}
            {teacher && (
              <div className="mb-4">
                <VideoCard participant={teacher} isLarge />
              </div>
            )}

            {/* Participant Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {others.map((participant) => (
                <VideoCard key={participant.id} participant={participant} />
              ))}
            </div>
          </div>

          {/* Utility Panel */}
          <UtilityPanel isOpen={isPanelOpen} initialTab={panelTab} />
        </div>
      </div>

      <LiveCaptionBar />
      <ControlBar
        onToggleChat={() => {
          if (isPanelOpen && panelTab === "chat") {
            setIsPanelOpen(false);
          } else {
            setPanelTab("chat");
            setIsPanelOpen(true);
          }
        }}
        onToggleDocs={() => {
          if (isPanelOpen && panelTab === "docs") {
            setIsPanelOpen(false);
          } else {
            setPanelTab("docs");
            setIsPanelOpen(true);
          }
        }}
        isChatOpen={isPanelOpen}
      />
    </div>
  );
};

export default MeetingRoom;
