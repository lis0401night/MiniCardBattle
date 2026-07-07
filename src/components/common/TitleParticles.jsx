import { useEffect, useState } from 'react';

export default function TitleParticles() {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    // 40個のパーティクルを生成（火の粉と妖精の粒子をミックス）
    const particleCount = 40;
    const newParticles = [];

    for (let i = 0; i < particleCount; i++) {
      const size = Math.random() * 8 + 3; // 3px 〜 11px
      const left = Math.random() * 100; // 横幅の 0% 〜 100%
      const durationFloat = Math.random() * 5 + 4; // 浮上にかかる時間 4s 〜 9s
      const delay = Math.random() * 5; // アニメーション開始までの遅延 0s 〜 5s
      const durationSway = Math.random() * 3 + 2; // 揺れる速度 2s 〜 5s
      const isFairy = Math.random() > 0.5; // 半分は青白い妖精の粒子に、半分はオレンジの火の粉に

      const color = isFairy
        ? 'radial-gradient(circle, rgba(180,230,255,0.9) 0%, rgba(100,180,255,0) 70%)'
        : 'radial-gradient(circle, rgba(255,215,0,0.9) 0%, rgba(255,80,0,0) 70%)';

      newParticles.push({
        id: i,
        size,
        left,
        durationFloat,
        durationSway,
        delay,
        color,
      });
    }
    setParticles(newParticles);
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            bottom: '-20px',
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: 0,
            animation: `particle-float ${p.durationFloat}s ease-in infinite ${p.delay}s`,
          }}
        >
          {/* 内部のdivで横揺れ（sway）を担当 */}
          <div
            style={{
              width: '100%',
              height: '100%',
              background: p.color,
              borderRadius: '50%',
              mixBlendMode: 'screen',
              filter: 'blur(1px)',
              animation: `particle-sway ${p.durationSway}s ease-in-out infinite alternate`,
            }}
          />
        </div>
      ))}
    </div>
  );
}
