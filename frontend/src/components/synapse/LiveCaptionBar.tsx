import { motion } from "framer-motion";

export const LiveCaptionBar = () => {
  return (
    <motion.div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 max-w-2xl w-full px-4 z-40"
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="bg-background/80 backdrop-blur-md text-foreground py-3 px-5 rounded-lg text-center text-sm leading-relaxed">
        <span className="text-muted-foreground font-mono text-[10px] mr-2">[DR. CHEN]</span>
        The cell membrane is selectively permeable, meaning it controls what enters and exits the cell...
      </div>
    </motion.div>
  );
};
