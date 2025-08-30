import { motion } from "framer-motion";
import earthGlobe from "./assets/earth-globe.png";

export default function HomeScreen() {
  return (
    <div className="relative h-screen w-screen overflow-hidden flex items-center justify-center">
      {/* Rotating globe background */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.img
          src={earthGlobe}
          alt="Earth Globe"
          className="w-[120%] max-w-none opacity-50"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 60, ease: "linear" }}
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/40" />
      </div>

      {/* Centered Glassmorphism Card */}
      <div className="relative z-10 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="backdrop-blur-xl bg-white/20 rounded-2xl shadow-lg p-8 max-w-lg text-center"
        >
          <h1 className="text-3xl md:text-5xl font-bold text-white drop-shadow">
            Making Ocean Data Talk
          </h1>
          <p className="mt-4 text-base md:text-lg text-white/80">
            Explore, analyze, and visualize oceanic datasets like never before.
          </p>

          <button className="mt-6 px-6 py-3 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium shadow-md hover:scale-105 transition-transform duration-300">
            Start Chat
          </button>
        </motion.div>
      </div>
    </div>
  );
}
