import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Paperclip, Download, FileText, FileSpreadsheet, File } from "lucide-react";
import { mockMessages, mockTranscripts, mockDocuments, languages } from "@/data/mockData";

type TabType = "chat" | "transcript" | "docs";

interface UtilityPanelProps {
  isOpen: boolean;
  initialTab?: TabType;
}

const fileIcons: Record<string, React.ElementType> = {
  PDF: FileText,
  PPTX: FileSpreadsheet,
  DOCX: File,
};

export const UtilityPanel = ({ isOpen, initialTab = "chat" }: UtilityPanelProps) => {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [chatInput, setChatInput] = useState("");
  const [selectedLang, setSelectedLang] = useState("English");

  const tabs: { id: TabType; label: string }[] = [
    { id: "chat", label: "Chat" },
    { id: "transcript", label: "Transcript" },
    { id: "docs", label: "Docs" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 340, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
          className="h-full border-l border-border bg-card flex flex-col overflow-hidden shrink-0"
        >
          {/* Tabs */}
          <div className="flex border-b border-border">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 text-xs font-medium uppercase tracking-wider transition-colors ${
                  activeTab === tab.id
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {activeTab === "chat" && (
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                  {mockMessages.map((msg) => (
                    <div key={msg.id} className={`${msg.isSystem ? "flex justify-center py-2" : "group flex flex-col gap-0.5 p-2 rounded-lg hover:bg-surface-hover transition-colors"}`}>
                      {msg.isSystem ? (
                        <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                          {msg.text}
                        </span>
                      ) : (
                        <>
                          <div className="flex justify-between items-center">
                            <span className={`text-[10px] font-mono uppercase tracking-widest ${
                              msg.role === "teacher" ? "text-signal-recording" : msg.role === "ta" ? "text-primary" : "text-muted-foreground"
                            }`}>
                              {msg.sender}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">{msg.timestamp}</span>
                          </div>
                          <p className="text-sm text-foreground/90 leading-snug">{msg.text}</p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "transcript" && (
              <div className="flex flex-col h-full">
                <div className="p-3 border-b border-border flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Translate to:</span>
                  <select
                    value={selectedLang}
                    onChange={(e) => setSelectedLang(e.target.value)}
                    className="bg-muted text-foreground text-xs rounded-md px-2 py-1 border border-border outline-none focus:ring-1 focus:ring-primary"
                  >
                    {languages.map((lang) => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                  <div className="ml-auto flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-signal-success animate-pulse-live" />
                    <span className="text-[10px] font-mono text-signal-success">LIVE</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {mockTranscripts.map((entry) => (
                    <div key={entry.id} className="group flex flex-col gap-1 p-3 border-b border-border/50 hover:bg-surface-hover transition-colors">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-primary">{entry.speaker}</span>
                        <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{entry.timestamp}</span>
                      </div>
                      <p className="text-sm text-foreground/90 leading-snug">{entry.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "docs" && (
              <div className="p-3 space-y-1">
                {mockDocuments.map((doc) => {
                  const FileIcon = fileIcons[doc.type] || File;
                  return (
                    <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer group">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileIcon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{doc.name}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">
                          {doc.type} · {doc.size} · {doc.sharedBy}
                        </p>
                      </div>
                      <Download className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  );
                })}

                <button className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors text-sm">
                  <Paperclip className="w-4 h-4" />
                  Share Document
                </button>
              </div>
            )}
          </div>

          {/* Chat input */}
          {activeTab === "chat" && (
            <div className="p-3 border-t border-border">
              <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                <Paperclip className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors shrink-0" />
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Send a message..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                <button className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors shrink-0">
                  <Send className="w-3.5 h-3.5 text-primary-foreground" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
