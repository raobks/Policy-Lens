import React, { useMemo } from "react";

export const Particles: React.FC = () => {
  const particles = useMemo(() =>
    Array.from({ length: 18 }, (_, i) => ({
      id: i,
      size: Math.random() * 3 + 1,
      left: Math.random() * 100,
      opacity: Math.random() * 0.3 + 0.05,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * 15,
    })), []);

  return (
    <div className="particles-wrap">
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.left}%`,
            background: `rgba(0,212,255,${p.opacity})`,
            boxShadow: `0 0 ${p.size * 3}px rgba(0,212,255,0.4)`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
};
