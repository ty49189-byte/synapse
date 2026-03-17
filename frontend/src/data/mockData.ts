export interface Session {
  id: string;
  name: string;
  subject: string;
  teacher: string;
  students: number;
  maxStudents: number;
  isLive: boolean;
  isRecording: boolean;
  startTime: string;
  duration: string;
  tags: string[];
}

export interface Participant {
  id: string;
  name: string;
  role: "teacher" | "student" | "ta";
  isMuted: boolean;
  isCameraOn: boolean;
  isSpeaking: boolean;
  avatar: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  role: "teacher" | "student" | "ta";
  text: string;
  timestamp: string;
  isSystem?: boolean;
}

export interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
  language?: string;
}

export interface SharedDocument {
  id: string;
  name: string;
  type: string;
  size: string;
  sharedBy: string;
  timestamp: string;
}

export const mockSessions: Session[] = [
  { id: "bio-101-a", name: "Biology 101: Session A", subject: "Biology", teacher: "Dr. Sarah Chen", students: 42, maxStudents: 60, isLive: true, isRecording: true, startTime: "10:00 AM", duration: "1h 23m", tags: ["Lecture", "Recorded"] },
  { id: "cs-201-b", name: "Computer Science 201", subject: "CS", teacher: "Prof. James Miller", students: 35, maxStudents: 45, isLive: true, isRecording: false, startTime: "11:30 AM", duration: "45m", tags: ["Lab", "Interactive"] },
  { id: "math-301", name: "Linear Algebra 301", subject: "Math", teacher: "Dr. Emily Park", students: 28, maxStudents: 40, isLive: false, isRecording: false, startTime: "2:00 PM", duration: "—", tags: ["Scheduled"] },
  { id: "eng-102", name: "English Literature 102", subject: "English", teacher: "Prof. David Wright", students: 0, maxStudents: 35, isLive: false, isRecording: false, startTime: "3:30 PM", duration: "—", tags: ["Scheduled"] },
  { id: "phys-201", name: "Physics 201: Quantum Mechanics", subject: "Physics", teacher: "Dr. Lisa Zhang", students: 52, maxStudents: 60, isLive: true, isRecording: true, startTime: "9:00 AM", duration: "2h 10m", tags: ["Lecture", "Recorded", "Live Caption"] },
];

export const mockParticipants: Participant[] = [
  { id: "p1", name: "Dr. Sarah Chen", role: "teacher", isMuted: false, isCameraOn: true, isSpeaking: true, avatar: "SC" },
  { id: "p2", name: "Alex Johnson", role: "student", isMuted: true, isCameraOn: true, isSpeaking: false, avatar: "AJ" },
  { id: "p3", name: "Maria Garcia", role: "student", isMuted: true, isCameraOn: true, isSpeaking: false, avatar: "MG" },
  { id: "p4", name: "James Lee", role: "ta", isMuted: true, isCameraOn: true, isSpeaking: false, avatar: "JL" },
  { id: "p5", name: "Priya Patel", role: "student", isMuted: true, isCameraOn: false, isSpeaking: false, avatar: "PP" },
  { id: "p6", name: "Tom Wilson", role: "student", isMuted: true, isCameraOn: true, isSpeaking: false, avatar: "TW" },
  { id: "p7", name: "Yuki Tanaka", role: "student", isMuted: true, isCameraOn: true, isSpeaking: false, avatar: "YT" },
  { id: "p8", name: "Emma Brown", role: "student", isMuted: false, isCameraOn: true, isSpeaking: false, avatar: "EB" },
];

export const mockMessages: ChatMessage[] = [
  { id: "m1", sender: "Dr. Sarah Chen", role: "teacher", text: "Welcome to today's Biology 101 session. We'll be covering cell membrane transport.", timestamp: "10:00 AM" },
  { id: "m2", sender: "System", role: "teacher", text: "Recording started", timestamp: "10:01 AM", isSystem: true },
  { id: "m3", sender: "Alex Johnson", role: "student", text: "Will this be available in the Class Vault later?", timestamp: "10:05 AM" },
  { id: "m4", sender: "Dr. Sarah Chen", role: "teacher", text: "Yes, it will be auto-archived with full transcription.", timestamp: "10:05 AM" },
  { id: "m5", sender: "Maria Garcia", role: "student", text: "Can you explain osmosis vs diffusion again?", timestamp: "10:12 AM" },
  { id: "m6", sender: "James Lee", role: "ta", text: "I've shared a diagram in the Docs tab that might help.", timestamp: "10:13 AM" },
  { id: "m7", sender: "Priya Patel", role: "student", text: "The live translation to Hindi is working great, thank you!", timestamp: "10:15 AM" },
];

export const mockTranscripts: TranscriptEntry[] = [
  { id: "t1", speaker: "Dr. Sarah Chen", text: "Today we're going to explore the fascinating world of cell membrane transport mechanisms.", timestamp: "10:00:12" },
  { id: "t2", speaker: "Dr. Sarah Chen", text: "The cell membrane is selectively permeable, meaning it controls what enters and exits the cell.", timestamp: "10:01:45" },
  { id: "t3", speaker: "Dr. Sarah Chen", text: "There are two main types: passive transport, which requires no energy, and active transport, which does.", timestamp: "10:03:22" },
  { id: "t4", speaker: "Alex Johnson", text: "Is facilitated diffusion considered passive transport?", timestamp: "10:05:10" },
  { id: "t5", speaker: "Dr. Sarah Chen", text: "Excellent question, Alex. Yes, facilitated diffusion is passive because it moves molecules down their concentration gradient.", timestamp: "10:05:30" },
];

export const mockDocuments: SharedDocument[] = [
  { id: "d1", name: "Cell_Membrane_Diagram.pdf", type: "PDF", size: "2.4 MB", sharedBy: "James Lee", timestamp: "10:13 AM" },
  { id: "d2", name: "Transport_Mechanisms.pptx", type: "PPTX", size: "8.1 MB", sharedBy: "Dr. Sarah Chen", timestamp: "10:00 AM" },
  { id: "d3", name: "Lab_Notes_Week5.docx", type: "DOCX", size: "340 KB", sharedBy: "Dr. Sarah Chen", timestamp: "9:55 AM" },
  { id: "d4", name: "Osmosis_Reference.pdf", type: "PDF", size: "1.2 MB", sharedBy: "Maria Garcia", timestamp: "10:14 AM" },
];

export const languages = [
  "English", "Spanish", "French", "German", "Chinese (Mandarin)", "Japanese",
  "Korean", "Hindi", "Arabic", "Portuguese", "Russian", "Italian",
];
